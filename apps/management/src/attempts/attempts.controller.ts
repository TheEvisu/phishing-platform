import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AttemptsService } from './attempts.service';
import { CreatePhishingAttemptDto } from '../dto/phishing-attempt.dto';
import { PaginationDto } from '../dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
@UseGuards(JwtAuthGuard)
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @ApiOperation({ summary: 'List your phishing attempts (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated list of attempts belonging to the caller.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @Get()
  async getAllAttempts(
    @Query() pagination: PaginationDto,
    @Request() req: { user: { username: string } },
  ) {
    return await this.attemptsService.getAllAttempts(
      req.user.username,
      pagination.page ?? 1,
      pagination.limit ?? 10,
    );
  }

  @ApiOperation({ summary: 'Create a new phishing attempt' })
  @ApiResponse({ status: 201, description: 'Attempt created and email dispatched to simulation service.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @Post()
  async createAttempt(
    @Body() createAttemptDto: CreatePhishingAttemptDto,
    @Request() req: { user: { username: string } },
  ) {
    return await this.attemptsService.createAttempt(createAttemptDto, req.user.username);
  }

  @ApiOperation({ summary: 'Get a phishing attempt by ID' })
  @ApiResponse({ status: 200, description: 'Returns the attempt.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Attempt belongs to another user.' })
  @ApiResponse({ status: 404, description: 'Attempt not found.' })
  @Get(':id')
  async getAttemptById(
    @Param('id') id: string,
    @Request() req: { user: { username: string } },
  ) {
    return await this.attemptsService.getAttemptById(id, req.user.username);
  }

  @ApiOperation({ summary: 'Delete a phishing attempt by ID' })
  @ApiResponse({ status: 200, description: 'Attempt deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Attempt belongs to another user.' })
  @ApiResponse({ status: 404, description: 'Attempt not found.' })
  @Delete(':id')
  async deleteAttempt(
    @Param('id') id: string,
    @Request() req: { user: { username: string } },
  ) {
    return await this.attemptsService.deleteAttempt(id, req.user.username);
  }
}
