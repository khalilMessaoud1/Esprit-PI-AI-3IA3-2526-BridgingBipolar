import { IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class CrisisParentDto {
  @IsOptional()
  @IsString()
  parent_whatsapp_e164?: string | null;

  @IsOptional()
  parent_contact_consent?: boolean;

  @IsOptional()
  @IsString()
  display_name?: string | null;
}

export class ChatMessageDto {
  @IsString()
  role!: "user" | "assistant";

  @IsString()
  content!: string;
}

export class ChatRequestDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsArray()
  keystroke_events?: Record<string, unknown>[];

  @IsOptional()
  keystroke_session?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CrisisParentDto)
  crisis_parent?: CrisisParentDto;
}

export class TtsRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  lang?: string;
}
