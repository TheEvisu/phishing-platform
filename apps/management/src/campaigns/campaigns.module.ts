import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign, CampaignSchema } from '../schemas/campaign.schema';
import { PhishingAttempt, PhishingAttemptSchema } from '../schemas/phishing-attempt.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: PhishingAttempt.name, schema: PhishingAttemptSchema },
    ]),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
