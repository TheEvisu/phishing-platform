import {
  Controller, Get, Post, Body, Param, Delete, Patch,
  UseGuards, Request, Query, Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { AttemptsService } from './attempts.service';
import { CreatePhishingAttemptDto, BulkPhishingAttemptDto, UpdateAttemptStatusDto, BulkDeleteDto } from '../dto/phishing-attempt.dto';
import { AttemptsQueryDto } from '../dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InternalGuard } from './internal.guard';

interface UserCtx {
  username: string;
  role: string;
  organizationId: Types.ObjectId;
}

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @ApiOperation({ summary: 'SSE stream - real-time status updates' })
  @UseGuards(JwtAuthGuard)
  @Sse('events')
  events(@Request() req: { user: UserCtx }): Observable<MessageEvent> {
    return this.attemptsService.watchAttempts(req.user);
  }

  @ApiExcludeEndpoint()
  @UseGuards(InternalGuard)
  @Patch('internal/:attemptId/status')
  async updateStatus(@Param('attemptId') attemptId: string, @Body() dto: UpdateAttemptStatusDto) {
    return this.attemptsService.updateAttemptStatus(attemptId, dto.status, dto.clickedAt, dto.clickMetadata);
  }

  @ApiOperation({ summary: 'List phishing attempts (paginated, filterable)' })
  @UseGuards(JwtAuthGuard)
  @Get()
  async getAllAttempts(@Query() query: AttemptsQueryDto, @Request() req: { user: UserCtx }) {
    return this.attemptsService.getAllAttempts(req.user, query.page ?? 1, query.limit ?? 10, query.status, query.email);
  }

  @ApiOperation({ summary: 'Get stats' })
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getStats(@Request() req: { user: UserCtx }) {
    return this.attemptsService.getStats(req.user);
  }

  @ApiOperation({ summary: 'Export attempts as JSON' })
  @UseGuards(JwtAuthGuard)
  @Get('export')
  async exportAttempts(@Request() req: { user: UserCtx }) {
    return this.attemptsService.exportAttempts(req.user);
  }

  @ApiOperation({ summary: 'Daily activity timeline (last 14 days)' })
  @UseGuards(JwtAuthGuard)
  @Get('timeline')
  async getTimeline(@Request() req: { user: UserCtx }) {
    return this.attemptsService.getTimeline(req.user);
  }

  @ApiOperation({ summary: 'Create a new phishing attempt' })
  @UseGuards(JwtAuthGuard)
  @Post()
  async createAttempt(@Body() dto: CreatePhishingAttemptDto, @Request() req: { user: UserCtx }) {
    return this.attemptsService.createAttempt(dto, req.user);
  }

  @ApiOperation({ summary: 'Send phishing emails in bulk' })
  @UseGuards(JwtAuthGuard)
  @Post('bulk')
  async bulkCreateAttempts(@Body() dto: BulkPhishingAttemptDto, @Request() req: { user: UserCtx }) {
    return this.attemptsService.bulkCreateAttempts(dto, req.user);
  }

  @ApiOperation({ summary: 'Get a phishing attempt by ID' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getAttemptById(@Param('id') id: string, @Request() req: { user: UserCtx }) {
    return this.attemptsService.getAttemptById(id, req.user);
  }

  @ApiOperation({ summary: 'Bulk delete attempts by IDs' })
  @UseGuards(JwtAuthGuard)
  @Delete('bulk')
  async bulkDeleteAttempts(@Body() dto: BulkDeleteDto, @Request() req: { user: UserCtx }) {
    return this.attemptsService.bulkDeleteAttempts(dto.ids, req.user);
  }

  @ApiOperation({ summary: 'Delete a phishing attempt by ID' })
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteAttempt(@Param('id') id: string, @Request() req: { user: UserCtx }) {
    return this.attemptsService.deleteAttempt(id, req.user);
  }
}
