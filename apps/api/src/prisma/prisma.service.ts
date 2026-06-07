import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      this.logger.error(
        "Database connection failed at startup. Run: npm run dev:deps (requires Docker Desktop running)."
      );
      this.logger.error(err instanceof Error ? err.message : String(err));
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
