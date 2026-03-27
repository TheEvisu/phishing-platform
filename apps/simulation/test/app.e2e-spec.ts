import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';

import { PhishingController } from '../src/phishing/phishing.controller';
import { PhishingService } from '../src/phishing/phishing.service';
import { PhishingAttempt } from '../src/schemas/phishing-attempt.schema';
import { AttemptStatus } from '@app/shared';

const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

describe('Simulation Service (e2e)', () => {
  let app: INestApplication;

  const mockAttemptFindOne = jest.fn();
  const mockAttemptSave = jest.fn();

  function MockAttemptModel(dto: any) {
    return { ...dto, status: AttemptStatus.SENT, save: mockAttemptSave };
  }
  Object.assign(MockAttemptModel, { findOne: mockAttemptFindOne });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PhishingController],
      providers: [
        PhishingService,
        { provide: getModelToken(PhishingAttempt.name), useValue: MockAttemptModel },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockAttemptSave.mockResolvedValue(undefined);
    mockSendMail.mockResolvedValue({});
  });

  // ─── Send phishing email ──────────────────────────────────────────────────────

  describe('POST /phishing/send', () => {
    const validDto = {
      recipientEmail: 'target@example.com',
      subject: 'Test Subject',
      content: 'Click {{TRACKING_LINK}}',
      attemptId: 'uuid-1',
    };

    it('201: sends email and returns success', async () => {
      const res = await request(app.getHttpServer())
        .post('/phishing/send')
        .send(validDto)
        .expect(201);

      expect(res.body).toEqual({ success: true, attemptId: 'uuid-1' });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'target@example.com', subject: 'Test Subject' }),
      );
    });

    it('201: replaces {{TRACKING_LINK}} with real link in email', async () => {
      await request(app.getHttpServer()).post('/phishing/send').send(validDto).expect(201);

      const sentMail = mockSendMail.mock.calls[0][0];
      expect(sentMail.html).toContain('<a href=');
      expect(sentMail.html).not.toContain('{{TRACKING_LINK}}');
    });

    it('400: invalid recipient email', async () => {
      await request(app.getHttpServer())
        .post('/phishing/send')
        .send({ ...validDto, recipientEmail: 'not-an-email' })
        .expect(400);
    });

    it('400: missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/phishing/send')
        .send({ recipientEmail: 'target@example.com' })
        .expect(400);
    });

    it('500: SMTP failure propagates as error', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));

      await request(app.getHttpServer())
        .post('/phishing/send')
        .send(validDto)
        .expect(500);
    });
  });

  // ─── Track click ─────────────────────────────────────────────────────────────

  describe('GET /phishing/click/:attemptId', () => {
    it('200: updates attempt status to clicked and returns HTML alert', async () => {
      const saveMock = jest.fn().mockResolvedValue(undefined);
      const attempt = { status: AttemptStatus.SENT, clickedAt: undefined, save: saveMock };
      mockAttemptFindOne.mockResolvedValue(attempt);

      const res = await request(app.getHttpServer())
        .get('/phishing/click/uuid-1')
        .expect(200);

      expect(res.text).toContain('Phishing Test Alert');
      expect(attempt.status).toBe(AttemptStatus.CLICKED);
      expect(attempt.clickedAt).toBeInstanceOf(Date);
      expect(saveMock).toHaveBeenCalled();
    });

    it('200: still returns HTML when attempt is not found', async () => {
      mockAttemptFindOne.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/phishing/click/nonexistent')
        .expect(200);

      expect(res.text).toContain('Phishing Test Alert');
    });
  });
});
