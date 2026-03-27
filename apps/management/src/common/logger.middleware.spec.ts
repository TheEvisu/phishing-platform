import { Logger } from '@nestjs/common';
import { LoggerMiddleware } from './logger.middleware';

describe('LoggerMiddleware', () => {
  let middleware: LoggerMiddleware;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    middleware = new LoggerMiddleware();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function makeReq(overrides = {}): any {
    return {
      method: 'GET',
      originalUrl: '/test',
      params: {},
      query: {},
      body: {},
      headers: {},
      ...overrides,
    };
  }

  it('should call next()', () => {
    const next = jest.fn();
    middleware.use(makeReq(), {} as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('should log method and url', () => {
    middleware.use(makeReq({ method: 'POST', originalUrl: '/auth/login' }), {} as any, jest.fn());
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('POST /auth/login'));
  });

  it('should not log Authorization header value', () => {
    const req = makeReq({ headers: { authorization: 'Bearer secret-token' } });
    middleware.use(req, {} as any, jest.fn());
    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).not.toContain('secret-token');
  });

  it('should log query params', () => {
    const req = makeReq({ query: { page: '1' } });
    middleware.use(req, {} as any, jest.fn());
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"page":"1"'));
  });

  it('should handle unserializable body gracefully', () => {
    const req = makeReq();
    const circular: any = {};
    circular.self = circular;
    req.body = circular;

    expect(() => middleware.use(req, {} as any, jest.fn())).not.toThrow();
  });
});
