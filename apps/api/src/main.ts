import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as express from "express";
import * as path from "path";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Serve static files from public directory
  app.use("/uploads", express.static(path.join(__dirname, "..", "public", "uploads")));

  const port = process.env.PORT || 4001;
  await app.listen(port);
}

bootstrap();
