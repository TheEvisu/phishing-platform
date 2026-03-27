import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { CreatePhishingAttemptDto } from '../dto/phishing-attempt.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('attempts')
@UseGuards(JwtAuthGuard)
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Get()
  async getAllAttempts() {
    return await this.attemptsService.getAllAttempts();
  }

  @Post()
  async createAttempt(
    @Body() createAttemptDto: CreatePhishingAttemptDto,
    @Request() req: { user: { username: string } },
  ) {
    return await this.attemptsService.createAttempt(createAttemptDto, req.user.username);
  }

  @Get(':id')
  async getAttemptById(@Param('id') id: string) {
    return await this.attemptsService.getAttemptById(id);
  }

  @Delete(':id')
  async deleteAttempt(@Param('id') id: string) {
    return await this.attemptsService.deleteAttempt(id);
  }
}
