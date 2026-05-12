import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DoctorController } from "./doctor.controller";
import { DoctorService } from "./doctor.service";

@Module({
  imports: [PrismaModule],
  controllers: [DoctorController],
  providers: [DoctorService]
})
export class DoctorModule {}
