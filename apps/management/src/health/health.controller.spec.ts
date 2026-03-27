import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, MongooseHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

const mockHealthCheckService = {
  check: jest.fn(),
};

const mockMongooseHealth = {
  pingCheck: jest.fn(),
};

const mockMemoryHealth = {
  checkHeap: jest.fn(),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: MongooseHealthIndicator, useValue: mockMongooseHealth },
        { provide: MemoryHealthIndicator, useValue: mockMemoryHealth },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    jest.clearAllMocks();
  });

  it('should return health check result', async () => {
    const healthResult = {
      status: 'ok',
      info: { mongodb: { status: 'up' }, memory_heap: { status: 'up' } },
      error: {},
      details: { mongodb: { status: 'up' }, memory_heap: { status: 'up' } },
    };
    mockHealthCheckService.check.mockResolvedValue(healthResult);

    const result = await controller.check();

    expect(mockHealthCheckService.check).toHaveBeenCalledWith(expect.arrayContaining([
      expect.any(Function),
      expect.any(Function),
    ]));
    expect(result).toEqual(healthResult);
  });
});
