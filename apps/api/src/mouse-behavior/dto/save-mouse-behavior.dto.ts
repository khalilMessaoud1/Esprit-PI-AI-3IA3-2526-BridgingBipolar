import { IsNumber, IsString, Max, Min } from "class-validator";

export class SaveMouseBehaviorDto {
  @IsString()
  date: string;

  @IsString()
  state: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  score: number;

  @IsString()
  level: string;

  @IsNumber()
  windowCount: number;

  @IsNumber()
  anomalyPct: number;
}
