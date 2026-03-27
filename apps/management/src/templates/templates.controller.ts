import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from '../dto/template.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @ApiOperation({ summary: 'List all your templates' })
  @ApiResponse({ status: 200, description: 'Returns all templates owned by the caller.' })
  @Get()
  getAll(@Request() req: { user: { username: string } }) {
    return this.templatesService.getAll(req.user.username);
  }

  @ApiOperation({ summary: 'Create a new template' })
  @ApiResponse({ status: 201, description: 'Template created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @Post()
  create(
    @Body() dto: CreateTemplateDto,
    @Request() req: { user: { username: string } },
  ) {
    return this.templatesService.create(dto, req.user.username);
  }

  @ApiOperation({ summary: 'Seed 6 default convincing templates into your account' })
  @ApiResponse({ status: 201, description: '6 default templates created.' })
  @Post('seed')
  seed(@Request() req: { user: { username: string } }) {
    return this.templatesService.seedDefaults(req.user.username);
  }

  @ApiOperation({ summary: 'Get a template by ID' })
  @ApiResponse({ status: 200, description: 'Returns the template.' })
  @ApiResponse({ status: 403, description: 'Template belongs to another user.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  @Get(':id')
  getById(
    @Param('id') id: string,
    @Request() req: { user: { username: string } },
  ) {
    return this.templatesService.getById(id, req.user.username);
  }

  @ApiOperation({ summary: 'Delete a template by ID' })
  @ApiResponse({ status: 200, description: 'Template deleted.' })
  @ApiResponse({ status: 403, description: 'Template belongs to another user.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  @Delete(':id')
  delete(
    @Param('id') id: string,
    @Request() req: { user: { username: string } },
  ) {
    return this.templatesService.delete(id, req.user.username);
  }
}
