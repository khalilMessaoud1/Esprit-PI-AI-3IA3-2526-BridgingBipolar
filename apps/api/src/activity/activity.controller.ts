import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/user.decorator";
import { ActivityService } from "./activity.service";

@Controller("activity")
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  async create(
    @CurrentUser() user: { id: string },
    @Body() body: { sleepHours: number; energyLevel: number; activityNotes?: string }
  ) {
    return this.service.create(user.id, body);
  }

  @Get()
  async list(@CurrentUser() user: { id: string }) {
    return this.service.list(user.id);
  }
}
