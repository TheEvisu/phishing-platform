import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const now = new Date().toISOString();

    try {
      const params = JSON.stringify(req.params || {});
      const query = JSON.stringify(req.query || {});
      let body = '';
      try {
        body = JSON.stringify(req.body ?? {});
      } catch (e) {
        body = '[unserializable body]';
      }

      let headersSafe: any = {};
      try {
        headersSafe = { ...req.headers };
        if (headersSafe.authorization) {
          headersSafe.authorization = '[REDACTED]';
        }
      } catch (e) {
        headersSafe = '[unserializable headers]';
      }

      const headersStr = typeof headersSafe === 'string' ? headersSafe : JSON.stringify(headersSafe);
      console.log(`[${now}] ${method} ${originalUrl} params=${params} query=${query} body=${body} headers=${headersStr}`);
    } catch (err) {
      console.log(`[${now}] ${method} ${originalUrl} (failed to log details)`);
    }

    next();
  }
}
