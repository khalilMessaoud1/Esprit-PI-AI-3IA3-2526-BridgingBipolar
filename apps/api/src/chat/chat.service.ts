import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ChatRequestDto } from "./dto/chat.dto";

const HISTORY_LIMIT = 20;
const CRISIS_ALERT_THRESHOLD = 3;
const crisisHitCount: Map<string, number> = new Map();

/** Offline safeguard when RAG does not set crisis_support_notified (Redis/crisis pipeline off). */
const CRISIS_TEXT_PATTERNS: RegExp[] = [
  /\bkill\s+my\s*sel\w*\b/i,
  /\bhurt\s+my\s*sel\w*\b/i,
  /\bself[\s-]?harm\b/i,
  /\bsuicid/i,
  /\bend(ing)?\s+my\s+life\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+live\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\btake\s+my\s+life\b/i,
  /\bme\s+suicider\b/i,
  /\bme\s+tuer\b/i,
  /\bme\s+faire\s+du\s+mal\b/i,
  /\bcouteau\b.*\b(blesser|tuer|meurtre)\b|\b(blesser|tuer)\b.*\bcouteau\b/i,
  /\bknife\b.*\b(hurt|kill)\b|\b(hurt|kill)\b.*\bknife\b/i
];

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  /** True when user text strongly suggests imminent self-harm / suicide (English + French). */
  detectSelfHarmInText(text: string): boolean {
    const t = String(text || "").trim();
    if (t.length < 6) return false;
    return CRISIS_TEXT_PATTERNS.some((re) => re.test(t));
  }

  /**
   * RAG `/chat` and `/voice` expect `crisis_parent` for Redis strike counting + Twilio WhatsApp.
   * Patients register a supervisor WhatsApp (E.164); use it when the client omits `crisis_parent`.
   */
  private resolveCrisisParentForRag(
    dtoParent: ChatRequestDto["crisis_parent"],
    user: { name: string; supervisorPhone: string | null }
  ):
    | { parent_whatsapp_e164: string; parent_contact_consent: boolean; display_name: string }
    | undefined {
    const explicitPhone = dtoParent?.parent_whatsapp_e164?.trim();
    const explicitConsent = dtoParent?.parent_contact_consent;
    if (explicitPhone && explicitConsent === false) {
      return undefined;
    }
    if (explicitPhone && (explicitConsent === true || explicitConsent === undefined)) {
      return {
        parent_whatsapp_e164: explicitPhone,
        parent_contact_consent: true,
        display_name: (dtoParent?.display_name ?? user.name).trim() || user.name
      };
    }
    const sup = user.supervisorPhone?.trim();
    if (!sup) return undefined;
    return {
      parent_whatsapp_e164: sup,
      parent_contact_consent: true,
      display_name: user.name.trim() || "User"
    };
  }

  /** After RAG returns: if parent WhatsApp was already sent, skip Nest Twilio (avoid duplicate). */
  private async finalizeCrisisOutbound(
    userId: string,
    patientName: string,
    ragPayload: Record<string, unknown>,
    textCrisis: boolean
  ): Promise<{
    crisis_support_notified: boolean;
    twilio_alert_sent: boolean;
    crisis_strikes?: number;
    crisis_self_harm_turn: boolean;
  }> {
    const ragNotifiedParent = Boolean(ragPayload.crisis_support_notified);
    const strikesRaw = ragPayload.crisis_strikes;
    const crisisStrikes =
      typeof strikesRaw === "number" && Number.isFinite(strikesRaw) ? Math.round(strikesRaw) : undefined;
    let twilioAlertSent = false;
    if (!ragNotifiedParent && textCrisis) {
      twilioAlertSent = await this.handleCrisisEscalation(userId, patientName, true);
    }
    return {
      crisis_support_notified: ragNotifiedParent || twilioAlertSent,
      twilio_alert_sent: twilioAlertSent,
      crisis_strikes: crisisStrikes,
      crisis_self_harm_turn: textCrisis
    };
  }

  /** RAG may suggest opening a Next.js route (e.g. prescription scan, sleep/activities). */
  private pickNavigateToFromRag(data: Record<string, unknown>): string | undefined {
    const n = data.navigate_to ?? data["navigateTo"];
    if (typeof n !== "string") return undefined;
    const t = n.trim();
    if (!t.startsWith("/")) return undefined;
    return t;
  }

  /**
   * Same heuristics as graphrag/companion_navigation.py — runs on Nest so redirects work even
   * if an older RAG build omits `navigate_to` in JSON.
   */
  private detectCompanionNavigatePathFromText(text: string): string | undefined {
    const t = String(text || "").trim();
    if (t.length < 6) return undefined;

    const hasRx = /\b(prescription|ordonnance)\b/i.test(t);
    const hasIntent =
      /trait|traiter|traitement|traitait|traitée|traiter\s+ma|traiter\s+mon|scanner|saisir|saisie|ajouter|upload|télévers|televers|add|scan|parse|analy|fill|enter|remplir|enregistrer|ocr|digit|want\s+to\s+(add|upload|scan|enter|fill|use|trait|traiter)|i\s+have\s+a\s+prescription/i.test(
        t
      );
    if (hasRx && hasIntent) return "/medications/new";

    if (
      /sleep[\s-]?activities|sleep\s+and\s+activities|mood\s+and\s+activities|mood\s+activities|sleep\s+mood|journal\s+(sommeil|d.?activit|activit)|suivi\s+(sommeil|activit)|(sommeil|sleep).*?(activit|journal|suivi|rapport|semaine)|(activit|journal).*?(sommeil|sleep)|week\s+in\s+words|ma\s+semaine|voir\s+mes\s+activit/i.test(
        t
      )
    ) {
      return "/sleep-activities";
    }
    return undefined;
  }

  private resolveNavigateTarget(rag: Record<string, unknown>, userTextForNav: string): string | undefined {
    return this.pickNavigateToFromRag(rag) ?? this.detectCompanionNavigatePathFromText(userTextForNav);
  }

  private ragUrl(): string {
    return (this.config.get<string>("RAG_SERVICE_URL") || "http://127.0.0.1:8090").replace(/\/$/, "");
  }

  private ragKey(): string {
    return this.config.get<string>("RAG_API_KEY") || "";
  }

  private twilioEnabled(): boolean {
    const from = (
      this.config.get<string>("TWILIO_WHATSAPP_FROM") ||
      this.config.get<string>("TWILIO_FROM_PHONE") ||
      ""
    ).trim();
    return Boolean(
      this.config.get<string>("TWILIO_ACCOUNT_SID") &&
      this.config.get<string>("TWILIO_AUTH_TOKEN") &&
      from
    );
  }

  /** Twilio WhatsApp uses "whatsapp:+E164"; SMS uses plain "+E164". */
  private normalizeTwilioTo(toRaw: string, fromRaw: string): string {
    const to = String(toRaw || "").trim();
    const from = String(fromRaw || "").trim().toLowerCase();
    const fromIsWhatsapp = from.startsWith("whatsapp:");
    if (!fromIsWhatsapp) return to;
    if (to.toLowerCase().startsWith("whatsapp:")) return to;
    const plain = to.replace(/^whatsapp:/i, "");
    return `whatsapp:${plain}`;
  }

  private async sendTwilioAlert(toPhone: string, patientName: string): Promise<void> {
    const accountSid = this.config.get<string>("TWILIO_ACCOUNT_SID") || "";
    const authToken = this.config.get<string>("TWILIO_AUTH_TOKEN") || "";
    const fromPhone =
      this.config.get<string>("TWILIO_WHATSAPP_FROM") ||
      this.config.get<string>("TWILIO_FROM_PHONE") ||
      "";
    const toPhoneNormalized = this.normalizeTwilioTo(toPhone, fromPhone);
    const appBase = this.config.get<string>("APP_WEB_URL") || "http://localhost:3001";
    const body = [
      "BridgingBipolar crisis alert.",
      `${patientName} has triggered 3 suicide/self-harm crisis detections in chat.`,
      "Please contact them immediately and seek emergency services if needed.",
      `App: ${appBase}`
    ].join(" ");
    const form = new URLSearchParams();
    form.set("To", toPhoneNormalized);
    form.set("From", fromPhone);
    form.set("Body", body);
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(`Twilio error: ${text || res.status}`);
    }
  }

  private async handleCrisisEscalation(userId: string, patientName: string, crisisDetected: boolean): Promise<boolean> {
    if (!crisisDetected) return false;
    const hits = (crisisHitCount.get(userId) || 0) + 1;
    crisisHitCount.set(userId, hits);
    if (hits < CRISIS_ALERT_THRESHOLD) {
      this.logger.warn(`Crisis hit ${hits}/${CRISIS_ALERT_THRESHOLD} for user ${userId}`);
      return false;
    }
    crisisHitCount.set(userId, 0);
    if (!this.twilioEnabled()) {
      this.logger.warn("Crisis threshold reached but Twilio env vars missing — no SMS sent.");
      return false;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { supervisorPhone: true }
    });
    const phone = user?.supervisorPhone?.trim();
    if (!phone) {
      this.logger.warn(`Crisis threshold reached but user ${userId} has no supervisorPhone — no SMS sent.`);
      return false;
    }
    try {
      await this.sendTwilioAlert(phone, patientName);
      this.logger.warn(`Twilio crisis SMS sent to supervisor for user ${userId}`);
      return true;
    } catch (err) {
      this.logger.error(`Twilio send failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private async postJson(path: string, body: unknown): Promise<unknown> {
    const url = `${this.ragUrl()}${path}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const key = this.ragKey();
    if (key) headers["X-RAG-API-KEY"] = key;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      throw new BadGatewayException(text || `RAG HTTP ${res.status}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BadGatewayException("RAG returned non-JSON");
    }
  }

  async synthesizeTts(text: string, lang?: string): Promise<Buffer> {
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestException("Empty text");
    const url = `${this.ragUrl()}/tts`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const key = this.ragKey();
    if (key) headers["X-RAG-API-KEY"] = key;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: trimmed, lang: lang?.trim() || undefined })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new BadGatewayException(t || `RAG TTS HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async postMultipart(path: string, form: FormData): Promise<unknown> {
    const url = `${this.ragUrl()}${path}`;
    const headers: Record<string, string> = {};
    const key = this.ragKey();
    if (key) headers["X-RAG-API-KEY"] = key;
    const init: RequestInit = { method: "POST", headers, body: form };
    if (path === "/chat/image") {
      const raw = this.config.get<string>("RAG_CHAT_IMAGE_TIMEOUT_MS");
      const ms =
        raw != null && raw.trim() !== "" ? Number(raw.trim()) : 900_000;
      if (Number.isFinite(ms) && ms > 0) {
        init.signal = AbortSignal.timeout(ms);
      }
    }
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) {
      throw new BadGatewayException(text || `RAG HTTP ${res.status}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BadGatewayException("RAG returned non-JSON");
    }
  }

  private compositeSessionId(userId: string, threadId: string): string {
    return `${userId}:${threadId}`;
  }

  private async historyForThread(threadId: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
    const rows = await this.prisma.companionMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      take: HISTORY_LIMIT,
      select: { role: true, content: true }
    });
    const out: { role: "user" | "assistant"; content: string }[] = [];
    for (const r of rows) {
      if (r.role === "user" || r.role === "assistant") {
        out.push({ role: r.role, content: r.content });
      }
    }
    return out;
  }

  async chatText(userId: string, dto: ChatRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, age: true, supervisorPhone: true }
    });
    if (!user) throw new BadRequestException("User not found");

    if (user.age !== null && user.age !== undefined && user.age < 16) {
      throw new ForbiddenException("Text chat is available from age 16. Use voice mode.");
    }

    let threadId = dto.threadId?.trim();
    if (threadId) {
      const t = await this.prisma.companionThread.findFirst({
        where: { id: threadId, userId }
      });
      if (!t) throw new BadRequestException("Invalid threadId");
    } else {
      const t = await this.prisma.companionThread.create({
        data: { userId, title: null }
      });
      threadId = t.id;
    }

    const history = await this.historyForThread(threadId!);
    const sessionId = this.compositeSessionId(userId, threadId!);

    const crisisParentForRag = this.resolveCrisisParentForRag(dto.crisis_parent, user);

    const ragBody = {
      patient_id: userId,
      session_id: sessionId,
      user_id: userId,
      message: dto.message.trim(),
      conversation_history: history,
      user_profile: { name: user.name },
      keystroke_events: dto.keystroke_events,
      keystroke_session: dto.keystroke_session,
      crisis_parent: crisisParentForRag
    };

    const data = (await this.postJson("/chat", ragBody)) as Record<string, unknown>;
    const answer = String(data.answer ?? "");
    const textCrisis = this.detectSelfHarmInText(dto.message.trim());
    const crisisOut = await this.finalizeCrisisOutbound(userId, user.name, data, textCrisis);

    await this.prisma.companionMessage.createMany({
      data: [
        { threadId: threadId!, role: "user", content: dto.message.trim(), metadata: undefined },
        { threadId: threadId!, role: "assistant", content: answer, metadata: undefined }
      ]
    });

    return {
      reply: answer,
      threadId,
      lang: data.lang != null ? String(data.lang) : undefined,
      crisis_support_notified: crisisOut.crisis_support_notified,
      twilio_alert_sent: crisisOut.twilio_alert_sent,
      crisis_strikes: crisisOut.crisis_strikes,
      crisis_self_harm_turn: crisisOut.crisis_self_harm_turn,
      keystroke: data.keystroke,
      navigate_to: this.resolveNavigateTarget(data, dto.message.trim())
    };
  }

  async chatVoice(
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    threadIdInput?: string
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, age: true, supervisorPhone: true }
    });
    if (!user) throw new BadRequestException("User not found");

    let threadId = threadIdInput?.trim();
    if (threadId) {
      const t = await this.prisma.companionThread.findFirst({
        where: { id: threadId, userId }
      });
      if (!t) throw new BadRequestException("Invalid threadId");
    } else {
      const t = await this.prisma.companionThread.create({ data: { userId, title: null } });
      threadId = t.id;
    }

    const history = await this.historyForThread(threadId!);
    const sessionId = this.compositeSessionId(userId, threadId!);

    const form = new FormData();
    const bytes = new Uint8Array(file.buffer);
    const blob = new Blob([bytes], { type: file.mimetype || "application/octet-stream" });
    form.append("file", blob, file.originalname || "recording.webm");
    form.append("patient_id", userId);
    form.append("session_id", sessionId);
    form.append("user_id", userId);
    form.append("conversation_history_json", JSON.stringify(history));
    form.append("user_profile_json", JSON.stringify({ name: user.name }));
    const crisisParentForRag = this.resolveCrisisParentForRag(undefined, user);
    form.append(
      "crisis_parent_json",
      crisisParentForRag ? JSON.stringify(crisisParentForRag) : "null"
    );

    const data = (await this.postMultipart("/voice", form)) as Record<string, unknown>;
    const transcript = String(data.transcript ?? "");
    const answer = String(data.answer ?? "");
    const textCrisis = this.detectSelfHarmInText(transcript);
    const crisisOut = await this.finalizeCrisisOutbound(userId, user.name, data, textCrisis);

    const voiceMood = data.voice_mood;
    const xai = data.xai;
    const voiceMeta: Prisma.InputJsonValue =
      voiceMood && typeof voiceMood === "object"
        ? {
            kind: "voice_assistant",
            model: "bipolar_phase_monitor",
            voice_mood: JSON.parse(JSON.stringify(voiceMood)) as Prisma.JsonValue,
            // Keep only concise XAI fields for doctor report usage (avoid storing huge base64 images).
            xai:
              xai && typeof xai === "object"
                ? (() => {
                    const xa = xai as Record<string, unknown>;
                    const wf = xa.waveform_png_b64;
                    const sp = xa.spectrogram_png_b64;
                    return {
                      caption: String(xa.caption || ""),
                      frequency_summary:
                        xa.frequency_summary && typeof xa.frequency_summary === "object"
                          ? (JSON.parse(JSON.stringify(xa.frequency_summary)) as Prisma.JsonValue)
                          : undefined,
                      waveform_png_b64: typeof wf === "string" ? wf : undefined,
                      spectrogram_png_b64: typeof sp === "string" ? sp : undefined
                    };
                  })()
                : undefined
          }
        : { kind: "voice_assistant", model: "bipolar_phase_monitor" };

    await this.prisma.companionMessage.createMany({
      data: [
        { threadId: threadId!, role: "user", content: transcript, metadata: { kind: "voice" } },
        { threadId: threadId!, role: "assistant", content: answer, metadata: voiceMeta }
      ]
    });

    return {
      reply: answer,
      transcript,
      threadId,
      lang: data.lang != null ? String(data.lang) : undefined,
      voice_mood: data.voice_mood,
      xai: data.xai,
      crisis_support_notified: crisisOut.crisis_support_notified,
      twilio_alert_sent: crisisOut.twilio_alert_sent,
      crisis_strikes: crisisOut.crisis_strikes,
      crisis_self_harm_turn: crisisOut.crisis_self_harm_turn,
      navigate_to: this.resolveNavigateTarget(data, transcript)
    };
  }

  async chatImage(
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    message?: string,
    threadIdInput?: string
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, age: true, supervisorPhone: true }
    });
    if (!user) throw new BadRequestException("User not found");

    let threadId = threadIdInput?.trim();
    if (threadId) {
      const t = await this.prisma.companionThread.findFirst({
        where: { id: threadId, userId }
      });
      if (!t) throw new BadRequestException("Invalid threadId");
    } else {
      const t = await this.prisma.companionThread.create({ data: { userId, title: null } });
      threadId = t.id;
    }

    const history = await this.historyForThread(threadId!);
    const sessionId = this.compositeSessionId(userId, threadId!);

    const form = new FormData();
    const bytes = new Uint8Array(file.buffer);
    const blob = new Blob([bytes], { type: file.mimetype || "application/octet-stream" });
    form.append("file", blob, file.originalname || "photo.jpg");
    form.append("patient_id", userId);
    form.append("session_id", sessionId);
    form.append("user_id", userId);
    if (message) form.append("message", message);
    form.append("conversation_history_json", JSON.stringify(history));
    form.append("user_profile_json", JSON.stringify({ name: user.name }));
    const crisisParentForRag = this.resolveCrisisParentForRag(undefined, user);
    form.append(
      "crisis_parent_json",
      crisisParentForRag ? JSON.stringify(crisisParentForRag) : "null"
    );

    const data = (await this.postMultipart("/chat/image", form)) as Record<string, unknown>;
    const transcript = String(data.transcript ?? "");
    const answer = String(data.answer ?? "");
    const textCrisis = this.detectSelfHarmInText(transcript + " " + (message || ""));
    const crisisOut = await this.finalizeCrisisOutbound(userId, user.name, data, textCrisis);
    const imageCaption = data.image_caption != null ? String(data.image_caption) : undefined;

    await this.prisma.companionMessage.createMany({
      data: [
        {
          threadId: threadId!,
          role: "user",
          content: transcript,
          metadata: { kind: "photo", caption: imageCaption }
        },
        { threadId: threadId!, role: "assistant", content: answer, metadata: undefined }
      ]
    });

    return {
      reply: answer,
      transcript,
      threadId,
      image_caption: imageCaption,
      crisis_support_notified: crisisOut.crisis_support_notified,
      twilio_alert_sent: crisisOut.twilio_alert_sent,
      crisis_strikes: crisisOut.crisis_strikes,
      crisis_self_harm_turn: crisisOut.crisis_self_harm_turn,
      navigate_to: this.resolveNavigateTarget(data, `${message || ""} ${transcript}`.trim())
    };
  }
}
