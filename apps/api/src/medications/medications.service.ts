import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { MedicationDoseStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const ADHERENCE_REGULAR_THRESHOLD = 0.75;
const GRACE_MINUTES = 60;

export type AdherenceSlotStatus = "pending" | "taken" | "missed";

export type MedicationAdherenceSummary = {
  days: number;
  expectedDoses: number;
  takenDoses: number;
  missedDoses: number;
  pendingDoses: number;
  adherencePercent: number | null;
  regular: boolean | null;
  level: "regular" | "irregular" | "no_meds" | "insufficient_data";
  todaySlots: {
    medicationId: string;
    medicationName: string;
    dosage: string;
    scheduledDate: string;
    scheduledTime: string;
    status: AdherenceSlotStatus;
  }[];
};

function parseMedTimes(timeField: string): string[] {
  return timeField
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(normalizeTime);
}

function normalizeTime(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function slotDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, day] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, day, hh, mm, 0, 0);
}

function isSlotPast(dateStr: string, timeStr: string, graceMinutes = GRACE_MINUTES): boolean {
  return Date.now() - slotDateTime(dateStr, timeStr).getTime() > graceMinutes * 60 * 1000;
}

@Injectable()
export class MedicationsService {
  private readonly logger = new Logger(MedicationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async parsePrescriptionImage(file: { buffer: Buffer; mimetype: string; originalname: string }) {
    const base = (process.env.PRESCRIPTION_SERVICE_URL || "http://127.0.0.1:5020").replace(/\/$/, "");
    const form = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "application/octet-stream" });
    form.append("file", blob, file.originalname || "prescription.jpg");
    const res = await fetch(`${base}/parse`, { method: "POST", body: form });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Prescription service error ${res.status}: ${text.slice(0, 500)}`);
      throw new BadGatewayException(text || "Prescription analysis service unavailable");
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new BadGatewayException("Invalid response from prescription service");
    }
  }

  async create(userId: string, data: { name: string; dosage: string; frequency: string; time: string }) {
    const medication = await this.prisma.medication.create({
      data: { userId, name: data.name, dosage: data.dosage, frequency: data.frequency, time: data.time }
    });
    return { medication };
  }

  async list(userId: string) {
    const items = await this.prisma.medication.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return { items };
  }

  async delete(userId: string, id: string) {
    const med = await this.prisma.medication.findFirst({ where: { id, userId } });
    if (!med) return { deleted: false };
    await this.prisma.medication.delete({ where: { id } });
    return { deleted: true };
  }

  async update(userId: string, id: string, data: { name?: string; dosage?: string; frequency?: string; time?: string }) {
    const med = await this.prisma.medication.findFirst({ where: { id, userId } });
    if (!med) return null;
    return this.prisma.medication.update({ where: { id }, data });
  }

  async logDose(
    userId: string,
    body: { medicationId: string; scheduledDate?: string; scheduledTime: string; status: "taken" | "missed" }
  ) {
    const med = await this.prisma.medication.findFirst({ where: { id: body.medicationId, userId } });
    if (!med) throw new NotFoundException("Medication not found");
    const scheduledDate = body.scheduledDate?.trim() || localDateStr(new Date());
    const scheduledTime = normalizeTime(body.scheduledTime.trim());
    if (!/^\d{2}:\d{2}$/.test(scheduledTime)) {
      throw new BadRequestException("Invalid scheduledTime (use HH:MM)");
    }
    const status = body.status === "taken" ? MedicationDoseStatus.TAKEN : MedicationDoseStatus.MISSED;
    const log = await this.prisma.medicationDoseLog.upsert({
      where: {
        userId_medicationId_scheduledDate_scheduledTime: {
          userId,
          medicationId: body.medicationId,
          scheduledDate,
          scheduledTime
        }
      },
      create: { userId, medicationId: body.medicationId, scheduledDate, scheduledTime, status },
      update: { status }
    });
    return { log };
  }

  async getAdherenceSummary(userId: string, days = 7): Promise<MedicationAdherenceSummary> {
    const medications = await this.prisma.medication.findMany({ where: { userId } });
    if (medications.length === 0) {
      return {
        days,
        expectedDoses: 0,
        takenDoses: 0,
        missedDoses: 0,
        pendingDoses: 0,
        adherencePercent: null,
        regular: null,
        level: "no_meds",
        todaySlots: []
      };
    }

    const today = localDateStr(new Date());
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(localDateStr(d));
    }
    const minDate = dates[dates.length - 1]!;

    const logs = await this.prisma.medicationDoseLog.findMany({
      where: { userId, scheduledDate: { gte: minDate, lte: today } }
    });
    const logMap = new Map(
      logs.map((l) => [`${l.medicationId}|${l.scheduledDate}|${l.scheduledTime}`, l.status] as const)
    );

    let expected = 0;
    let taken = 0;
    let missed = 0;
    let pending = 0;
    const todaySlots: MedicationAdherenceSummary["todaySlots"] = [];

    for (const dateStr of dates) {
      for (const med of medications) {
        const times = parseMedTimes(med.time);
        for (const time of times) {
          expected++;
          const logged = logMap.get(`${med.id}|${dateStr}|${time}`);
          let status: AdherenceSlotStatus;
          if (logged === MedicationDoseStatus.TAKEN) {
            taken++;
            status = "taken";
          } else if (logged === MedicationDoseStatus.MISSED) {
            missed++;
            status = "missed";
          } else if (isSlotPast(dateStr, time)) {
            missed++;
            status = "missed";
          } else {
            pending++;
            status = "pending";
          }
          if (dateStr === today) {
            todaySlots.push({
              medicationId: med.id,
              medicationName: med.name,
              dosage: med.dosage,
              scheduledDate: dateStr,
              scheduledTime: time,
              status
            });
          }
        }
      }
    }

    todaySlots.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

    const counted = taken + missed;
    const adherencePercent = counted > 0 ? Math.round((taken / counted) * 100) : null;
    const regular = adherencePercent !== null ? adherencePercent >= ADHERENCE_REGULAR_THRESHOLD * 100 : null;
    const level =
      counted === 0 ? "insufficient_data" : regular ? "regular" : "irregular";

    return {
      days,
      expectedDoses: expected,
      takenDoses: taken,
      missedDoses: missed,
      pendingDoses: pending,
      adherencePercent,
      regular,
      level,
      todaySlots
    };
  }
}
