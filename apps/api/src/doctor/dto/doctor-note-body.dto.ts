import { IsString, MinLength } from "class-validator";

export class DoctorNoteBodyDto {
  @IsString()
  @MinLength(1)
  body: string;
}
