import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createUser(data: {
    name: string;
    email: string;
    passwordHash: string;
    language: string;
    role?: UserRole;
    birthDate: Date;
    age: number;
    supervisorPhone?: string;
    linkedDoctorId?: string;
  }) {
    const role = data.role ?? UserRole.PATIENT;
    const firstLogin = role === UserRole.PATIENT;
    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        language: data.language,
        role,
        firstLogin,
        birthDate: data.birthDate,
        age: data.age,
        supervisorPhone: data.supervisorPhone || null,
        linkedDoctorId: data.linkedDoctorId || null
      }
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async updateFirstLogin(userId: string, firstLogin: boolean) {
    return this.prisma.user.update({ where: { id: userId }, data: { firstLogin } });
  }

  async updateLanguage(userId: string, language: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { language } });
  }

  async updateProfile(
    userId: string,
    data: { name?: string; email?: string; language?: string; avatarUrl?: string | null; age?: number | null; bio?: string | null }
  ) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  /** Returns the patient code displayed in their profile: "BB-" + first 8 hex chars of UUID. */
  patientCodeFromId(id: string): string {
    return `BB-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }

  /** Find a user by their BB-XXXXXXXX code for any role (PATIENT or DOCTOR). */
  async findByPatientCode(code: string, role: UserRole = UserRole.PATIENT) {
    const prefix = code.replace(/^BB-/i, "").toLowerCase();
    if (prefix.length !== 8 || !/^[0-9a-f]+$/.test(prefix)) return null;
    const users = await this.prisma.user.findMany({
      where: { role },
      select: { id: true, name: true, email: true }
    });
    return users.find(u => u.id.toLowerCase().startsWith(prefix)) ?? null;
  }

  /** Link a RELATIVE to a patient by storing the patient's ID in supervisorPhone. */
  async linkRelativeToPatient(relativeId: string, patientId: string) {
    return this.prisma.user.update({ where: { id: relativeId }, data: { supervisorPhone: patientId } });
  }

  /** Get the patient linked to a relative (stored in supervisorPhone as UUID). */
  async getLinkedPatient(relativeId: string) {
    const relative = await this.prisma.user.findUnique({ where: { id: relativeId } });
    if (!relative?.supervisorPhone || relative.supervisorPhone.length < 30) return null;
    return this.prisma.user.findFirst({
      where: { id: relative.supervisorPhone, role: "PATIENT" },
      select: {
        id: true, name: true, email: true, age: true,
        moodEntries: { orderBy: { createdAt: "desc" }, take: 5 },
        assessments: { orderBy: { createdAt: "desc" }, take: 6 },
        mouseBehaviorLogs: { orderBy: { date: "desc" }, take: 1 }
      }
    });
  }

  toPublicUser(user: any) {
    const birth =
      user.birthDate instanceof Date
        ? user.birthDate.toISOString().slice(0, 10)
        : user.birthDate
          ? String(user.birthDate).slice(0, 10)
          : null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      supervisorPhone: user.supervisorPhone ?? null,
      birthDate: birth,
      age: user.age,
      bio: user.bio,
      role: user.role,
      firstLogin: user.firstLogin,
      language: user.language,
      createdAt: user.createdAt
    };
  }

  /** RELATIVE accounts linked to this patient (supervisorPhone stores patient UUID). */
  async findLinkedRelatives(patientId: string) {
    return this.prisma.user.findMany({
      where: { role: UserRole.RELATIVE, supervisorPhone: patientId },
      select: { id: true, name: true, email: true }
    });
  }

  /** Notify linked relatives in-app when patient sends a crisis message (once per 24h per patient). */
  async notifyLinkedRelativesOfCrisis(patientId: string, patientName: string) {
    try {
      const relatives = await this.findLinkedRelatives(patientId);
      if (relatives.length === 0) {
        return { companionNotified: false, relativeCount: 0 };
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await this.prisma.companionCrisisAlert.findFirst({
        where: { patientId, createdAt: { gte: since } }
      });
      if (recent) {
        return { companionNotified: true, relativeCount: relatives.length };
      }

      const safeName = (patientName || "Patient").trim().slice(0, 80) || "Patient";
      await this.prisma.companionCrisisAlert.createMany({
        data: relatives.map((r) => ({
          patientId,
          relativeId: r.id,
          patientName: safeName
        }))
      });
      return { companionNotified: true, relativeCount: relatives.length };
    } catch (err) {
      this.logger.error(
        `Companion crisis alert failed for patient ${patientId}: ${err instanceof Error ? err.message : String(err)}`
      );
      return { companionNotified: false, relativeCount: 0 };
    }
  }

  async listCompanionCrisisAlertsForRelative(relativeId: string, limit = 10) {
    try {
      return await this.prisma.companionCrisisAlert.findMany({
        where: { relativeId },
        orderBy: { createdAt: "desc" },
        take: limit
      });
    } catch (err) {
      this.logger.warn(
        `listCompanionCrisisAlertsForRelative failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  }

  async markCompanionCrisisAlertsRead(relativeId: string, ids?: string[]) {
    try {
      const where =
        ids && ids.length > 0
          ? { relativeId, id: { in: ids }, readAt: null }
          : { relativeId, readAt: null };
      await this.prisma.companionCrisisAlert.updateMany({
        where,
        data: { readAt: new Date() }
      });
    } catch (err) {
      this.logger.warn(
        `markCompanionCrisisAlertsRead failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return { ok: true };
  }
}
