import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/user.decorator";
import { AssessmentsService } from "./assessments.service";

@Controller("assessment")
@UseGuards(JwtAuthGuard)
export class AssessmentsController {
  constructor(private readonly service: AssessmentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  async create(
    @CurrentUser() user: { id: string },
    @Body() body: { type: "YMRS" | "HDRS"; answers: Record<string, number>; score: number }
  ) {
    return this.service.create(user.id, body);
  }

  @Post("submit")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  async submit(
    @CurrentUser() user: { id: string },
    @Body() body: { type: "YMRS" | "HDRS"; answers: Record<string, number>; score: number }
  ) {
    return this.service.create(user.id, body);
  }

  @Get()
  async list(@CurrentUser() user: { id: string }) {
    return this.service.list(user.id);
  }
}
