import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/user.decorator";
import { MedicationsService } from "./medications.service";

@Controller("medication")
@UseGuards(JwtAuthGuard)
export class MedicationsController {
  constructor(private readonly service: MedicationsService) {}

  @Post("parse")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  @UseInterceptors(FileInterceptor("file"))
  async parsePrescription(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Image file required (field name: file)");
    }
    return this.service.parsePrescriptionImage(file);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  async create(
    @CurrentUser() user: { id: string },
    @Body() body: { name: string; dosage: string; frequency: string; time: string }
  ) {
    return this.service.create(user.id, body);
  }

  @Get()
  async list(@CurrentUser() user: { id: string }) {
    return this.service.list(user.id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  async update(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() body: { name?: string; dosage?: string; frequency?: string; time?: string }
  ) {
    return this.service.update(user.id, id, body);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  async remove(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.service.delete(user.id, id);
  }
}
