import { Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/user.decorator";
import { UsersService } from "./users.service";

@Controller("user")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  async me(@CurrentUser() user: { id: string }) {
    const record = await this.usersService.findById(user.id);
    return { user: this.usersService.toPublicUser(record) };
  }

  @Patch("first-login")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  async updateFirstLogin(@CurrentUser() user: { id: string }, @Body() body: { firstLogin: boolean }) {
    const record = await this.usersService.updateFirstLogin(user.id, body.firstLogin);
    return { user: this.usersService.toPublicUser(record) };
  }

  @Patch("language")
  async updateLanguage(@CurrentUser() user: { id: string }, @Body() body: { language: string }) {
    const record = await this.usersService.updateLanguage(user.id, body.language);
    return { user: this.usersService.toPublicUser(record) };
  }

  @Patch("update")
  async updateProfile(
    @CurrentUser() user: { id: string },
    @Body() body: { name?: string; email?: string; language?: string; avatarUrl?: string | null; age?: number | null; bio?: string | null }
  ) {
    const record = await this.usersService.updateProfile(user.id, body);
    return { user: this.usersService.toPublicUser(record) };
  }

  /** Returns this patient's unique code to share with their relative. */
  @Get("patient-code")
  async patientCode(@CurrentUser() user: { id: string }) {
    const record = await this.usersService.findById(user.id);
    return { code: this.usersService.patientCodeFromId(record.id) };
  }

  /** Find a PATIENT by their code (used at relative signup). No auth needed for this lookup. */
  @Get("find-by-code")
  async findByCode(@Query("code") code: string) {
    const patient = await this.usersService.findByPatientCode(code ?? "");
    if (!patient) throw new NotFoundException("No patient found with this code.");
    return { id: patient.id, name: patient.name };
  }

  /** Link a RELATIVE to their patient via patient code. */
  @Patch("link-patient")
  async linkPatient(@CurrentUser() user: { id: string }, @Body() body: { patientId: string }) {
    await this.usersService.linkRelativeToPatient(user.id, body.patientId);
    return { ok: true };
  }

  /** Get the linked patient's clinical state (relative dashboard). */
  @Get("linked-patient-state")
  async linkedPatientState(@CurrentUser() user: { id: string }) {
    const patient = await this.usersService.getLinkedPatient(user.id);
    if (!patient) return { patient: null };
    const latestMood = patient.moodEntries[0]?.moodLevel ?? null;
    const ymrs = patient.assessments.find((a: { type: string }) => a.type === "YMRS");
    const hdrs = patient.assessments.find((a: { type: string }) => a.type === "HDRS");
    const mouse = patient.mouseBehaviorLogs[0] ?? null;
    const crisisAlerts = await this.usersService.listCompanionCrisisAlertsForRelative(user.id, 5);
    const unreadCrisisCount = crisisAlerts.filter((a) => !a.readAt).length;
    return {
      patient: {
        id: patient.id,
        name: patient.name,
        latestMood,
        latestYmrs: ymrs?.score ?? null,
        latestHdrs: hdrs?.score ?? null,
        mouseState: mouse?.state ?? null,
        mouseScore: mouse?.score ?? null
      },
      crisisAlerts: crisisAlerts.map((a) => ({
        id: a.id,
        patientName: a.patientName,
        createdAt: a.createdAt,
        read: Boolean(a.readAt)
      })),
      unreadCrisisCount
    };
  }

  /** Crisis alerts for linked patient (RELATIVE dashboard). */
  @Get("companion-crisis-alerts")
  async companionCrisisAlerts(@CurrentUser() user: { id: string }) {
    const alerts = await this.usersService.listCompanionCrisisAlertsForRelative(user.id, 20);
    return {
      items: alerts.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        patientName: a.patientName,
        createdAt: a.createdAt,
        read: Boolean(a.readAt)
      }))
    };
  }

  @Patch("companion-crisis-alerts/read")
  async markCompanionCrisisAlertsRead(
    @CurrentUser() user: { id: string },
    @Body() body: { ids?: string[] }
  ) {
    return this.usersService.markCompanionCrisisAlertsRead(user.id, body.ids);
  }
}
