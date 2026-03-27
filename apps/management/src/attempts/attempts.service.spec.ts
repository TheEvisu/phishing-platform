import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
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
    it('should return all attempts sorted by createdAt desc', async () => {
      const execMock = jest.fn().mockResolvedValue([mockAttempt]);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      mockAttemptModel.find.mockReturnValue({ sort: sortMock });

      const result = await service.getAllAttempts();

      expect(mockAttemptModel.find).toHaveBeenCalled();
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(result).toEqual([mockAttempt]);
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
    it('should return attempt by id', async () => {
      mockAttemptModel.findById.mockResolvedValue(mockAttempt);

      const result = await service.getAttemptById('attempt-id-1');

      expect(result).toEqual(mockAttempt);
    });

    it('should throw NotFoundException if not found', async () => {
      mockAttemptModel.findById.mockResolvedValue(null);

      await expect(service.getAttemptById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAttempt', () => {
    it('should delete attempt and return success message', async () => {
      mockAttemptModel.findByIdAndDelete.mockResolvedValue(mockAttempt);

      const result = await service.deleteAttempt('attempt-id-1');

      expect(result).toEqual({ message: 'Phishing attempt deleted successfully' });
    });

    it('should throw NotFoundException if attempt does not exist', async () => {
      mockAttemptModel.findByIdAndDelete.mockResolvedValue(null);

      await expect(service.deleteAttempt('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
