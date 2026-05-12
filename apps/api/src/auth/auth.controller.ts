import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Query } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto, LoginDto, ResetPasswordDto, SignupDto } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  async signup(@Body() body: SignupDto) {
    return this.authService.signup(body);
  }

  @Post("login")
  async login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post("forgot-password")
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Post("reset-password")
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  /** Public endpoint — validate a BB-XXXXXXXX code before signup (no auth required). */
  @Get("find-by-code")
  async findByCode(
    @Query("code") code: string,
    @Query("role") role: "PATIENT" | "DOCTOR"
  ) {
    if (!code) throw new BadRequestException("code query param is required.");
    const found = await this.authService.findByCode(code, role ?? "PATIENT");
    if (!found) throw new NotFoundException("No user found with this code.");
    return { id: found.id, name: found.name };
  }
}
