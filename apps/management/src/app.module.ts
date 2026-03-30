import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from './auth/auth.module';
import { AttemptsModule } from './attempts/attempts.module';
import { TemplatesModule } from './templates/templates.module';
import { OrganizationModule } from './organization/organization.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { LoggerMiddleware } from './common/logger.middleware';
import { VersionMiddleware } from './common/version.middleware';
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
      process.env.MONGODB_URI || 'mongodb://localhost:27017/phishing-management',
    ),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TerminusModule,
    AuthModule,
    AttemptsModule,
    TemplatesModule,
    OrganizationModule,
    CampaignsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware, VersionMiddleware).forRoutes('*');
  }
}
