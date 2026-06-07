import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET")
    });
  }

  async validate(payload: { sub: string; email?: string }) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    try {
      const record = await this.usersService.findById(payload.sub);
      return {
        id: record.id,
        email: record.email,
        role: record.role
      };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
