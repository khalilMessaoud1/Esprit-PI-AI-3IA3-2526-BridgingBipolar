import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/user.decorator";
import { MoodService } from "./mood.service";

@Controller("mood")
@UseGuards(JwtAuthGuard)
export class MoodController {
  constructor(private readonly service: MoodService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  async create(
    @CurrentUser() user: { id: string },
    @Body() body: { moodLevel: number; note?: string; voiceUrl?: string | null }
  ) {
    return this.service.create(user.id, body);
  }

  @Get()
  async list(@CurrentUser() user: { id: string }) {
    return this.service.list(user.id);
  }
}
