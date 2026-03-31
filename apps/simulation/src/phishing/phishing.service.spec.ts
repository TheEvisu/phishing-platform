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
  findOneAndUpdate: jest.fn(),
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
    const mockReq = {
      headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'en-US,en;q=0.9' },
      ip: '1.2.3.4',
    } as any;

    it('should call findOneAndUpdate with CLICKED status and return metadata', async () => {
      mockAttemptModel.findOneAndUpdate.mockResolvedValue({ clickMetadata: {} });

      const result = await service.trackClick('uuid-1', mockReq);

      expect(mockAttemptModel.findOneAndUpdate).toHaveBeenCalledWith(
        { attemptId: 'uuid-1' },
        expect.objectContaining({ status: AttemptStatus.CLICKED }),
        { new: true },
      );
      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('ip', '1.2.3.4');
    });

    it('should still return metadata even when attempt is not found', async () => {
      mockAttemptModel.findOneAndUpdate.mockResolvedValue(null);

      const result = await service.trackClick('nonexistent', mockReq);

      // notifyManagement fires but we don't await it - result is still metadata object
      expect(result).toHaveProperty('metadata');
    });
  });
});
