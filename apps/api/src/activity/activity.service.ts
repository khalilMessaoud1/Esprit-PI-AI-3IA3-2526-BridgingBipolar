import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    data: {
      sleepHours: number;
      energyLevel?: number;
      moodLevel?: number;
      activityLevel?: number;
      activityNotes?: string;
      note?: string;
    }
  ) {
    const energyLevel =
      data.energyLevel ??
      (data.activityLevel != null
        ? data.activityLevel
        : data.moodLevel != null
          ? Math.min(5, Math.max(1, data.moodLevel + 3))
          : 3);
    const moodNote = (data.note ?? "").trim() || undefined;

    if (data.moodLevel != null) {
      return this.prisma.$transaction(async (tx) => {
        await tx.moodEntry.create({
          data: {
            userId,
            moodLevel: data.moodLevel!,
            note: moodNote,
            voiceUrl: null
          }
        });
        const activity = await tx.activityLog.create({
          data: {
            userId,
            sleepHours: data.sleepHours,
            energyLevel,
            activityNotes: data.activityNotes || null
          }
        });
        return { activity };
      });
    }

    const activity = await this.prisma.activityLog.create({
      data: {
        userId,
        sleepHours: data.sleepHours,
        energyLevel,
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
