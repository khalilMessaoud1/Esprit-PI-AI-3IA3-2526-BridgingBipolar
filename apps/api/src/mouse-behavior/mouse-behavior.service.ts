import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SaveMouseBehaviorDto } from "./dto/save-mouse-behavior.dto";

@Injectable()
export class MouseBehaviorService {
  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, dto: SaveMouseBehaviorDto) {
    return this.prisma.mouseBehaviorLog.upsert({
      where: { userId_date: { userId, date: dto.date } },
      update: {
        state: dto.state,
        score: dto.score,
        level: dto.level,
        windowCount: dto.windowCount,
        anomalyPct: dto.anomalyPct,
        savedAt: new Date()
      },
      create: {
        userId,
        date: dto.date,
        state: dto.state,
        score: dto.score,
        level: dto.level,
        windowCount: dto.windowCount,
        anomalyPct: dto.anomalyPct
      }
    });
  }

  async findAll(userId: string) {
    return this.prisma.mouseBehaviorLog.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 30
    });
  }
}
