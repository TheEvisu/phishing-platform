import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, UpdateTemplateDto } from '../dto/template.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UserCtx {
  username: string;
  role: string;
  organizationId: Types.ObjectId;
}

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @ApiOperation({ summary: 'List templates (org_admin sees all org templates, member sees own)' })
  @Get()
  getAll(@Request() req: { user: UserCtx }) {
    return this.templatesService.getAll(req.user);
  }

  @ApiOperation({ summary: 'Create a new template' })
  @ApiResponse({ status: 201 })
  @Post()
  create(@Body() dto: CreateTemplateDto, @Request() req: { user: UserCtx }) {
    return this.templatesService.create(dto, req.user);
  }

  @ApiOperation({ summary: 'Seed 6 default templates for the organization' })
  @Post('seed')
  seed(@Request() req: { user: UserCtx }) {
    return this.templatesService.seedDefaults(req.user);
  }

  @ApiOperation({ summary: 'Get a template by ID' })
  @Get(':id')
  getById(@Param('id') id: string, @Request() req: { user: UserCtx }) {
    return this.templatesService.getById(id, req.user);
  }

  @ApiOperation({ summary: 'Update a template by ID' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto, @Request() req: { user: UserCtx }) {
    return this.templatesService.update(id, dto, req.user);
  }

  @ApiOperation({ summary: 'Delete a template by ID' })
  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: { user: UserCtx }) {
    return this.templatesService.delete(id, req.user);
  }
}
