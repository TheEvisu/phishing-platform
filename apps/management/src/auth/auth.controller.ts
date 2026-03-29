import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterOrgDto, RegisterDto, LoginDto } from '../dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000, // 24h — matches JWT expiry
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new organization + admin account' })
  @ApiResponse({ status: 201, description: 'Organization created, access_token set as httpOnly cookie.' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register-org')
  async registerOrg(
    @Body() dto: RegisterOrgDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerOrg(dto);
    res.cookie('access_token', result.access_token, COOKIE_OPTIONS);
    return { user: result.user };
  }

  @ApiOperation({ summary: 'Register as a member via invite code' })
  @ApiResponse({ status: 201, description: 'User registered, access_token set as httpOnly cookie.' })
  @ApiResponse({ status: 404, description: 'Invalid invite code.' })
  @ApiResponse({ status: 409, description: 'Username or email already taken.' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    res.cookie('access_token', result.access_token, COOKIE_OPTIONS);
    return { user: result.user };
  }

  @ApiOperation({ summary: 'Login with username and password' })
  @ApiResponse({ status: 201, description: 'Login successful, access_token set as httpOnly cookie.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    res.cookie('access_token', result.access_token, COOKIE_OPTIONS);
    return { user: result.user };
  }

  @ApiOperation({ summary: 'Logout — clears the auth cookie' })
  @ApiResponse({ status: 200, description: 'Logged out.' })
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    return { message: 'Logged out' };
  }

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Returns the authenticated user.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: { user: unknown }) {
    return req.user;
  }
}
