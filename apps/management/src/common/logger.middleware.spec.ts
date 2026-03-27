import { LoggerMiddleware } from './logger.middleware';

describe('LoggerMiddleware', () => {
  let middleware: LoggerMiddleware;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    middleware = new LoggerMiddleware();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
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
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('POST /auth/login'));
  });

  it('should redact Authorization header', () => {
    const req = makeReq({ headers: { authorization: 'Bearer secret-token' } });
    middleware.use(req, {} as any, jest.fn());
    const logged = consoleSpy.mock.calls[0][0] as string;
    expect(logged).not.toContain('secret-token');
    expect(logged).toContain('[REDACTED]');
  });

  it('should log query params', () => {
    const req = makeReq({ query: { page: '1' } });
    middleware.use(req, {} as any, jest.fn());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"page":"1"'));
  });

  it('should handle unserializable body gracefully', () => {
    const req = makeReq();
    const circular: any = {};
    circular.self = circular;
    req.body = circular;

    expect(() => middleware.use(req, {} as any, jest.fn())).not.toThrow();
  });
});
