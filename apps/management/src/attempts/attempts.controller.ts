import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { CreatePhishingAttemptDto } from '../dto/phishing-attempt.dto';
import { PaginationDto } from '../dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('attempts')
@UseGuards(JwtAuthGuard)
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Get()
  async getAllAttempts(
    @Query() pagination: PaginationDto,
    @Request() req: { user: { username: string } },
  ) {
    return await this.attemptsService.getAllAttempts(
      req.user.username,
      pagination.page ?? 1,
      pagination.limit ?? 10,
    );
  }

  @Post()
  async createAttempt(
    @Body() createAttemptDto: CreatePhishingAttemptDto,
    @Request() req: { user: { username: string } },
  ) {
    return await this.attemptsService.createAttempt(createAttemptDto, req.user.username);
  }

  @Get(':id')
  async getAttemptById(
    @Param('id') id: string,
    @Request() req: { user: { username: string } },
  ) {
    return await this.attemptsService.getAttemptById(id, req.user.username);
  }

  @Delete(':id')
  async deleteAttempt(
    @Param('id') id: string,
    @Request() req: { user: { username: string } },
  ) {
    return await this.attemptsService.deleteAttempt(id, req.user.username);
  }
}
