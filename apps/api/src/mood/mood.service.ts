import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MoodService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: { moodLevel: number; note?: string; voiceUrl?: string | null }) {
    const mood = await this.prisma.moodEntry.create({
      data: { userId, moodLevel: data.moodLevel, note: data.note, voiceUrl: data.voiceUrl || null }
    });
    return { mood };
  }

  async list(userId: string) {
    const items = await this.prisma.moodEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return { items };
  }
}
