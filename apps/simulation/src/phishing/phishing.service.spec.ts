import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PhishingService } from './phishing.service';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { AttemptStatus } from '@app/shared';

const mockAttempt = {
  recipientEmail: 'target@example.com',
  subject: 'Test',
  content: 'Body',
  attemptId: 'uuid-1',
  status: AttemptStatus.SENT,
  clickedAt: undefined as Date | undefined,
  save: jest.fn(),
};

const mockAttemptModel = {
  findOne: jest.fn(),
};

function MockAttemptModelConstructor(dto: any) {
  return { ...mockAttempt, ...dto, save: jest.fn().mockResolvedValue(undefined) };
}
Object.assign(MockAttemptModelConstructor, mockAttemptModel);

const mockTransporter = {
  sendMail: jest.fn(),
};

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => mockTransporter),
}));

describe('PhishingService', () => {
  let service: PhishingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhishingService,
        { provide: getModelToken(PhishingAttempt.name), useValue: MockAttemptModelConstructor },
      ],
    }).compile();

    service = module.get<PhishingService>(PhishingService);
    jest.clearAllMocks();
  });

  describe('sendPhishingEmail', () => {
    const dto = {
      recipientEmail: 'target@example.com',
      subject: 'Test Subject',
      content: 'Click here: {{TRACKING_LINK}}',
      attemptId: 'uuid-1',
    };

    it('should send email and return success', async () => {
      mockTransporter.sendMail.mockResolvedValue({});

      const result = await service.sendPhishingEmail(dto);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'target@example.com', subject: 'Test Subject' }),
      );
      expect(result).toEqual({ success: true, attemptId: 'uuid-1' });
    });

    it('should replace {{TRACKING_LINK}} in email content', async () => {
      mockTransporter.sendMail.mockResolvedValue({});

      await service.sendPhishingEmail(dto);

      const sentMail = mockTransporter.sendMail.mock.calls[0][0];
      expect(sentMail.html).toContain('<a href=');
      expect(sentMail.html).not.toContain('{{TRACKING_LINK}}');
    });

    it('should set status to failed and rethrow on smtp error', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));

      await expect(service.sendPhishingEmail(dto)).rejects.toThrow('SMTP error');
    });
  });

  describe('trackClick', () => {
    it('should update status to clicked and set clickedAt', async () => {
      const saveMock = jest.fn().mockResolvedValue(undefined);
      const attempt = { ...mockAttempt, status: AttemptStatus.SENT, save: saveMock };
      mockAttemptModel.findOne.mockResolvedValue(attempt);

      await service.trackClick('uuid-1');

      expect(attempt.status).toBe(AttemptStatus.CLICKED);
      expect(attempt.clickedAt).toBeInstanceOf(Date);
      expect(saveMock).toHaveBeenCalled();
    });

    it('should return null if attempt not found', async () => {
      mockAttemptModel.findOne.mockResolvedValue(null);

      const result = await service.trackClick('nonexistent');

      expect(result).toBeNull();
    });
  });
});
