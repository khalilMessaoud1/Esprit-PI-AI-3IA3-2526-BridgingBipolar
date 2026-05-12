import { IsString, MinLength } from "class-validator";

export class BookAppointmentDto {
  @IsString()
  @MinLength(1)
  doctorId: string;

  @IsString()
  @MinLength(1)
  startAt: string;

  @IsString()
  @MinLength(1)
  endAt: string;
}
