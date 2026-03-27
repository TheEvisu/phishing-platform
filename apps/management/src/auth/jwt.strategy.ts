import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'plug',
    });
  }

  async validate(payload: any) {
    try {
      console.log('[JwtStrategy] validating payload:', JSON.stringify(payload));
    } catch (e) {
      console.log('[JwtStrategy] validating payload (unserializable)');
    }

    const user = await this.authService.validateUser(payload.username);
    console.log('[JwtStrategy] user found:', !!user);
    return user;
  }
}
