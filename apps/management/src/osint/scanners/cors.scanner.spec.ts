import axios from 'axios';
import { scanCors } from './cors.scanner';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => jest.clearAllMocks());

describe('scanCors', () => {
  it('returns vulnerable=false when no CORS headers present', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({ status: 200, headers: {}, data: '' });

    const result = await scanCors('example.com');

    expect(result.vulnerable).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.checkedUrls).toHaveLength(3);
  });

  it('detects wildcard origin as medium risk', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      data: '',
    });

    const result = await scanCors('example.com');

    expect(result.vulnerable).toBe(true);
    expect(result.issues[0].issue).toBe('wildcard');
    expect(result.issues[0].risk).toBe('medium');
    expect(result.issues[0].allowCredentials).toBe(false);
  });

  it('escalates wildcard + credentials to high risk', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-credentials': 'true',
      },
      data: '',
    });

    const result = await scanCors('example.com');

    expect(result.issues[0].risk).toBe('high');
    expect(result.issues[0].allowCredentials).toBe(true);
  });

  it('detects reflects-origin as high risk', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      headers: {
        'access-control-allow-origin': 'https://cors-probe.security-scan.invalid',
      },
      data: '',
    });

    const result = await scanCors('example.com');

    expect(result.issues[0].issue).toBe('reflects-origin');
    expect(result.issues[0].risk).toBe('high');
    expect(result.issues[0].allowCredentials).toBe(false);
  });

  it('escalates reflects-origin + credentials to critical', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      headers: {
        'access-control-allow-origin': 'https://cors-probe.security-scan.invalid',
        'access-control-allow-credentials': 'true',
      },
      data: '',
    });

    const result = await scanCors('example.com');

    expect(result.issues[0].risk).toBe('critical');
    expect(result.issues[0].allowCredentials).toBe(true);
  });

  it('detects null-origin as medium risk', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      headers: { 'access-control-allow-origin': 'null' },
      data: '',
    });

    const result = await scanCors('example.com');

    expect(result.issues[0].issue).toBe('null-origin');
    expect(result.issues[0].risk).toBe('medium');
  });

  it('escalates null-origin + credentials to high risk', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      headers: {
        'access-control-allow-origin': 'null',
        'access-control-allow-credentials': 'true',
      },
      data: '',
    });

    const result = await scanCors('example.com');

    expect(result.issues[0].risk).toBe('high');
  });

  it('returns vulnerable=false on network error', async () => {
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await scanCors('example.com');

    expect(result.vulnerable).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it('ignores unrelated Allow-Origin (same-origin response)', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      headers: { 'access-control-allow-origin': 'https://example.com' },
      data: '',
    });

    const result = await scanCors('example.com');

    expect(result.vulnerable).toBe(false);
  });
});
