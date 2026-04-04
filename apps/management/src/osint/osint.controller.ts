import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches } from 'class-validator';
import { Types } from 'mongoose';
import { OsintService } from './osint.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class OsintScanDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/, {
    message: 'Invalid domain format (e.g. company.com)',
  })
  domain!: string;
}

interface UserCtx {
  username: string;
  role: string;
  organizationId: Types.ObjectId;
}

@ApiTags('osint')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('osint')
export class OsintController {
  constructor(private readonly osintService: OsintService) {}

  @ApiOperation({ summary: 'Start an OSINT scan for a domain (runs async, returns scanId)' })
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Post('scan')
  scan(@Body() dto: OsintScanDto, @Request() req: { user: UserCtx }) {
    return this.osintService.startScan(dto.domain, req.user.organizationId);
  }

  @ApiOperation({ summary: 'Poll scan status and results by scanId' })
  @Get(':scanId')
  getScan(@Param('scanId') scanId: string, @Request() req: { user: UserCtx }) {
    return this.osintService.getScan(scanId, req.user.organizationId);
  }

  @ApiOperation({ summary: 'Get the latest completed OSINT scan with full results' })
  @Get('results/latest')
  getLatest(@Request() req: { user: UserCtx }) {
    return this.osintService.getLatest(req.user.organizationId);
  }

  @ApiOperation({ summary: 'Get last 10 OSINT scans for the org (no results array)' })
  @Get()
  getHistory(@Request() req: { user: UserCtx }) {
    return this.osintService.getHistory(req.user.organizationId);
  }
}
