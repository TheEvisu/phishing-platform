import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TrainingService } from './training.service';

// Public endpoints - no JwtAuthGuard.
// The attemptId is a UUID (128-bit entropy) which acts as an implicit capability token.
@ApiTags('training')
@Controller('training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @ApiOperation({ summary: 'Get training status for an attempt (public)' })
  @Get(':attemptId')
  getStatus(@Param('attemptId') attemptId: string) {
    return this.trainingService.getStatus(attemptId);
  }

  @ApiOperation({ summary: 'Mark training as viewed (public)' })
  @Post(':attemptId/viewed')
  markViewed(@Param('attemptId') attemptId: string) {
    return this.trainingService.markViewed(attemptId);
  }
}
