import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PhishingController } from './phishing/phishing.controller';
import { PhishingService } from './phishing/phishing.service';
import { PhishingAttempt, PhishingAttemptSchema } from './schemas/phishing-attempt.schema';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/phishing-simulation',
    ),
    MongooseModule.forFeature([
      { name: PhishingAttempt.name, schema: PhishingAttemptSchema },
    ]),
  ],
  controllers: [AppController, PhishingController],
  providers: [AppService, PhishingService],
})
export class AppModule {}
