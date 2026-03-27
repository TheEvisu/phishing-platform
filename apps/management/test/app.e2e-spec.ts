import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import axios from 'axios';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { AttemptsController } from '../src/attempts/attempts.controller';
import { AttemptsService } from '../src/attempts/attempts.service';
import { User } from '../src/schemas/user.schema';
import { PhishingAttempt } from '../src/schemas/phishing-attempt.schema';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const JWT_SECRET = 'e2e-test-secret';
process.env.JWT_SECRET = JWT_SECRET;

describe('Management Service (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let authToken: string;

  const mockUserFindOne = jest.fn();
  const mockUserSave = jest.fn();

  const mockAttemptFind = jest.fn();
  const mockAttemptFindById = jest.fn();
  const mockAttemptFindByIdAndDelete = jest.fn();
  const mockAttemptCountDocuments = jest.fn();
  const mockAttemptSave = jest.fn();

  let hashedPassword: string;

  const testUser = {
    _id: 'user-id-1',
    username: 'testuser',
    email: 'test@example.com',
    role: 'admin',
  };

  const ownedAttempt = {
    _id: 'attempt-id-1',
    email: 'a@b.com',
    createdBy: 'testuser',
  };

  function MockUserModel(dto: any) {
    return {
      _id: 'user-id-1',
      username: dto.username,
      email: dto.email,
      password: dto.password,
      role: 'admin',
      save: mockUserSave,
    };
  }
  Object.assign(MockUserModel, { findOne: mockUserFindOne });

  function MockAttemptModel(dto: any) {
    return { _id: 'attempt-id-1', ...dto, status: 'pending', save: mockAttemptSave };
  }
  Object.assign(MockAttemptModel, {
    find: mockAttemptFind,
    findById: mockAttemptFindById,
    findByIdAndDelete: mockAttemptFindByIdAndDelete,
    countDocuments: mockAttemptCountDocuments,
  });

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash('testpass123', 1);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '24h' } }),
      ],
      controllers: [AuthController, AttemptsController],
      providers: [
        AuthService,
        AttemptsService,
        JwtStrategy,
        { provide: getModelToken(User.name), useValue: MockUserModel },
        { provide: getModelToken(PhishingAttempt.name), useValue: MockAttemptModel },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    jwtService = moduleFixture.get(JwtService);
    authToken = jwtService.sign({ username: 'testuser', sub: 'user-id-1' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockUserSave.mockResolvedValue(undefined);
    mockAttemptSave.mockResolvedValue(undefined);
    mockUserFindOne.mockResolvedValue({ ...testUser, password: hashedPassword });
  });

  // ─── Auth ────────────────────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('201: registers new user and returns access_token', async () => {
      mockUserFindOne.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'newuser', email: 'new@example.com', password: 'password123' })
        .expect(201);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body.user).toMatchObject({ username: 'newuser', email: 'new@example.com' });
    });

    it('400: invalid email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'user', email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('400: password too short (< 6 chars)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'user', email: 'user@example.com', password: '123' })
        .expect(400);
    });

    it('400: missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com' })
        .expect(400);
    });

    it('409: username or email already taken', async () => {
      mockUserFindOne.mockResolvedValueOnce({ ...testUser, password: hashedPassword });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'testuser', email: 'test@example.com', password: 'password123' })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('201: valid credentials return access_token', async () => {
      mockUserFindOne.mockResolvedValueOnce({ ...testUser, password: hashedPassword });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'testuser', password: 'testpass123' })
        .expect(201);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body.user).toMatchObject({ username: 'testuser' });
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
    it('200: returns user profile with valid JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ username: 'testuser', email: 'test@example.com' });
    });

    it('401: no JWT provided', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('401: malformed JWT', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });
  });

  // ─── Attempts ────────────────────────────────────────────────────────────────

  describe('GET /attempts', () => {
    it('200: returns paginated attempts for current user', async () => {
      mockAttemptFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([ownedAttempt]),
            }),
          }),
        }),
      });
      mockAttemptCountDocuments.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/attempts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ data: [ownedAttempt], total: 1, page: 1, limit: 10, totalPages: 1 });
    });

    it('200: respects page and limit query params', async () => {
      mockAttemptFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
          }),
        }),
      });
      mockAttemptCountDocuments.mockResolvedValue(25);

      const res = await request(app.getHttpServer())
        .get('/attempts?page=2&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ page: 2, limit: 5, total: 25, totalPages: 5 });
    });

    it('401: no JWT', async () => {
      await request(app.getHttpServer()).get('/attempts').expect(401);
    });
  });

  describe('POST /attempts', () => {
    const validDto = { email: 'target@example.com', subject: 'Test Subject', content: 'Body' };

    it('201: creates attempt and calls simulation service', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      const res = await request(app.getHttpServer())
        .post('/attempts')
        .set('Authorization', `Bearer ${authToken}`)
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
      await request(app.getHttpServer())
        .post('/attempts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...validDto, email: 'not-an-email' })
        .expect(400);
    });

    it('400: missing subject and content', async () => {
      await request(app.getHttpServer())
        .post('/attempts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'target@example.com' })
        .expect(400);
    });

    it('401: no JWT', async () => {
      await request(app.getHttpServer()).post('/attempts').send(validDto).expect(401);
    });
  });

  describe('GET /attempts/:id', () => {
    it('200: returns attempt owned by current user', async () => {
      mockAttemptFindById.mockResolvedValue(ownedAttempt);

      const res = await request(app.getHttpServer())
        .get('/attempts/attempt-id-1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toEqual(ownedAttempt);
    });

    it('403: attempt belongs to another user', async () => {
      mockAttemptFindById.mockResolvedValue({ ...ownedAttempt, createdBy: 'otheruser' });

      await request(app.getHttpServer())
        .get('/attempts/attempt-id-1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });

    it('404: attempt not found', async () => {
      mockAttemptFindById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/attempts/nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('401: no JWT', async () => {
      await request(app.getHttpServer()).get('/attempts/attempt-id-1').expect(401);
    });
  });

  describe('DELETE /attempts/:id', () => {
    it('200: deletes attempt owned by current user', async () => {
      mockAttemptFindById.mockResolvedValue(ownedAttempt);
      mockAttemptFindByIdAndDelete.mockResolvedValue(ownedAttempt);

      const res = await request(app.getHttpServer())
        .delete('/attempts/attempt-id-1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Phishing attempt deleted successfully' });
    });

    it('403: attempt belongs to another user', async () => {
      mockAttemptFindById.mockResolvedValue({ ...ownedAttempt, createdBy: 'otheruser' });

      await request(app.getHttpServer())
        .delete('/attempts/attempt-id-1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });

    it('404: attempt not found', async () => {
      mockAttemptFindById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/attempts/nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('401: no JWT', async () => {
      await request(app.getHttpServer()).delete('/attempts/attempt-id-1').expect(401);
    });
  });
});
