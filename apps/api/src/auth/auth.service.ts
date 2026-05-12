import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import { UsersService } from "../users/users.service";
import { ForgotPasswordDto, LoginDto, ResetPasswordDto, SignupDto } from "./auth.dto";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private parseBirthDate(iso: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) throw new BadRequestException("birthDate must be YYYY-MM-DD.");
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new BadRequestException("Invalid birthDate.");
    const birth = new Date(Date.UTC(y, mo - 1, d));
    if (Number.isNaN(birth.getTime())) throw new BadRequestException("Invalid birthDate.");
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (birth > todayUtc) throw new BadRequestException("birthDate cannot be in the future.");
    if (y < 1900) throw new BadRequestException("birthDate is not valid.");
    return birth;
  }

  private ageFromBirthDateUtc(birth: Date): number {
    const t = new Date();
    let age = t.getUTCFullYear() - birth.getUTCFullYear();
    const md = t.getUTCMonth() - birth.getUTCMonth();
    if (md < 0 || (md === 0 && t.getUTCDate() < birth.getUTCDate())) {
      age -= 1;
    }
    return age;
  }

  /** Accept local Tunisian digits and normalize to E.164 (+216...). */
  private normalizeSupervisorPhone(raw?: string): string | undefined {
    const v = String(raw || "").trim();
    if (!v) return undefined;
    const compact = v.replace(/\s+/g, "");
    if (compact.startsWith("+")) {
      return compact;
    }
    return `+216${compact.replace(/^0+/, "")}`;
  }

  /** Find user by their BB-XXXXXXXX code (public — no auth required). */
  async findByCode(code: string, forRole: "PATIENT" | "DOCTOR") {
    const role = forRole === "DOCTOR" ? UserRole.DOCTOR : UserRole.PATIENT;
    return this.usersService.findByPatientCode(code, role);
  }

  async signup(dto: SignupDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role: UserRole =
      dto.role === "DOCTOR" ? UserRole.DOCTOR : dto.role === "RELATIVE" ? UserRole.RELATIVE : UserRole.PATIENT;
    const supervisorPhone = this.normalizeSupervisorPhone(dto.supervisorPhone);
    if (role === UserRole.PATIENT && !supervisorPhone) {
      throw new BadRequestException("supervisorPhone is required for patient signup.");
    }
    const birthDate = this.parseBirthDate(dto.birthDate);
    const age = this.ageFromBirthDateUtc(birthDate);
    if (age < 0 || age > 130) throw new BadRequestException("birthDate is not valid.");

    // Resolve linkedCode for PATIENT (doctor code) or RELATIVE (patient code)
    let linkedDoctorId: string | undefined;
    let linkedPatientIdForRelative: string | undefined;
    if (dto.linkedCode) {
      if (role === UserRole.PATIENT) {
        const doc = await this.usersService.findByPatientCode(dto.linkedCode, UserRole.DOCTOR);
        if (!doc) throw new BadRequestException("Doctor code not found.");
        linkedDoctorId = doc.id;
      } else if (role === UserRole.RELATIVE) {
        const pat = await this.usersService.findByPatientCode(dto.linkedCode, UserRole.PATIENT);
        if (!pat) throw new BadRequestException("Patient code not found.");
        linkedPatientIdForRelative = pat.id;
      }
    }

    const user = await this.usersService.createUser({
      name: dto.name,
      email: dto.email,
      passwordHash,
      language: dto.language || "en",
      role,
      birthDate,
      age,
      supervisorPhone,
      linkedDoctorId
    });

    // Link relative → patient via supervisorPhone (existing mechanism)
    if (role === UserRole.RELATIVE && linkedPatientIdForRelative) {
      await this.usersService.linkRelativeToPatient(user.id, linkedPatientIdForRelative);
    }

    const token = await this.jwtService.signAsync({ sub: user.id, email: user.email, role: user.role });
    return { token, user: this.usersService.toPublicUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    const token = await this.jwtService.signAsync({ sub: user.id, email: user.email, role: user.role });
    return { token, user: this.usersService.toPublicUser(user) };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return { ok: true };
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    return {
      ok: true,
      resetToken: rawToken
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = createHash("sha256").update(dto.token).digest("hex");
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    if (!record) {
      throw new UnauthorizedException("Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.usersService.updatePassword(record.userId, passwordHash);
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    });

    return { ok: true };
  }
}
