import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import axios from 'axios';
import { AttemptsService } from './attempts.service';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockAttempt = {
  _id: 'attempt-id-1',
  email: 'target@example.com',
  subject: 'Test Subject',
  content: 'Test Content',
  status: 'sent',
  attemptId: 'uuid-1234',
  createdBy: 'testuser',
  save: jest.fn(),
};

const mockAttemptModel = {
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
};

function MockAttemptModelConstructor(dto: any) {
  return { ...mockAttempt, ...dto, save: jest.fn().mockResolvedValue(undefined) };
}
Object.assign(MockAttemptModelConstructor, mockAttemptModel);

describe('AttemptsService', () => {
  let service: AttemptsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        { provide: getModelToken(PhishingAttempt.name), useValue: MockAttemptModelConstructor },
      ],
    }).compile();

    service = module.get<AttemptsService>(AttemptsService);
    jest.clearAllMocks();
  });

  describe('getAllAttempts', () => {
    it('should return paginated attempts filtered by username', async () => {
      const execMock = jest.fn().mockResolvedValue([mockAttempt]);
      const limitMock = jest.fn().mockReturnValue({ exec: execMock });
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
      mockAttemptModel.find.mockReturnValue({ sort: sortMock });
      mockAttemptModel.countDocuments.mockResolvedValue(1);

      const result = await service.getAllAttempts('testuser', 1, 10);

      expect(mockAttemptModel.find).toHaveBeenCalledWith({ createdBy: 'testuser' });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(skipMock).toHaveBeenCalledWith(0);
      expect(limitMock).toHaveBeenCalledWith(10);
      expect(mockAttemptModel.countDocuments).toHaveBeenCalledWith({ createdBy: 'testuser' });
      expect(result).toEqual({ data: [mockAttempt], total: 1, page: 1, limit: 10, totalPages: 1 });
    });

    it('should calculate skip correctly for page 2', async () => {
      const execMock = jest.fn().mockResolvedValue([]);
      const limitMock = jest.fn().mockReturnValue({ exec: execMock });
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
      mockAttemptModel.find.mockReturnValue({ sort: sortMock });
      mockAttemptModel.countDocuments.mockResolvedValue(15);

      const result = await service.getAllAttempts('testuser', 2, 10);

      expect(skipMock).toHaveBeenCalledWith(10);
      expect(result.totalPages).toBe(2);
    });
  });

  describe('createAttempt', () => {
    it('should create attempt and call simulation service', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      const result = await service.createAttempt(
        { email: 'target@example.com', subject: 'Subj', content: 'Body' },
        'testuser',
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/phishing/send'),
        expect.objectContaining({ recipientEmail: 'target@example.com' }),
      );
      expect(result).toBeDefined();
    });

    it('should set status to failed and rethrow if simulation service fails', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        service.createAttempt(
          { email: 'target@example.com', subject: 'Subj', content: 'Body' },
          'testuser',
        ),
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('getAttemptById', () => {
    it('should return attempt if owned by user', async () => {
      mockAttemptModel.findById.mockResolvedValue(mockAttempt);

      const result = await service.getAttemptById('attempt-id-1', 'testuser');

      expect(result).toEqual(mockAttempt);
    });

    it('should throw NotFoundException if not found', async () => {
      mockAttemptModel.findById.mockResolvedValue(null);

      await expect(service.getAttemptById('nonexistent', 'testuser')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if attempt belongs to another user', async () => {
      mockAttemptModel.findById.mockResolvedValue(mockAttempt);

      await expect(service.getAttemptById('attempt-id-1', 'otheruser')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deleteAttempt', () => {
    it('should delete attempt if owned by user', async () => {
      mockAttemptModel.findById.mockResolvedValue(mockAttempt);
      mockAttemptModel.findByIdAndDelete.mockResolvedValue(mockAttempt);

      const result = await service.deleteAttempt('attempt-id-1', 'testuser');

      expect(result).toEqual({ message: 'Phishing attempt deleted successfully' });
    });

    it('should throw NotFoundException if attempt does not exist', async () => {
      mockAttemptModel.findById.mockResolvedValue(null);

      await expect(service.deleteAttempt('nonexistent', 'testuser')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if attempt belongs to another user', async () => {
      mockAttemptModel.findById.mockResolvedValue(mockAttempt);

      await expect(service.deleteAttempt('attempt-id-1', 'otheruser')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
