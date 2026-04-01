import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DomainsService, generateLookalikes } from './domains.service';
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

const mockCreate          = jest.fn();
const mockFindOne         = jest.fn();
const mockFind            = jest.fn();
const mockFindByIdAndUpdate = jest.fn();

function MockDomainScanModel() {}
Object.assign(MockDomainScanModel, {
  create:            mockCreate,
  findOne:           mockFindOne,
  find:              mockFind,
  findByIdAndUpdate: mockFindByIdAndUpdate,
});

describe('generateLookalikes', () => {
  it('generates TLD swap variants', () => {
    const results = generateLookalikes('acme.com');
    const domains = results.map((r) => r.domain);
    expect(domains).toContain('acme.net');
    expect(domains).toContain('acme.org');
    expect(domains).toContain('acme.io');
  });

  it('generates prefix variants', () => {
    const domains = generateLookalikes('acme.com').map((r) => r.domain);
    expect(domains).toContain('login-acme.com');
    expect(domains).toContain('secure-acme.com');
  });

  it('generates suffix variants', () => {
    const domains = generateLookalikes('acme.com').map((r) => r.domain);
    expect(domains).toContain('acme-login.com');
    expect(domains).toContain('acme-secure.com');
  });

  it('generates homoglyph variants (a -> 4)', () => {
    const domains = generateLookalikes('acme.com').map((r) => r.domain);
    expect(domains).toContain('4cme.com');
  });

  it('generates transposition variants', () => {
    const results = generateLookalikes('acme.com');
    const transpositions = results.filter((r) => r.technique === 'transposition');
    expect(transpositions.length).toBeGreaterThan(0);
  });

  it('does not include the original domain', () => {
    const domains = generateLookalikes('acme.com').map((r) => r.domain);
    expect(domains).not.toContain('acme.com');
  });

  it('does not produce duplicates', () => {
    const domains = generateLookalikes('acme.com').map((r) => r.domain);
    expect(domains.length).toBe(new Set(domains).size);
  });

  it('labels each result with a technique', () => {
    const results = generateLookalikes('acme.com');
    results.forEach((r) => expect(r.technique).toBeTruthy());
  });
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
    it('returns scanId immediately without waiting for DNS', async () => {
      const scanId = new Types.ObjectId();
      mockCreate.mockResolvedValue({ _id: scanId });
      mockFindByIdAndUpdate.mockResolvedValue(null);
      mockResolve4.mockResolvedValue(['1.2.3.4']);
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));

      const result = await service.scan('acme.com', orgId);

      expect(result).toEqual({ scanId: scanId.toString() });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          targetDomain: 'acme.com',
          status: 'pending',
          progress: 0,
        }),
      );
    });

    it('creates scan document with correct initial state', async () => {
      const scanId = new Types.ObjectId();
      mockCreate.mockResolvedValue({ _id: scanId });
      mockFindByIdAndUpdate.mockResolvedValue(null);
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));

      await service.scan('acme.com', orgId);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ results: [], totalChecked: 0, totalFound: 0 }),
      );
    });
  });

  describe('getScan', () => {
    it('returns scan when found', async () => {
      const scan = { _id: 'scan-1', targetDomain: 'acme.com', status: 'completed' };
      mockFindOne.mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(scan),
      });

      const result = await service.getScan('scan-1', orgId);
      expect(result).toBe(scan);
      expect(mockFindOne).toHaveBeenCalledWith({ _id: 'scan-1', organizationId: orgId });
    });

    it('throws NotFoundException when scan not found', async () => {
      mockFindOne.mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getScan('missing', orgId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLatest', () => {
    it('returns the latest completed scan', async () => {
      const scan = { targetDomain: 'acme.com', status: 'completed' };
      mockFindOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(scan),
      });

      const result = await service.getLatest(orgId);

      expect(mockFindOne).toHaveBeenCalledWith({ organizationId: orgId, status: 'completed' });
      expect(result).toBe(scan);
    });

    it('returns null when no completed scans exist', async () => {
      mockFindOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      expect(await service.getLatest(orgId)).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('queries by organizationId and limits to 10', async () => {
      const history = [{ targetDomain: 'acme.com' }];
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
