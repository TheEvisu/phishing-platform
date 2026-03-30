import { Controller, Post, Body, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { PhishingService } from './phishing.service';
import { SendPhishingDto } from '../dto/send-phishing.dto';

@ApiTags('phishing')
@Controller('phishing')
export class PhishingController {
  constructor(private readonly phishingService: PhishingService) {}

  @ApiOperation({ summary: 'Send a phishing simulation email' })
  @ApiResponse({ status: 201, description: 'Email sent successfully.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('send')
  async sendPhishing(@Body() sendPhishingDto: SendPhishingDto) {
    return await this.phishingService.sendPhishingEmail(sendPhishingDto);
  }

  @ApiOperation({ summary: 'Track a phishing link click (landing page)' })
  @ApiParam({ name: 'attemptId', description: 'UUID of the phishing attempt' })
  @ApiResponse({ status: 200, description: 'Returns phishing awareness HTML page.' })
  @Get('click/:attemptId')
  async trackClick(
    @Param('attemptId') attemptId: string,
    @Res() res: Response,
  ) {
    await this.phishingService.trackClick(attemptId);
    const trainingUrl = `${process.env.TRAINING_BASE_URL || 'http://localhost:5173/training'}/${attemptId}`;
    res.redirect(302, trainingUrl);
  }
}
