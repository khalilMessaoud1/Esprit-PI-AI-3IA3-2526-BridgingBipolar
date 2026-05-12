import { Injectable, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "fs";
import * as path from "path";

@Injectable()
export class UploadService {
  private readonly uploadDir = path.join(process.cwd(), "public", "uploads");

  constructor(private readonly config: ConfigService) {}

  async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create upload directory:", error);
    }
  }

  async uploadFile(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException("No file provided");
    }

    const allowedMimes = ["image/png", "image/jpeg", "image/gif"];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException("Only PNG, JPEG, and GIF images are allowed");
    }

    const body: Buffer | undefined = file.buffer;
    if (!body?.length) {
      throw new BadRequestException("Empty upload");
    }

    try {
      await this.ensureUploadDir();

      const filename = `${Date.now()}-${file.originalname}`;
      const filepath = path.join(this.uploadDir, filename);

      await fs.writeFile(filepath, body);

      const url = `/uploads/${filename}`;
      return { url };
    } catch (error) {
      console.error("Upload error:", error);
      throw new BadRequestException("Failed to upload file");
    }
  }
}
