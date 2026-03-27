import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PhishingController } from './phishing/phishing.controller';
import { PhishingService } from './phishing/phishing.service';
import { PhishingAttempt, PhishingAttemptSchema } from './schemas/phishing-attempt.schema';
import { validationSchema } from './config/validation';
import { createLoggerConfig } from '@app/shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    WinstonModule.forRoot(createLoggerConfig()),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/phishing-simulation',
    ),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    MongooseModule.forFeature([
      { name: PhishingAttempt.name, schema: PhishingAttemptSchema },
    ]),
  ],
  controllers: [AppController, PhishingController],
  providers: [
    AppService,
    PhishingService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
