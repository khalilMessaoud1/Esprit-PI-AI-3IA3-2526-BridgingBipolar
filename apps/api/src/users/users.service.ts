import { Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
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
}
