import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Allows requests only from internal services.
 * Callers must send INTERNAL_SECRET in the X-Service-Key header.
 * In production the secret is required - requests are rejected if it is not configured.
 * In development, requests pass when no secret is set (opt-in convenience).
 */
@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const secret = process.env.INTERNAL_SECRET;
    if (!secret) {
      return process.env.NODE_ENV !== 'production';
    }
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    return req.headers['x-service-key'] === secret;
  }
}
