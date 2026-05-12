import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: { type: "YMRS" | "HDRS"; answers: any; score: number }) {
    const assessment = await this.prisma.assessment.create({
      data: { userId, type: data.type, answers: data.answers, score: data.score }
    });
    return { assessment };
  }

  async list(userId: string) {
    const items = await this.prisma.assessment.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return { items };
  }
}
