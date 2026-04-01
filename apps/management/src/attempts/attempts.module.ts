import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';
import { PhishingAttempt, PhishingAttemptSchema } from '../schemas/phishing-attempt.schema';
import { Campaign, CampaignSchema } from '../schemas/campaign.schema';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PhishingAttempt.name, schema: PhishingAttemptSchema },
      { name: Campaign.name, schema: CampaignSchema },
    ]),
    OrganizationModule,
  ],
  providers: [AttemptsService],
  controllers: [AttemptsController],
})
export class AttemptsModule {}
