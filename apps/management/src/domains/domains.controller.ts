import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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

  @ApiOperation({ summary: 'Run a lookalike domain scan' })
  @Post('scan')
  scan(@Body() dto: ScanDomainDto, @Request() req: { user: UserCtx }) {
    return this.domainsService.scan(dto.domain, req.user.organizationId);
  }

  @ApiOperation({ summary: 'Get the latest scan result' })
  @Get('latest')
  getLatest(@Request() req: { user: UserCtx }) {
    return this.domainsService.getLatest(req.user.organizationId);
  }

  @ApiOperation({ summary: 'Get scan history (last 10, no results array)' })
  @Get('history')
  getHistory(@Request() req: { user: UserCtx }) {
    return this.domainsService.getHistory(req.user.organizationId);
  }
}
