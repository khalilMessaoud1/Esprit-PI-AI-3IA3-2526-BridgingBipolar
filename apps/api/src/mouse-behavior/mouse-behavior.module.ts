import { Module } from "@nestjs/common";
import { MouseBehaviorController } from "./mouse-behavior.controller";
import { MouseBehaviorService } from "./mouse-behavior.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [MouseBehaviorController],
  providers: [MouseBehaviorService],
  exports: [MouseBehaviorService]
})
export class MouseBehaviorModule {}
