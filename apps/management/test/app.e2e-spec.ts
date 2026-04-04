import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import axios from 'axios';
import { Types } from 'mongoose';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { AttemptsController } from '../src/attempts/attempts.controller';
import { AttemptsService } from '../src/attempts/attempts.service';
import { OrganizationService } from '../src/organization/organization.service';
import { OsintController } from '../src/osint/osint.controller';
import { OsintService } from '../src/osint/osint.service';
import { User } from '../src/schemas/user.schema';
import { Organization } from '../src/schemas/organization.schema';
import { PhishingAttempt } from '../src/schemas/phishing-attempt.schema';
import { Campaign } from '../src/schemas/campaign.schema';
import { OsintScan } from '../src/schemas/osint-scan.schema';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const JWT_SECRET = 'e2e-test-secret';
process.env.JWT_SECRET = JWT_SECRET;

describe('Management Service (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let authCookie: string;

  const orgId = new Types.ObjectId();

  const mockUserFindOne = jest.fn();
  const mockUserCreate = jest.fn();

  const mockOrgFindOne = jest.fn();
  const mockOrgFindById = jest.fn();
  const mockOrgCreate = jest.fn();

  const mockAttemptFind = jest.fn();
  const mockAttemptFindOne = jest.fn();
  const mockAttemptFindByIdAndDelete = jest.fn();
  const mockAttemptFindByIdAndUpdate = jest.fn();
  const mockAttemptCountDocuments = jest.fn();
  const mockAttemptSave = jest.fn();

  let hashedPassword: string;

  const testUser = {
    _id: 'user-id-1',
    username: 'testuser',
    email: 'test@example.com',
    role: 'org_admin',
    organizationId: orgId,
    password: '',
  };

  const testOrg = {
    _id: orgId,
    name: 'Test Org',
    slug: 'test-org',
    inviteCode: 'INV-TESTCODE',
  };

  const ownedAttempt = {
    _id: 'attempt-id-1',
    email: 'a@b.com',
    subject: 'Test',
    content: 'Body {{TRACKING_LINK}}',
    createdBy: 'testuser',
    organizationId: orgId,
    status: 'pending',
  };

  function MockUserModel(dto: any) {
    return { _id: 'user-id-new', ...dto, save: mockAttemptSave };
  }
  Object.assign(MockUserModel, {
    findOne: mockUserFindOne,
    create: mockUserCreate,
  });

  function MockOrgModel(dto: any) {
    return { _id: orgId, ...dto };
  }
  Object.assign(MockOrgModel, {
    findOne: mockOrgFindOne,
    findById: mockOrgFindById,
    create: mockOrgCreate,
  });

  function MockAttemptModel(dto: any) {
    return { _id: 'attempt-id-1', ...dto, status: 'pending', save: mockAttemptSave };
  }
  Object.assign(MockAttemptModel, {
    find: mockAttemptFind,
    findOne: mockAttemptFindOne,
    findByIdAndDelete: mockAttemptFindByIdAndDelete,
    findOneAndUpdate: mockAttemptFindByIdAndUpdate,
    countDocuments: mockAttemptCountDocuments,
  });

  const mockOrgService = {
    getSmtpForSend: jest.fn().mockResolvedValue(null),
  };

  const MockCampaignModel = Object.assign(
    function () { return {}; },
    { updateOne: jest.fn().mockResolvedValue({}) },
  );

  const scanId = new Types.ObjectId().toString();

  const mockOsintService = {
    startScan: jest.fn().mockResolvedValue({ scanId }),
    getScan: jest.fn(),
    getLatest: jest.fn(),
    getHistory: jest.fn().mockResolvedValue([]),
  };

  const MockOsintScanModel = Object.assign(function () { return {}; }, {});

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash('testpass123', 1);
    testUser.password = hashedPassword;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '24h' } }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AuthController, AttemptsController, OsintController],
      providers: [
        AuthService,
        AttemptsService,
        JwtStrategy,
        { provide: getModelToken(User.name), useValue: MockUserModel },
        { provide: getModelToken(Organization.name), useValue: MockOrgModel },
        { provide: getModelToken(PhishingAttempt.name), useValue: MockAttemptModel },
        { provide: getModelToken(Campaign.name), useValue: MockCampaignModel },
        { provide: getModelToken(OsintScan.name), useValue: MockOsintScanModel },
        { provide: OrganizationService, useValue: mockOrgService },
        { provide: OsintService, useValue: mockOsintService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    jwtService = moduleFixture.get(JwtService);
    const token = jwtService.sign({
      username: 'testuser',
      sub: 'user-id-1',
      organizationId: orgId,
      role: 'org_admin',
    });
    authCookie = `access_token=${token}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockAttemptSave.mockResolvedValue(undefined);
    mockUserFindOne.mockResolvedValue({ ...testUser });
    mockOrgFindById.mockResolvedValue(testOrg);
    mockOrgService.getSmtpForSend.mockResolvedValue(null);
    mockAttemptCountDocuments.mockResolvedValue(0);
    mockAttemptFindByIdAndUpdate.mockResolvedValue(null);
    mockOsintService.startScan.mockResolvedValue({ scanId });
    mockOsintService.getHistory.mockResolvedValue([]);
  });

  describe('POST /auth/register-org', () => {
    const validDto = {
      organizationName: 'Acme Corp',
      username: 'admin',
      email: 'admin@acme.com',
      password: 'securepass123',
    };

    it('201: creates org + admin, sets httpOnly cookie', async () => {
      mockUserFindOne.mockResolvedValueOnce(null);
      mockOrgFindOne.mockResolvedValueOnce(null);
      mockOrgCreate.mockResolvedValueOnce({ ...testOrg, _id: orgId });
      mockUserCreate.mockResolvedValueOnce({ ...testUser, username: 'admin', email: 'admin@acme.com' });

      const res = await request(app.getHttpServer())
        .post('/auth/register-org')
        .send(validDto)
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('access_token');
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    });

    it('400: missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/register-org')
        .send({ username: 'admin' })
        .expect(400);
    });

    it('409: username already taken', async () => {
      mockUserFindOne.mockResolvedValueOnce(testUser);

      await request(app.getHttpServer())
        .post('/auth/register-org')
        .send(validDto)
        .expect(409);
    });
  });

  describe('POST /auth/register', () => {
    const validDto = {
      inviteCode: 'INV-TESTCODE',
      username: 'member1',
      email: 'member@example.com',
      password: 'password123',
    };

    it('201: registers member via invite code, sets httpOnly cookie', async () => {
      mockOrgFindOne.mockResolvedValueOnce(testOrg);
      mockUserFindOne.mockResolvedValueOnce(null);
      mockUserCreate.mockResolvedValueOnce({ ...testUser, username: 'member1', role: 'member' });

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validDto)
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.headers['set-cookie'][0]).toContain('access_token');
    });

    it('400: missing inviteCode', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'u', email: 'u@e.com', password: 'pass123' })
        .expect(400);
    });

    it('404: invalid invite code', async () => {
      mockOrgFindOne.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validDto, inviteCode: 'INV-INVALID' })
        .expect(404);
    });

    it('409: username or email already taken', async () => {
      mockOrgFindOne.mockResolvedValueOnce(testOrg);
      mockUserFindOne.mockResolvedValueOnce(testUser);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(validDto)
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('201: valid credentials set httpOnly cookie', async () => {
      mockUserFindOne.mockResolvedValueOnce({ ...testUser, password: hashedPassword });
      mockOrgFindById.mockResolvedValueOnce(testOrg);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'testuser', password: 'testpass123' })
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user.username).toBe('testuser');
      expect(res.headers['set-cookie'][0]).toContain('access_token');
      expect(res.body).not.toHaveProperty('access_token');
    });

    it('400: missing username', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ password: 'testpass123' })
        .expect(400);
    });

    it('401: wrong password', async () => {
      mockUserFindOne.mockResolvedValueOnce({ ...testUser, password: hashedPassword });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'testuser', password: 'wrongpassword' })
        .expect(401);
    });

    it('401: user not found', async () => {
      mockUserFindOne.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'nobody', password: 'testpass123' })
        .expect(401);
    });
  });

  describe('GET /auth/profile', () => {
    it('200: returns user profile with valid cookie', async () => {
      mockUserFindOne.mockResolvedValueOnce({ ...testUser });

      const res = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toMatchObject({ username: 'testuser' });
    });

    it('401: no cookie provided', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('401: malformed token in cookie', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Cookie', 'access_token=invalid.jwt.token')
        .expect(401);
    });
  });

  describe('GET /attempts', () => {
    it('200: returns paginated attempts for current user', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      mockAttemptFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([ownedAttempt]),
      });
      mockAttemptCountDocuments.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/attempts')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
      expect(res.body.data[0]).toMatchObject({ email: 'a@b.com', createdBy: 'testuser' });
    });

    it('200: respects page and limit query params', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      mockAttemptFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      mockAttemptCountDocuments.mockResolvedValue(25);

      const res = await request(app.getHttpServer())
        .get('/attempts?page=2&limit=5')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toMatchObject({ page: 2, limit: 5, total: 25, totalPages: 5 });
    });

    it('401: no cookie', async () => {
      await request(app.getHttpServer()).get('/attempts').expect(401);
    });
  });

  describe('POST /attempts', () => {
    const validDto = { email: 'target@example.com', subject: 'Test Subject', content: 'Body' };

    it('201: creates attempt and calls simulation service', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      mockAttemptSave.mockResolvedValueOnce(undefined);
      mockedAxios.post.mockResolvedValue({ data: {} });

      const res = await request(app.getHttpServer())
        .post('/attempts')
        .set('Cookie', authCookie)
        .send(validDto)
        .expect(201);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/phishing/send'),
        expect.objectContaining({ recipientEmail: 'target@example.com' }),
        { timeout: 5_000 },
      );
      expect(res.body).toMatchObject({ email: 'target@example.com', createdBy: 'testuser' });
    });

    it('400: invalid email in body', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      await request(app.getHttpServer())
        .post('/attempts')
        .set('Cookie', authCookie)
        .send({ ...validDto, email: 'not-an-email' })
        .expect(400);
    });

    it('400: missing subject and content', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      await request(app.getHttpServer())
        .post('/attempts')
        .set('Cookie', authCookie)
        .send({ email: 'target@example.com' })
        .expect(400);
    });

    it('401: no cookie', async () => {
      await request(app.getHttpServer()).post('/attempts').send(validDto).expect(401);
    });
  });

  describe('GET /attempts/:id', () => {
    it('200: returns attempt owned by current user', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      mockAttemptFindOne.mockResolvedValueOnce(ownedAttempt);

      const res = await request(app.getHttpServer())
        .get('/attempts/attempt-id-1')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toMatchObject({ email: 'a@b.com' });
    });

    it('404: attempt not found', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      mockAttemptFindOne.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/attempts/nonexistent-id-000000000000')
        .set('Cookie', authCookie)
        .expect(404);
    });

    it('401: no cookie', async () => {
      await request(app.getHttpServer()).get('/attempts/attempt-id-1').expect(401);
    });
  });

  describe('DELETE /attempts/:id', () => {
    it('200: deletes attempt owned by current user', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      mockAttemptFindOne.mockResolvedValueOnce(ownedAttempt);
      mockAttemptFindByIdAndDelete.mockResolvedValueOnce(ownedAttempt);

      const res = await request(app.getHttpServer())
        .delete('/attempts/attempt-id-1')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toEqual({ message: 'Phishing attempt deleted successfully' });
    });

    it('403: attempt not found/not owned', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      mockAttemptFindOne.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .delete('/attempts/attempt-id-1')
        .set('Cookie', authCookie)
        .expect(403);
    });

    it('401: no cookie', async () => {
      await request(app.getHttpServer()).delete('/attempts/attempt-id-1').expect(401);
    });
  });

  describe('POST /osint/scan', () => {
    it('201: starts scan and returns scanId', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });

      const res = await request(app.getHttpServer())
        .post('/osint/scan')
        .set('Cookie', authCookie)
        .send({ domain: 'example.com' })
        .expect(201);

      expect(res.body).toHaveProperty('scanId');
      expect(mockOsintService.startScan).toHaveBeenCalledWith('example.com', orgId);
    });

    it('400: invalid domain format', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });

      await request(app.getHttpServer())
        .post('/osint/scan')
        .set('Cookie', authCookie)
        .send({ domain: 'not a domain' })
        .expect(400);
    });

    it('400: missing domain field', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });

      await request(app.getHttpServer())
        .post('/osint/scan')
        .set('Cookie', authCookie)
        .send({})
        .expect(400);
    });

    it('401: no cookie', async () => {
      await request(app.getHttpServer())
        .post('/osint/scan')
        .send({ domain: 'example.com' })
        .expect(401);
    });
  });

  describe('GET /osint/results/latest', () => {
    it('200: returns latest completed scan', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      const latestScan = { _id: scanId, targetDomain: 'example.com', status: 'completed', progress: 100, results: {} };
      mockOsintService.getLatest.mockResolvedValue(latestScan);

      const res = await request(app.getHttpServer())
        .get('/osint/results/latest')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toMatchObject({ targetDomain: 'example.com', status: 'completed' });
    });

    it('200: returns empty when no completed scan exists', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      mockOsintService.getLatest.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/osint/results/latest')
        .set('Cookie', authCookie)
        .expect(200);

      expect(mockOsintService.getLatest).toHaveBeenCalledWith(orgId);
    });

    it('401: no cookie', async () => {
      await request(app.getHttpServer()).get('/osint/results/latest').expect(401);
    });
  });

  describe('GET /osint/:scanId', () => {
    it('200: returns scan by ID', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      const scanDoc = { _id: scanId, targetDomain: 'example.com', status: 'running', progress: 50 };
      mockOsintService.getScan.mockResolvedValue(scanDoc);

      const res = await request(app.getHttpServer())
        .get(`/osint/${scanId}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toMatchObject({ status: 'running', progress: 50 });
    });

    it('404: scan not found', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      const { NotFoundException } = await import('@nestjs/common');
      mockOsintService.getScan.mockRejectedValue(new NotFoundException());

      await request(app.getHttpServer())
        .get('/osint/nonexistent-scan-id')
        .set('Cookie', authCookie)
        .expect(404);
    });

    it('401: no cookie', async () => {
      await request(app.getHttpServer()).get(`/osint/${scanId}`).expect(401);
    });
  });

  describe('GET /osint', () => {
    it('200: returns scan history', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });
      const history = [
        { _id: scanId, targetDomain: 'example.com', status: 'completed', progress: 100 },
      ];
      mockOsintService.getHistory.mockResolvedValue(history);

      const res = await request(app.getHttpServer())
        .get('/osint')
        .set('Cookie', authCookie)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toMatchObject({ targetDomain: 'example.com' });
    });

    it('200: returns empty array when no history', async () => {
      mockUserFindOne.mockResolvedValue({ ...testUser });

      const res = await request(app.getHttpServer())
        .get('/osint')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('401: no cookie', async () => {
      await request(app.getHttpServer()).get('/osint').expect(401);
    });
  });
});
