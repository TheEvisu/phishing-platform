import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Allows requests only from internal services.
 * In production set INTERNAL_SECRET env var — callers must send it
 * in the X-Service-Key header. In development (no secret configured) all calls pass.
 */
@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const secret = process.env.INTERNAL_SECRET;
    if (!secret) return true;
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    return req.headers['x-service-key'] === secret;
  }
}
