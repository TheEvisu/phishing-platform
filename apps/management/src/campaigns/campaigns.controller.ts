import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { CampaignsService } from './campaigns.service';
import { LaunchCampaignDto } from '../dto/campaign.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UserCtx {
  username: string;
  role: string;
  organizationId: Types.ObjectId;
}

@ApiTags('campaigns')
@ApiBearerAuth()
@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @ApiOperation({ summary: 'Launch a new campaign and send phishing emails' })
  @Post('launch')
  launch(@Body() dto: LaunchCampaignDto, @Request() req: { user: UserCtx }) {
    return this.campaignsService.launch(dto, req.user);
  }

  @ApiOperation({ summary: 'List all campaigns for the organization' })
  @Get()
  getAll(@Request() req: { user: UserCtx }) {
    return this.campaignsService.getAll(req.user);
  }

  @ApiOperation({ summary: 'Get a campaign with its attempts' })
  @Get(':id')
  getById(@Param('id') id: string, @Request() req: { user: UserCtx }) {
    return this.campaignsService.getById(id, req.user);
  }

  @ApiOperation({ summary: 'Delete a campaign' })
  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: { user: UserCtx }) {
    return this.campaignsService.delete(id, req.user);
  }
}
