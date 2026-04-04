import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OsintService } from './osint.service';
import { OsintScan } from '../schemas/osint-scan.schema';

const orgId = new Types.ObjectId();

const mockScanDoc = {
  _id: new Types.ObjectId(),
  organizationId: orgId,
  targetDomain: 'example.com',
  status: 'pending',
  progress: 0,
  results: null,
  save: jest.fn(),
};

const mockModel = {
  create: jest.fn().mockResolvedValue(mockScanDoc),
  findByIdAndUpdate: jest.fn().mockResolvedValue(null),
  findOne: jest.fn(),
  find: jest.fn(),
};

jest.mock('./scanners/whois.scanner', () => ({ scanWhois: jest.fn().mockResolvedValue({ registrar: 'Test', nameservers: [], status: [] }) }));
jest.mock('./scanners/dns.scanner', () => ({ scanDns: jest.fn().mockResolvedValue({ spfValid: false, mxRecords: [], nameservers: [] }) }));
jest.mock('./scanners/subdomains.scanner', () => ({ scanSubdomains: jest.fn().mockResolvedValue([]) }));
jest.mock('./scanners/headers.scanner', () => ({ scanSecurityHeaders: jest.fn().mockResolvedValue({ headers: {}, passingCount: 0, totalChecked: 0 }) }));
jest.mock('./scanners/tech.scanner', () => ({ scanTechStack: jest.fn().mockResolvedValue([]) }));
jest.mock('./scanners/wayback.scanner', () => ({ scanWayback: jest.fn().mockResolvedValue({ totalSnapshots: 0, yearlyBreakdown: {} }) }));
jest.mock('./scanners/github.scanner', () => ({ scanGithubExposure: jest.fn().mockResolvedValue([]) }));
jest.mock('./scanners/endpoints.scanner', () => ({ scanEndpoints: jest.fn().mockResolvedValue({ robotsDisallowed: [], sitemapUrls: [], sensitiveEndpoints: [] }) }));
jest.mock('./scanners/mobile.scanner', () => ({ scanMobile: jest.fn().mockResolvedValue({ apps: [], hasAppleAssociation: false, hasAndroidAssociation: false, appStoreLinksInHtml: [] }) }));
jest.mock('./scanners/cloud.scanner', () => ({ scanCloud: jest.fn().mockResolvedValue({ s3BucketExposed: false }) }));

describe('OsintService', () => {
  let service: OsintService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OsintService,
        { provide: getModelToken(OsintScan.name), useValue: mockModel },
      ],
    }).compile();

    service = module.get<OsintService>(OsintService);
  });

  describe('startScan', () => {
    it('creates a scan document and returns scanId', async () => {
      const result = await service.startScan('example.com', orgId);
      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetDomain: 'example.com', organizationId: orgId, status: 'pending' }),
      );
      expect(result).toHaveProperty('scanId');
    });
  });

  describe('getScan', () => {
    it('returns scan when found for the org', async () => {
      const leanExec = { lean: () => ({ exec: () => Promise.resolve(mockScanDoc) }) };
      mockModel.findOne.mockReturnValue(leanExec);

      const result = await service.getScan(mockScanDoc._id.toString(), orgId);
      expect(result).toBe(mockScanDoc);
    });

    it('throws NotFoundException when scan not found', async () => {
      const leanExec = { lean: () => ({ exec: () => Promise.resolve(null) }) };
      mockModel.findOne.mockReturnValue(leanExec);

      await expect(service.getScan('nonexistent', orgId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHistory', () => {
    it('returns last 10 scans without results', async () => {
      const scans = [mockScanDoc];
      const chain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(scans),
      };
      mockModel.find.mockReturnValue(chain);

      const result = await service.getHistory(orgId);
      expect(result).toBe(scans);
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(chain.select).toHaveBeenCalledWith('-results');
    });
  });
});
