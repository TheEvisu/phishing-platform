import { Test, TestingModule } from '@nestjs/testing';
import { PhishingController } from './phishing.controller';
import { PhishingService } from './phishing.service';

const mockPhishingService = {
  sendPhishingEmail: jest.fn(),
  trackClick: jest.fn(),
};

describe('PhishingController', () => {
  let controller: PhishingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PhishingController],
      providers: [{ provide: PhishingService, useValue: mockPhishingService }],
    }).compile();

    controller = module.get<PhishingController>(PhishingController);
    jest.clearAllMocks();
  });

  describe('sendPhishing', () => {
    it('should call service and return result', async () => {
      const dto = {
        recipientEmail: 'target@example.com',
        subject: 'Test',
        content: 'Body',
        attemptId: 'uuid-1',
      };
      mockPhishingService.sendPhishingEmail.mockResolvedValue({ success: true, attemptId: 'uuid-1' });

      const result = await controller.sendPhishing(dto);

      expect(mockPhishingService.sendPhishingEmail).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ success: true, attemptId: 'uuid-1' });
    });
  });

  describe('trackClick', () => {
    it('should call service and redirect to training page', async () => {
      mockPhishingService.trackClick.mockResolvedValue({});
      const res = { redirect: jest.fn() } as any;

      await controller.trackClick('uuid-1', res);

      expect(mockPhishingService.trackClick).toHaveBeenCalledWith('uuid-1');
      expect(res.redirect).toHaveBeenCalledWith(302, expect.stringContaining('uuid-1'));
    });
  });
});
