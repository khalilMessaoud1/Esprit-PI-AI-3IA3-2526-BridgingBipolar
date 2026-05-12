import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { MlService } from "./ml.service";

@Controller("ml")
@UseGuards(JwtAuthGuard)
export class MlController {
  constructor(private readonly service: MlService) {}

  @Post("predict-risk")
  async predict(@Body() body: { moodHistory: number[] }) {
    return this.service.predictRisk(body.moodHistory);
  }
}
