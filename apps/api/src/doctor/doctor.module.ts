import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MedicationsModule } from "../medications/medications.module";
import { DoctorController } from "./doctor.controller";
import { DoctorService } from "./doctor.service";

@Module({
  imports: [PrismaModule, MedicationsModule],
  controllers: [DoctorController],
  providers: [DoctorService]
})
export class DoctorModule {}
