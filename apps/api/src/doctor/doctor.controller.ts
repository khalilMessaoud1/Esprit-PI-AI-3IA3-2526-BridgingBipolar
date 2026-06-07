import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/user.decorator";
import { DoctorService } from "./doctor.service";
import { DoctorNoteBodyDto } from "./dto/doctor-note-body.dto";
import { AppointmentStatusDto } from "./dto/appointment-status.dto";

@Controller("doctor")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorController {
  constructor(private readonly doctor: DoctorService) {}

  @Get("patients")
  listPatients(@CurrentUser() user: { id: string }) {
    return this.doctor.listPatients(user.id);
  }

  @Get("patients/:patientId")
  getPatient(@CurrentUser() user: { id: string }, @Param("patientId") patientId: string) {
    return this.doctor.getPatientDetail(user.id, patientId);
  }

  @Post("patients/:patientId/request-questionnaire")
  requestQuestionnaire(@CurrentUser() user: { id: string }, @Param("patientId") patientId: string) {
    return this.doctor.requestPatientQuestionnaire(user.id, patientId);
  }

  @Post("patients/:patientId/notes")
  addNote(
    @CurrentUser() user: { id: string },
    @Param("patientId") patientId: string,
    @Body() dto: DoctorNoteBodyDto
  ) {
    return this.doctor.addNote(user.id, patientId, dto.body);
  }

  @Get("appointments")
  listAppts(@CurrentUser() user: { id: string }) {
    return this.doctor.listDoctorAppointments(user.id);
  }

  @Patch("appointments/:id")
  setStatus(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() dto: AppointmentStatusDto) {
    return this.doctor.setAppointmentStatus(user.id, id, dto.status);
  }
}
