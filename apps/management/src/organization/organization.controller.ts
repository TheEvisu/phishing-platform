import { Controller, Get, Post, Put, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrganizationService } from './organization.service';
import { SmtpConfigDto } from '../dto/smtp-config.dto';
import { Types } from 'mongoose';

interface AuthRequest {
  user: { username: string; role: string; organizationId: Types.ObjectId };
}

@ApiTags('organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @ApiOperation({ summary: 'Get current organization info + invite code' })
  @Get('me')
  getOrg(@Request() req: AuthRequest) {
    return this.orgService.getOrg(req.user.organizationId);
  }

  @ApiOperation({ summary: 'List all members of the organization' })
  @Get('members')
  getMembers(@Request() req: AuthRequest) {
    return this.orgService.getMembers(req.user.organizationId);
  }

  @ApiOperation({ summary: 'Regenerate invite code (org_admin only)' })
  @Post('invite/regenerate')
  regenerateInvite(@Request() req: AuthRequest) {
    return this.orgService.regenerateInviteCode(req.user.organizationId, req.user.role);
  }

  @ApiOperation({ summary: 'Remove a member (org_admin only)' })
  @Delete('members/:id')
  removeMember(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.orgService.removeMember(req.user.organizationId, id, req.user.role);
  }

  // ─── SMTP ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get SMTP config (password masked)' })
  @Get('smtp')
  getSmtp(@Request() req: AuthRequest) {
    return this.orgService.getSmtpConfig(req.user.organizationId);
  }

  @ApiOperation({ summary: 'Save SMTP config (org_admin only)' })
  @Put('smtp')
  saveSmtp(@Body() dto: SmtpConfigDto, @Request() req: AuthRequest) {
    return this.orgService.saveSmtpConfig(dto, req.user.organizationId, req.user.role);
  }

  @ApiOperation({ summary: 'Test SMTP connection (org_admin only)' })
  @Post('smtp/test')
  testSmtp(@Body() dto: SmtpConfigDto, @Request() req: AuthRequest) {
    return this.orgService.testSmtpConfig(dto, req.user.role);
  }
}
