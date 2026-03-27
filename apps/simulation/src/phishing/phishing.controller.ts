import { Controller, Post, Body, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { PhishingService } from './phishing.service';
import { SendPhishingDto } from '../dto/send-phishing.dto';

@Controller('phishing')
export class PhishingController {
  constructor(private readonly phishingService: PhishingService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('send')
  async sendPhishing(@Body() sendPhishingDto: SendPhishingDto) {
    return await this.phishingService.sendPhishingEmail(sendPhishingDto);
  }

  @Get('click/:attemptId')
  async trackClick(
    @Param('attemptId') attemptId: string,
    @Res() res: Response,
  ) {
    await this.phishingService.trackClick(attemptId);

    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>⚠️ Phishing Test Alert!</h2>
          <p>You clicked on a phishing simulation link.</p>
          <p>In a real attack, this could have been dangerous!</p>
          <p>Remember to always verify email sources before clicking links.</p>
        </body>
      </html>
    `);
  }
}
