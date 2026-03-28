import {
  Controller, Get, Post, Body, Param, Delete, Patch,
  UseGuards, Request, Query, Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { AttemptsService } from './attempts.service';
import { CreatePhishingAttemptDto, BulkPhishingAttemptDto, UpdateAttemptStatusDto, BulkDeleteDto } from '../dto/phishing-attempt.dto';
import { AttemptsQueryDto } from '../dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InternalGuard } from './internal.guard';

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  // ─── SSE ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'SSE stream — real-time status updates for the authenticated user' })
  @ApiResponse({ status: 200, description: 'text/event-stream — emits status_change and heartbeat events' })
  @UseGuards(JwtAuthGuard)
  @Sse('events')
  events(@Request() req: { user: { username: string } }): Observable<MessageEvent> {
    return this.attemptsService.watchAttempts(req.user.username);
  }

  // ─── Internal (Simulation → Management callback) ─────────────────────────

  @ApiExcludeEndpoint()
  @UseGuards(InternalGuard)
  @Patch('internal/:attemptId/status')
  async updateStatus(
    @Param('attemptId') attemptId: string,
    @Body() dto: UpdateAttemptStatusDto,
  ) {
    return this.attemptsService.updateAttemptStatus(attemptId, dto.status, dto.clickedAt);
  }

  // ─── Protected routes ─────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List your phishing attempts (paginated, filterable)' })
  @UseGuards(JwtAuthGuard)
  @Get()
  async getAllAttempts(
    @Query() query: AttemptsQueryDto,
    @Request() req: { user: { username: string } },
  ) {
    return this.attemptsService.getAllAttempts(
      req.user.username,
      query.page ?? 1,
      query.limit ?? 10,
      query.status,
      query.email,
    );
  }

  @ApiOperation({ summary: 'Get stats for your attempts' })
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getStats(@Request() req: { user: { username: string } }) {
    return this.attemptsService.getStats(req.user.username);
  }

  @ApiOperation({ summary: 'Export all attempts as JSON (for CSV download)' })
  @UseGuards(JwtAuthGuard)
  @Get('export')
  async exportAttempts(@Request() req: { user: { username: string } }) {
    return this.attemptsService.exportAttempts(req.user.username);
  }

  @ApiOperation({ summary: 'Daily activity timeline (last 14 days)' })
  @UseGuards(JwtAuthGuard)
  @Get('timeline')
  async getTimeline(@Request() req: { user: { username: string } }) {
    return this.attemptsService.getTimeline(req.user.username);
  }

  @ApiOperation({ summary: 'Create a new phishing attempt' })
  @ApiResponse({ status: 201 })
  @UseGuards(JwtAuthGuard)
  @Post()
  async createAttempt(
    @Body() dto: CreatePhishingAttemptDto,
    @Request() req: { user: { username: string } },
  ) {
    return this.attemptsService.createAttempt(dto, req.user.username);
  }

  @ApiOperation({ summary: 'Send phishing emails in bulk' })
  @ApiResponse({ status: 201, description: '{ sent, failed, total }' })
  @UseGuards(JwtAuthGuard)
  @Post('bulk')
  async bulkCreateAttempts(
    @Body() dto: BulkPhishingAttemptDto,
    @Request() req: { user: { username: string } },
  ) {
    return this.attemptsService.bulkCreateAttempts(dto, req.user.username);
  }

  @ApiOperation({ summary: 'Get a phishing attempt by ID' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getAttemptById(
    @Param('id') id: string,
    @Request() req: { user: { username: string } },
  ) {
    return this.attemptsService.getAttemptById(id, req.user.username);
  }

  @ApiOperation({ summary: 'Bulk delete attempts by IDs' })
  @ApiResponse({ status: 200, description: '{ deleted: number }' })
  @UseGuards(JwtAuthGuard)
  @Delete('bulk')
  async bulkDeleteAttempts(
    @Body() dto: BulkDeleteDto,
    @Request() req: { user: { username: string } },
  ) {
    return this.attemptsService.bulkDeleteAttempts(dto.ids, req.user.username);
  }

  @ApiOperation({ summary: 'Delete a phishing attempt by ID' })
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteAttempt(
    @Param('id') id: string,
    @Request() req: { user: { username: string } },
  ) {
    return this.attemptsService.deleteAttempt(id, req.user.username);
  }
}
