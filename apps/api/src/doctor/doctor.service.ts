import { Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DoctorService {
  constructor(private readonly prisma: PrismaService) {}

  patientStatus(latestMood: number | null): "stable" | "manic" | "critical" {
    if (latestMood === null) return "stable";
    if (latestMood >= 2 || latestMood <= -2) return "critical";
    if (latestMood >= 1 || latestMood <= -1) return "manic";
    return "stable";
  }

  async listPatients(doctorId: string) {
    // Patients linked to this doctor at signup
    const linkedPatientIds = await this.prisma.user.findMany({
      where: { role: UserRole.PATIENT, linkedDoctorId: doctorId },
      select: { id: true }
    });
    // Patients who booked an appointment with this doctor (secondary link)
    const apptPatientRows = await this.prisma.appointment.findMany({
      where: { doctorId },
      select: { patientId: true },
      distinct: ["patientId"]
    });
    const allIds = new Set([
      ...linkedPatientIds.map(p => p.id),
      ...apptPatientRows.map(r => r.patientId)
    ]);

    if (allIds.size === 0) return { items: [] };

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...allIds] }, role: UserRole.PATIENT },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        age: true,
        moodEntries: { orderBy: { createdAt: "desc" }, take: 1, select: { moodLevel: true } }
      }
    });
    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        age: u.age,
        status: this.patientStatus(u.moodEntries[0]?.moodLevel ?? null)
      }))
    };
  }

  async getPatientDetail(doctorId: string, patientId: string) {
    const patient = await this.prisma.user.findFirst({
      where: { id: patientId, role: UserRole.PATIENT },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        age: true,
        bio: true,
        createdAt: true,
        moodEntries: { orderBy: { createdAt: "desc" }, take: 40 },
        medications: { orderBy: { createdAt: "desc" } },
        assessments: { orderBy: { createdAt: "desc" }, take: 30 },
        activityLogs: { orderBy: { createdAt: "desc" }, take: 120 },
        mouseBehaviorLogs: { orderBy: { date: "desc" }, take: 30 }
      }
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const notes = await this.prisma.doctorNote.findMany({
      where: { doctorId, patientId },
      orderBy: { createdAt: "desc" },
      take: 80
    });

    const appointments = await this.prisma.appointment.findMany({
      where: { doctorId, patientId },
      orderBy: { startAt: "asc" },
      take: 20
    });

    const voiceAssistantMsgs = await this.prisma.companionMessage.findMany({
      where: {
        role: "assistant",
        thread: { userId: patientId }
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, createdAt: true, metadata: true, content: true, threadId: true }
    });

    const latestVoiceXai = voiceAssistantMsgs.find((m) => {
      if (!m.metadata || typeof m.metadata !== "object") return false;
      const meta = m.metadata as Record<string, unknown>;
      return meta.kind === "voice_assistant";
    });

    let voiceTranscript: string | undefined;
    if (latestVoiceXai?.threadId) {
      const prevUser = await this.prisma.companionMessage.findFirst({
        where: {
          threadId: latestVoiceXai.threadId,
          role: "user",
          createdAt: { lte: latestVoiceXai.createdAt }
        },
        orderBy: { createdAt: "desc" },
        select: { content: true }
      });
      voiceTranscript = prevUser?.content ?? undefined;
    }

    let voiceXaiReport:
      | {
          createdAt: Date;
          model: string;
          phase?: string;
          rawPhase?: string;
          confidence?: number;
          monitorReached?: boolean;
          errorHint?: string;
          caption?: string;
          frequencySummary?: Record<string, number>;
          waveformPngB64?: string;
          spectrogramPngB64?: string;
          transcript?: string;
          assistantReply?: string;
        }
      | null = null;
    if (latestVoiceXai?.metadata && typeof latestVoiceXai.metadata === "object") {
      const meta = latestVoiceXai.metadata as Record<string, unknown>;
      const mood = meta.voice_mood && typeof meta.voice_mood === "object" ? (meta.voice_mood as Record<string, unknown>) : {};
      const xai = meta.xai && typeof meta.xai === "object" ? (meta.xai as Record<string, unknown>) : {};
      const freq =
        xai.frequency_summary && typeof xai.frequency_summary === "object"
          ? (xai.frequency_summary as Record<string, number>)
          : undefined;
      const wf = xai.waveform_png_b64;
      const sp = xai.spectrogram_png_b64;
      voiceXaiReport = {
        createdAt: latestVoiceXai.createdAt,
        model: String(meta.model || "bipolar_phase_monitor"),
        phase: mood.phase != null ? String(mood.phase) : undefined,
        rawPhase: mood.raw_phase != null ? String(mood.raw_phase) : undefined,
        confidence: typeof mood.confidence === "number" ? mood.confidence : undefined,
        monitorReached: typeof mood.monitor_reached === "boolean" ? mood.monitor_reached : undefined,
        errorHint: mood.error_hint != null ? String(mood.error_hint) : undefined,
        caption: xai.caption != null ? String(xai.caption) : undefined,
        frequencySummary: freq,
        waveformPngB64: typeof wf === "string" ? wf : undefined,
        spectrogramPngB64: typeof sp === "string" ? sp : undefined,
        transcript: voiceTranscript,
        assistantReply: latestVoiceXai.content ?? undefined
      };
    }

    const latestSleepReportLog = patient.activityLogs.find(
      (a) =>
        typeof a.activityNotes === "string" &&
        (a.activityNotes.startsWith("[SLEEP_ACTIVITY_REPORT_JSON]") ||
          a.activityNotes.startsWith("[SLEEP_ACTIVITY_REPORT]"))
    );

    type SleepReportOut =
      | {
          createdAt: Date;
          format: "structured";
          riskLevel: string;
          alert: boolean;
          anomalyScore?: number;
          reconstructionError?: number;
          globalThreshold?: number;
          features?: Record<string, number>;
          narrative?: string;
        }
      | {
          createdAt: Date;
          format: "legacy";
          rawText: string;
        };

    let sleepActivityReport: SleepReportOut | null = null;
    if (latestSleepReportLog?.activityNotes) {
      const raw = latestSleepReportLog.activityNotes;
      const createdAt = latestSleepReportLog.createdAt;
      if (raw.startsWith("[SLEEP_ACTIVITY_REPORT_JSON]")) {
        try {
          const parsed = JSON.parse(raw.slice("[SLEEP_ACTIVITY_REPORT_JSON]".length).trim()) as Record<string, unknown>;
          sleepActivityReport = {
            createdAt,
            format: "structured",
            riskLevel: String(parsed.risk_level ?? ""),
            alert: Boolean(parsed.alert),
            anomalyScore: typeof parsed.anomaly_score === "number" ? parsed.anomaly_score : undefined,
            reconstructionError:
              typeof parsed.reconstruction_error === "number" ? parsed.reconstruction_error : undefined,
            globalThreshold: typeof parsed.global_threshold === "number" ? parsed.global_threshold : undefined,
            features:
              parsed.features && typeof parsed.features === "object" && !Array.isArray(parsed.features)
                ? (parsed.features as Record<string, number>)
                : undefined,
            narrative: typeof parsed.llm_report === "string" ? parsed.llm_report : undefined
          };
        } catch {
          sleepActivityReport = { createdAt, format: "legacy", rawText: raw };
        }
      } else {
        sleepActivityReport = {
          createdAt,
          format: "legacy",
          rawText: raw.replace("[SLEEP_ACTIVITY_REPORT]", "").trim()
        };
      }
    }

    // ── Voice history (all sessions with voice_mood metadata) ────────────────
    const voiceHistory = voiceAssistantMsgs
      .filter((m) => {
        if (!m.metadata || typeof m.metadata !== "object") return false;
        const meta = m.metadata as Record<string, unknown>;
        return meta.kind === "voice_assistant" && meta.voice_mood;
      })
      .map((m) => {
        const meta = m.metadata as Record<string, unknown>;
        const mood = meta.voice_mood && typeof meta.voice_mood === "object"
          ? (meta.voice_mood as Record<string, unknown>) : {};
        return {
          createdAt: m.createdAt,
          phase: mood.phase != null ? String(mood.phase) : undefined,
          confidence: typeof mood.confidence === "number" ? mood.confidence : undefined,
          monitorReached: typeof mood.monitor_reached === "boolean" ? mood.monitor_reached : undefined,
          errorHint: mood.error_hint != null ? String(mood.error_hint) : undefined
        };
      });

    // ── Sleep/activity history (all saved reports) ───────────────────────────
    const sleepHistory = patient.activityLogs
      .filter((a) => typeof a.activityNotes === "string" && a.activityNotes.startsWith("[SLEEP_ACTIVITY_REPORT_JSON]"))
      .map((a) => {
        try {
          const parsed = JSON.parse(a.activityNotes!.slice("[SLEEP_ACTIVITY_REPORT_JSON]".length).trim()) as Record<string, unknown>;
          return {
            createdAt: a.createdAt,
            riskLevel: String(parsed.risk_level ?? ""),
            alert: Boolean(parsed.alert),
            anomalyScore: typeof parsed.anomaly_score === "number" ? parsed.anomaly_score : undefined
          };
        } catch { return null; }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // ── Handwriting history (all saved sessions) ─────────────────────────────
    const handwritingHistory = patient.activityLogs
      .filter((a) => typeof a.activityNotes === "string" && a.activityNotes.startsWith("[HANDWRITING_RESULT_JSON]"))
      .map((a) => {
        try {
          const parsed = JSON.parse(a.activityNotes!.slice("[HANDWRITING_RESULT_JSON]".length).trim()) as Record<string, unknown>;
          return {
            createdAt: a.createdAt,
            date: String(parsed.date ?? ""),
            phase: String(parsed.phase ?? "baseline"),
            state: String(parsed.state ?? "unknown"),
            alertConfirmed: Boolean(parsed.alert_confirmed),
            alertJ1: Boolean(parsed.alert_j1),
            clinicalLabel: typeof parsed.clinical_label === "string" ? parsed.clinical_label : undefined,
            statusLabel: typeof parsed.status_label === "string" ? parsed.status_label : undefined,
            score: typeof parsed.score === "number" ? parsed.score : undefined,
            threshold: typeof parsed.threshold === "number" ? parsed.threshold : undefined,
            nBaseline: typeof parsed.n_baseline === "number" ? parsed.n_baseline : undefined,
            directionPrediction: typeof parsed.direction_prediction === "string" ? parsed.direction_prediction : undefined
          };
        } catch { return null; }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return { patient, notes, appointments, reports: { voiceXaiReport, sleepActivityReport, voiceHistory, sleepHistory, handwritingHistory } };
  }

  async addNote(doctorId: string, patientId: string, body: string) {
    const p = await this.prisma.user.findFirst({ where: { id: patientId, role: UserRole.PATIENT } });
    if (!p) throw new NotFoundException("Patient not found");
    return this.prisma.doctorNote.create({ data: { doctorId, patientId, body } });
  }

  async listDoctorAppointments(doctorId: string) {
    return this.prisma.appointment.findMany({
      where: { doctorId },
      orderBy: { startAt: "asc" },
      include: { patient: { select: { id: true, name: true, email: true, avatarUrl: true } } }
    });
  }

  async setAppointmentStatus(doctorId: string, id: string, status: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, doctorId } });
    if (!appt) throw new NotFoundException("Appointment not found");
    return this.prisma.appointment.update({ where: { id }, data: { status } });
  }
}
