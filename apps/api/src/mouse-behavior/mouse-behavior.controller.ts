import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/user.decorator";
import { MouseBehaviorService } from "./mouse-behavior.service";
import { SaveMouseBehaviorDto } from "./dto/save-mouse-behavior.dto";

@Controller("mouse-behavior")
@UseGuards(JwtAuthGuard)
export class MouseBehaviorController {
  constructor(private readonly service: MouseBehaviorService) {}

  @Post()
  save(@CurrentUser() user: { id: string }, @Body() dto: SaveMouseBehaviorDto) {
    return this.service.save(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.service.findAll(user.id);
  }
}
