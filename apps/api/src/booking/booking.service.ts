import { Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

  async listDoctors(patientId?: string) {
    const doctors = await this.prisma.user.findMany({
      where: { role: UserRole.DOCTOR },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, avatarUrl: true, bio: true }
    });
    if (!patientId) return doctors;
    // Put the patient's linked doctor first
    const patient = await this.prisma.user.findUnique({ where: { id: patientId }, select: { linkedDoctorId: true } });
    const linkedId = patient?.linkedDoctorId;
    if (!linkedId) return doctors;
    return [...doctors.filter(d => d.id === linkedId), ...doctors.filter(d => d.id !== linkedId)];
  }

  async bookAppointment(patientId: string, doctorId: string, startAt: Date, endAt: Date) {
    const doctor = await this.prisma.user.findFirst({ where: { id: doctorId, role: UserRole.DOCTOR } });
    if (!doctor) throw new NotFoundException("Doctor not found");
    const appt = await this.prisma.appointment.create({
      data: { patientId, doctorId, startAt, endAt, status: "pending" }
    });
    // If patient has no linked doctor yet, set this as their primary doctor
    const patient = await this.prisma.user.findUnique({ where: { id: patientId }, select: { linkedDoctorId: true } });
    if (!patient?.linkedDoctorId) {
      await this.prisma.user.update({ where: { id: patientId }, data: { linkedDoctorId: doctorId } });
    }
    return appt;
  }

  async listPatientAppointments(patientId: string) {
    return this.prisma.appointment.findMany({
      where: { patientId },
      orderBy: { startAt: "desc" },
      include: { doctor: { select: { id: true, name: true, email: true, avatarUrl: true } } }
    });
  }
}
