import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { User } from '../schemas/user.schema';
import { Organization } from '../schemas/organization.schema';
import { RegisterOrgDto, RegisterDto, LoginDto, ChangePasswordDto } from '../dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Organization.name) private orgModel: Model<Organization>,
    private jwtService: JwtService,
  ) {}

  async registerOrg(dto: RegisterOrgDto) {
    const { organizationName, username, email, password } = dto;

    const existingUser = await this.userModel.findOne({ $or: [{ username }, { email }] });
    if (existingUser) throw new ConflictException('Username or email already exists');

    const slug = organizationName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const existingOrg = await this.orgModel.findOne({ slug });
    if (existingOrg) throw new ConflictException('Organization name already taken');

    const inviteCode = `INV-${randomBytes(4).toString('hex').toUpperCase()}`;
    const org = await this.orgModel.create({ name: organizationName, slug, inviteCode });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await this.userModel.create({
      username, email, password: hashedPassword,
      organizationId: org._id, role: 'org_admin',
    });

    return this.buildResponse(user, org);
  }

  async register(dto: RegisterDto) {
    const { inviteCode, username, email, password } = dto;

    const org = await this.orgModel.findOne({ inviteCode });
    if (!org) throw new NotFoundException('Invalid invite code');

    const existingUser = await this.userModel.findOne({ $or: [{ username }, { email }] });
    if (existingUser) throw new ConflictException('Username or email already exists');

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await this.userModel.create({
      username, email, password: hashedPassword,
      organizationId: org._id, role: 'member',
    });

    return this.buildResponse(user, org);
  }

  async login(dto: LoginDto) {
    const { username, password } = dto;

    const user = await this.userModel.findOne({ username });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    const org = await this.orgModel.findById(user.organizationId);
    return this.buildResponse(user, org);
  }

  async changePassword(dto: ChangePasswordDto, username: string) {
    const user = await this.userModel.findOne({ username });
    if (!user) throw new UnauthorizedException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    user.password = await bcrypt.hash(dto.newPassword, 12);
    await user.save();
    return { message: 'Password updated successfully' };
  }

  async validateUser(username: string) {
    const user = await this.userModel.findOne({ username });
    this.logger.debug(`validateUser: found=${!!user}`);
    if (!user) return null;
    return {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
  }

  private buildResponse(user: User, org: Organization | null) {
    const payload = {
      username: user.username,
      sub: user._id,
      organizationId: user.organizationId,
      role: user.role,
    };
    const token = this.jwtService.sign(payload);
    return {
      access_token: token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: org?.name ?? '',
      },
    };
  }
}
