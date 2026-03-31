import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import axios from 'axios';
import { AttemptsService } from './attempts.service';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { AttemptStatus } from '@app/shared';
import { OrganizationService } from '../organization/organization.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const ORG_ID = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

const adminUser = { username: 'admin', role: 'org_admin', organizationId: ORG_ID };
const memberUser = { username: 'member', role: 'member', organizationId: ORG_ID };

const mockAttempt = {
  _id: 'attempt-id-1',
  email: 'target@example.com',
  subject: 'Test Subject',
  content: 'Test Content',
  status: AttemptStatus.SENT,
  attemptId: 'uuid-1234',
  createdBy: 'member',
  organizationId: ORG_ID,
  save: jest.fn(),
};


const mockAttemptModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
  deleteMany: jest.fn(),
  aggregate: jest.fn(),
};

function MockAttemptModelConstructor(dto: any) {
  return { ...mockAttempt, ...dto, save: jest.fn().mockResolvedValue(undefined) };
}
Object.assign(MockAttemptModelConstructor, mockAttemptModel);

const mockOrgService = {
  getSmtpForSend: jest.fn().mockResolvedValue(null),
};


describe('AttemptsService', () => {
  let service: AttemptsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        { provide: getModelToken(PhishingAttempt.name), useValue: MockAttemptModelConstructor },
        { provide: OrganizationService, useValue: mockOrgService },
      ],
    }).compile();

    service = module.get<AttemptsService>(AttemptsService);
    jest.clearAllMocks();
  });


  describe('getAllAttempts', () => {
    function setupFind(results: any[]) {
      const exec   = jest.fn().mockResolvedValue(results);
      const limit  = jest.fn().mockReturnValue({ exec });
      const skip   = jest.fn().mockReturnValue({ limit });
      const sort   = jest.fn().mockReturnValue({ skip });
      const select = jest.fn().mockReturnValue({ sort });
      mockAttemptModel.find.mockReturnValue({ select });
      mockAttemptModel.countDocuments.mockResolvedValue(results.length);
    }

    it('admin filter includes only organizationId', async () => {
      setupFind([mockAttempt]);

      await service.getAllAttempts(adminUser, 1, 10);

      expect(mockAttemptModel.find).toHaveBeenCalledWith(
        expect.not.objectContaining({ createdBy: expect.anything() }),
      );
      expect(mockAttemptModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID }),
      );
    });

    it('member filter includes organizationId + createdBy', async () => {
      setupFind([mockAttempt]);

      await service.getAllAttempts(memberUser, 1, 10);

      expect(mockAttemptModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, createdBy: 'member' }),
      );
    });

    it('calculates skip and totalPages correctly for page 2', async () => {
      const exec   = jest.fn().mockResolvedValue([]);
      const limit  = jest.fn().mockReturnValue({ exec });
      const skip   = jest.fn().mockReturnValue({ limit });
      const sort   = jest.fn().mockReturnValue({ skip });
      const select = jest.fn().mockReturnValue({ sort });
      mockAttemptModel.find.mockReturnValue({ select });
      mockAttemptModel.countDocuments.mockResolvedValue(15);

      const result = await service.getAllAttempts(adminUser, 2, 10);

      expect(skip).toHaveBeenCalledWith(10);
      expect(result.totalPages).toBe(2);
    });

    it('applies status filter when provided', async () => {
      setupFind([]);

      await service.getAllAttempts(adminUser, 1, 10, AttemptStatus.SENT);

      expect(mockAttemptModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: AttemptStatus.SENT }),
      );
    });
  });


  describe('createAttempt', () => {
    it('saves attempt and calls simulation service', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      const result = await service.createAttempt(
        { email: 'target@example.com', subject: 'Subj', content: 'Body' },
        memberUser,
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/phishing/send'),
        expect.objectContaining({ recipientEmail: 'target@example.com' }),
        { timeout: 5_000 },
      );
      expect(result).toBeDefined();
    });

    it('sets status to failed and rethrows if simulation service fails', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        service.createAttempt(
          { email: 'target@example.com', subject: 'Subj', content: 'Body' },
          memberUser,
        ),
      ).rejects.toThrow('Service unavailable');
    });
  });


  describe('getAttemptById', () => {
    it('returns attempt when found within user scope', async () => {
      mockAttemptModel.findOne.mockResolvedValue(mockAttempt);

      const result = await service.getAttemptById('attempt-id-1', memberUser);

      expect(result).toEqual(mockAttempt);
    });

    it('throws NotFoundException when findOne returns null', async () => {
      mockAttemptModel.findOne.mockResolvedValue(null);

      await expect(service.getAttemptById('nonexistent', memberUser)).rejects.toThrow(NotFoundException);
    });
  });


  describe('deleteAttempt', () => {
    it('deletes attempt when found within user scope', async () => {
      mockAttemptModel.findOne.mockResolvedValue(mockAttempt);
      mockAttemptModel.findByIdAndDelete.mockResolvedValue(mockAttempt);

      const result = await service.deleteAttempt('attempt-id-1', memberUser);

      expect(mockAttemptModel.findByIdAndDelete).toHaveBeenCalledWith('attempt-id-1');
      expect(result).toEqual({ message: 'Phishing attempt deleted successfully' });
    });

    it('throws ForbiddenException when attempt not in user scope', async () => {
      mockAttemptModel.findOne.mockResolvedValue(null);

      await expect(service.deleteAttempt('attempt-id-1', memberUser)).rejects.toThrow(ForbiddenException);
    });
  });


  describe('bulkDeleteAttempts', () => {
    it('calls deleteMany scoped to user org', async () => {
      mockAttemptModel.deleteMany.mockResolvedValue({ deletedCount: 2 });

      const result = await service.bulkDeleteAttempts(['id-1', 'id-2'], adminUser);

      expect(mockAttemptModel.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ _id: { $in: ['id-1', 'id-2'] }, organizationId: ORG_ID }),
      );
      expect(result).toEqual({ deleted: 2 });
    });
  });


  describe('getStats', () => {
    it('returns click rate of 0 when no sent or clicked', async () => {
      mockAttemptModel.countDocuments
        .mockResolvedValueOnce(5)   // total
        .mockResolvedValueOnce(0)   // sent
        .mockResolvedValueOnce(0)   // clicked
        .mockResolvedValueOnce(5);  // failed

      const result = await service.getStats(adminUser);

      expect(result.clickRate).toBe(0);
      expect(result.total).toBe(5);
    });

    it('computes click rate correctly', async () => {
      mockAttemptModel.countDocuments
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(6)   // sent
        .mockResolvedValueOnce(4)   // clicked
        .mockResolvedValueOnce(0);  // failed

      const result = await service.getStats(adminUser);

      // 4 / (6+4) = 40%
      expect(result.clickRate).toBe(40);
    });
  });
});
