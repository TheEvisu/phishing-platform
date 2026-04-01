import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { DomainsService } from './domains.service';
import { DomainScan } from '../schemas/domain-scan.schema';

jest.mock('dns', () => ({
  promises: {
    resolve4:  jest.fn(),
    resolveMx: jest.fn(),
  },
}));

import { promises as dns } from 'dns';
const mockResolve4  = dns.resolve4  as jest.Mock;
const mockResolveMx = dns.resolveMx as jest.Mock;

const mockCreate  = jest.fn();
const mockFindOne = jest.fn();
const mockFind    = jest.fn();

function MockDomainScanModel() {}
Object.assign(MockDomainScanModel, {
  create:  mockCreate,
  findOne: mockFindOne,
  find:    mockFind,
});

describe('DomainsService', () => {
  let service: DomainsService;
  const orgId = new Types.ObjectId();

  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());
  afterEach(() => jest.clearAllTimers());

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainsService,
        { provide: getModelToken(DomainScan.name), useValue: MockDomainScanModel },
      ],
    }).compile();

    service = module.get<DomainsService>(DomainsService);
    jest.clearAllMocks();
  });

  describe('scan', () => {
    it('generates lookalikes and saves scan with dns results', async () => {
      mockResolve4.mockResolvedValue(['1.2.3.4']);
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));

      const saved = {
        organizationId: orgId,
        targetDomain: 'acme.com',
        results: [],
        totalChecked: 10,
        totalFound: 5,
      };
      mockCreate.mockResolvedValue(saved);

      const result = await service.scan('acme.com', orgId);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          targetDomain: 'acme.com',
          totalChecked: expect.any(Number),
          totalFound: expect.any(Number),
        }),
      );
      expect(result).toBe(saved);
    });

    it('marks domain as registered when A record resolves', async () => {
      mockResolve4.mockResolvedValue(['1.2.3.4']);
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);

      const registered = result.results.filter((r) => r.registered);
      expect(registered.length).toBeGreaterThan(0);
      registered.forEach((r) => {
        expect(r.hasA).toBe(true);
        expect(r.hasMx).toBe(false);
      });
    });

    it('marks hasMx true when MX records exist', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockResolvedValue([{ exchange: 'mail.acme.net', priority: 10 }]);
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);

      const withMx = result.results.filter((r) => r.hasMx);
      expect(withMx.length).toBeGreaterThan(0);
      withMx.forEach((r) => {
        expect(r.registered).toBe(true);
        expect(r.hasMx).toBe(true);
      });
    });

    it('marks domain as not registered when both DNS lookups fail', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);

      result.results.forEach((r) => {
        expect(r.registered).toBe(false);
        expect(r.hasA).toBe(false);
        expect(r.hasMx).toBe(false);
      });
      expect(result.totalFound).toBe(0);
    });

    it('generates TLD swap variants', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);
      const domains = result.results.map((r) => r.domain);

      expect(domains).toContain('acme.net');
      expect(domains).toContain('acme.org');
      expect(domains).toContain('acme.io');
    });

    it('generates prefix variants', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);
      const domains = result.results.map((r) => r.domain);

      expect(domains).toContain('login-acme.com');
      expect(domains).toContain('secure-acme.com');
      expect(domains).toContain('mail-acme.com');
    });

    it('generates suffix variants', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);
      const domains = result.results.map((r) => r.domain);

      expect(domains).toContain('acme-login.com');
      expect(domains).toContain('acme-secure.com');
    });

    it('generates homoglyph variants', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);
      const domains = result.results.map((r) => r.domain);

      // a -> 4
      expect(domains).toContain('4cme.com');
    });

    it('generates transposition variants', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);
      const domains = result.results.map((r) => r.domain);

      // acme -> caem, acem, amce
      expect(domains.some((d) => d.endsWith('.com') && d !== 'acme.com')).toBe(true);
      const transpositions = result.results.filter((r) => r.technique === 'transposition');
      expect(transpositions.length).toBeGreaterThan(0);
    });

    it('does not include the original domain in results', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);

      expect(result.results.map((r) => r.domain)).not.toContain('acme.com');
    });

    it('does not produce duplicate domains', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockCreate.mockImplementation(async (doc) => doc);

      const result = await service.scan('acme.com', orgId);
      const domains = result.results.map((r) => r.domain);
      const unique = new Set(domains);

      expect(domains.length).toBe(unique.size);
    });
  });

  describe('getLatest', () => {
    it('returns the most recent scan for the org', async () => {
      const scan = { targetDomain: 'acme.com', totalFound: 3 };
      mockFindOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(scan),
      });

      const result = await service.getLatest(orgId);

      expect(mockFindOne).toHaveBeenCalledWith({ organizationId: orgId });
      expect(result).toBe(scan);
    });

    it('returns null when no scans exist', async () => {
      mockFindOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getLatest(orgId);
      expect(result).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('returns up to 10 scans without results array', async () => {
      const history = [{ targetDomain: 'acme.com' }, { targetDomain: 'acme.com' }];
      mockFind.mockReturnValue({
        sort:   jest.fn().mockReturnThis(),
        limit:  jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean:   jest.fn().mockReturnThis(),
        exec:   jest.fn().mockResolvedValue(history),
      });

      const result = await service.getHistory(orgId);

      expect(mockFind).toHaveBeenCalledWith({ organizationId: orgId });
      expect(result).toBe(history);
    });
  });
});
