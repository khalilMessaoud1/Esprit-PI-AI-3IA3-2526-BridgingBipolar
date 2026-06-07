import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

@Catch(Prisma.PrismaClientInitializationError, Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientInitializationError | Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();

    const isConnectionError =
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception.code === "P1001" ||
      exception.code === "P1000";

    if (isConnectionError) {
      this.logger.error(exception.message);
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          "Database is unavailable. Restart Docker Desktop, then run: npm run dev:deps"
      });
      return;
    }

    if (exception.code === "P2002") {
      const target = (exception.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      const message = target.includes("email")
        ? "This email is already registered. Try logging in instead."
        : `A record with this ${target} already exists.`;
      response.status(HttpStatus.CONFLICT).json({ statusCode: HttpStatus.CONFLICT, message });
      return;
    }

    if (exception.code === "P2003") {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Invalid linked account reference. Check the doctor or patient code."
      });
      return;
    }

    this.logger.error(`${exception.code}: ${exception.message}`);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Database error"
    });
  }
}