import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, _res: Response, next: NextFunction) {
    const { method, originalUrl } = req;

    const query = Object.keys(req.query).length ? JSON.stringify(req.query) : undefined;

    let body: string | undefined;
    try {
      const parsed = req.body;
      if (parsed && Object.keys(parsed).length) {
        body = JSON.stringify(parsed);
      }
    } catch {
      body = '[unserializable]';
    }

    this.logger.log(
      `${method} ${originalUrl}` +
        (query ? ` query=${query}` : '') +
        (body ? ` body=${body}` : ''),
    );

    next();
  }
}
