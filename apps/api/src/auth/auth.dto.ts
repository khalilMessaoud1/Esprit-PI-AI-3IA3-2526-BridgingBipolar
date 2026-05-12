import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class SignupDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  /** Calendar date YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsString()
  birthDate: string;

  @IsOptional()
  @IsIn(["PATIENT", "DOCTOR", "RELATIVE"])
  role?: "PATIENT" | "DOCTOR" | "RELATIVE";

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  // Patient can enter local digits only; backend will normalize to +216 before save/send.
  @Matches(/^(\+216\d{8,14}|\d{8,14})$/)
  @IsString()
  supervisorPhone?: string;

  /** PATIENT: doctor code to link to (optional). RELATIVE: patient code to link to (required). */
  @IsOptional()
  @IsString()
  linkedCode?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @MinLength(8)
  password: string;
}
