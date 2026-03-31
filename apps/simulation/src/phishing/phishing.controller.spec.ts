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
    it('should call service with request and serve intermediate page with external script', async () => {
      mockPhishingService.trackClick.mockResolvedValue({ metadata: {} });
      const req = { headers: {}, ip: '1.2.3.4' } as any;
      const res = { setHeader: jest.fn(), send: jest.fn() } as any;

      await controller.trackClick('uuid-1', req, res);

      expect(mockPhishingService.trackClick).toHaveBeenCalledWith('uuid-1', req);
      const html: string = res.send.mock.calls[0][0];
      expect(html).toContain('uuid-1');
      expect(html).toContain('data-beacon');
      expect(html).toContain('data-training');
      expect(html).toContain('src="/phishing/collector.js"');
      expect(html).not.toContain('<script>');
    });
  });

  describe('serveCollector', () => {
    it('should serve collector.js with correct content type', () => {
      const res = { setHeader: jest.fn(), send: jest.fn() } as any;

      controller.serveCollector(res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/javascript; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
      const js: string = res.send.mock.calls[0][0];
      expect(js).toContain('data-beacon');
      expect(js).toContain('data-training');
      expect(js).toContain('sendBeacon');
    });
  });
});
