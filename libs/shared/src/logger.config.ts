import * as winston from 'winston';
import { WinstonModuleOptions } from 'nest-winston';

export function createLoggerConfig(): WinstonModuleOptions {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    level: isProduction ? 'info' : 'debug',
    transports: [
      new winston.transports.Console({
        format: isProduction
          ? winston.format.combine(
              winston.format.timestamp(),
              winston.format.json(),
            )
          : winston.format.combine(
              winston.format.colorize({ all: true }),
              winston.format.timestamp({ format: 'HH:mm:ss' }),
              winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
                const ctx = context ? ` [${context}]` : '';
                const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                return `${timestamp} ${level}${ctx}: ${message}${extra}`;
              }),
            ),
      }),
    ],
  };
}
