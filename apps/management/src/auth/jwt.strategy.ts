import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: (req: Request) => req?.cookies?.['access_token'] ?? null,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'plug',
    });
  }

  async validate(payload: { username: string; sub: string }) {
    const user = await this.authService.validateUser(payload.username);
    if (!user) {
      this.logger.warn(`JWT validation failed: user not found`);
    }
    return user;
  }
}
