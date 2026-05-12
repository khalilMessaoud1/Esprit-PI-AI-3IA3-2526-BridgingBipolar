import { IsIn, IsString } from "class-validator";

export class AppointmentStatusDto {
  @IsString()
  @IsIn(["pending", "confirmed", "cancelled"])
  status: string;
}
