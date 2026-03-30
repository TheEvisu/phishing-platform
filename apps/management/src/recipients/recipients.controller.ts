import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { RecipientsService } from './recipients.service';
import {
  CreateRecipientDto,
  UpdateRecipientDto,
  ImportRecipientsDto,
  RecipientQueryDto,
  BulkDeleteRecipientsDto,
} from '../dto/recipient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UserCtx {
  username: string;
  role: string;
  organizationId: Types.ObjectId;
}

@ApiTags('recipients')
@ApiBearerAuth()
@Controller('recipients')
@UseGuards(JwtAuthGuard)
export class RecipientsController {
  constructor(private readonly recipientsService: RecipientsService) {}

  @ApiOperation({ summary: 'Create a single recipient (admin only)' })
  @Post()
  create(@Body() dto: CreateRecipientDto, @Request() req: { user: UserCtx }) {
    return this.recipientsService.create(dto, req.user);
  }

  @ApiOperation({ summary: 'Bulk import recipients via CSV data (admin only, upsert by email)' })
  @Post('import')
  bulkImport(@Body() dto: ImportRecipientsDto, @Request() req: { user: UserCtx }) {
    return this.recipientsService.bulkImport(dto, req.user);
  }

  @ApiOperation({ summary: 'Bulk delete recipients (admin only)' })
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkDeleteRecipientsDto, @Request() req: { user: UserCtx }) {
    return this.recipientsService.bulkDelete(dto, req.user);
  }

  @ApiOperation({ summary: 'Get paginated recipients' })
  @Get()
  findAll(@Query() query: RecipientQueryDto, @Request() req: { user: UserCtx }) {
    return this.recipientsService.findAll(query, req.user);
  }

  @ApiOperation({ summary: 'Get distinct department names' })
  @Get('departments')
  getDepartments(@Request() req: { user: UserCtx }) {
    return this.recipientsService.getDepartments(req.user);
  }

  @ApiOperation({ summary: 'Get a recipient by ID' })
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: { user: UserCtx }) {
    return this.recipientsService.findOne(id, req.user);
  }

  @ApiOperation({ summary: 'Update a recipient (admin only)' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRecipientDto,
    @Request() req: { user: UserCtx },
  ) {
    return this.recipientsService.update(id, dto, req.user);
  }

  @ApiOperation({ summary: 'Delete a recipient (admin only)' })
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: { user: UserCtx }) {
    return this.recipientsService.remove(id, req.user);
  }
}
