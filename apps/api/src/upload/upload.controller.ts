import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { UploadService } from "./upload.service";

@Controller("upload")
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly service: UploadService) {}

  @Post("file")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 }
    })
  )
  async uploadFile(@UploadedFile() file: any) {
    return this.service.uploadFile(file);
  }
}
