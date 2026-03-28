import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const APP_VERSION = process.env.APP_VERSION ?? '0.0.1';

@Injectable()
export class VersionMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-App-Version', APP_VERSION);
    next();
  }
}
