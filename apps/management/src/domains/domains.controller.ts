import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches } from 'class-validator';
import { Types } from 'mongoose';
import { DomainsService } from './domains.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class ScanDomainDto {
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

@ApiTags('domains')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('domains')
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @ApiOperation({ summary: 'Start a lookalike domain scan (runs in background, returns scanId immediately)' })
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('scan')
  scan(@Body() dto: ScanDomainDto, @Request() req: { user: UserCtx }) {
    return this.domainsService.scan(dto.domain, req.user.organizationId);
  }

  @ApiOperation({ summary: 'Get a scan by ID (poll for progress/results)' })
  @Get(':scanId')
  getScan(@Param('scanId') scanId: string, @Request() req: { user: UserCtx }) {
    return this.domainsService.getScan(scanId, req.user.organizationId);
  }

  @ApiOperation({ summary: 'Get the latest completed scan' })
  @Get('results/latest')
  getLatest(@Request() req: { user: UserCtx }) {
    return this.domainsService.getLatest(req.user.organizationId);
  }

  @ApiOperation({ summary: 'Get scan history (last 10, no results array)' })
  @Get('results/history')
  getHistory(@Request() req: { user: UserCtx }) {
    return this.domainsService.getHistory(req.user.organizationId);
  }
}
