import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';
import { PhishingAttempt, PhishingAttemptSchema } from '../schemas/phishing-attempt.schema';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PhishingAttempt.name, schema: PhishingAttemptSchema },
    ]),
    OrganizationModule,
  ],
  providers: [AttemptsService],
  controllers: [AttemptsController],
})
export class AttemptsModule {}
