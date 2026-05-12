import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: { sleepHours: number; energyLevel: number; activityNotes?: string }) {
    const activity = await this.prisma.activityLog.create({
      data: {
        userId,
        sleepHours: data.sleepHours,
        energyLevel: data.energyLevel,
        activityNotes: data.activityNotes || null
      }
    });
    return { activity };
  }

  async list(userId: string) {
    const items = await this.prisma.activityLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return { items };
  }
}
