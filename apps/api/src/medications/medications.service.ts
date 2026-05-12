import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
}
