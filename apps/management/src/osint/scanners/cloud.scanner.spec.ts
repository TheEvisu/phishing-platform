import axios from 'axios';
import { promises as dns } from 'dns';
import { scanCloud } from './cloud.scanner';

jest.mock('axios');
jest.mock('dns', () => ({
  promises: {
    resolve4: jest.fn(),
    resolveCname: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedDns = dns as jest.Mocked<typeof dns>;

beforeEach(() => jest.clearAllMocks());

describe('scanCloud', () => {
  it('detects cloud provider from CNAME pattern', async () => {
    mockedDns.resolve4.mockResolvedValue(['1.2.3.4'] as any);
    mockedDns.resolveCname.mockResolvedValue(['d1234.cloudfront.net'] as any);
    mockedAxios.get = jest.fn().mockResolvedValue({ data: { org: 'AS13335 Cloudflare', country: 'US' } });
    mockedAxios.head = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));

    const result = await scanCloud('example.com');

    expect(result.cloudProvider).toBe('AWS CloudFront');
    expect(result.cname).toBe('d1234.cloudfront.net');
  });

  it('detects cloud provider from ipinfo org when no CNAME match', async () => {
    mockedDns.resolve4.mockResolvedValue(['35.1.2.3'] as any);
    mockedDns.resolveCname.mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockResolvedValue({ data: { org: 'AS16509 Amazon', country: 'US' } });
    mockedAxios.head = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));

    const result = await scanCloud('example.com');

    expect(result.cloudProvider).toBe('AWS');
    expect(result.ip).toBe('35.1.2.3');
    expect(result.country).toBe('US');
  });

  it('populates ip, asn, org, country from ipinfo', async () => {
    mockedDns.resolve4.mockResolvedValue(['10.0.0.1'] as any);
    mockedDns.resolveCname.mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockResolvedValue({ data: { org: 'AS15169 Google LLC', country: 'US' } });
    mockedAxios.head = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));

    const result = await scanCloud('example.com');

    expect(result.asn).toBe('AS15169');
    expect(result.org).toBe('AS15169 Google LLC');
    expect(result.country).toBe('US');
  });

  it('reports s3BucketExposed when bucket returns 403', async () => {
    mockedDns.resolve4.mockRejectedValue(new Error('ENOTFOUND'));
    mockedDns.resolveCname.mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('no ip'));
    mockedAxios.head = jest.fn().mockResolvedValue({ status: 403 });

    const result = await scanCloud('example.com');

    expect(result.s3BucketExposed).toBe(true);
  });

  it('reports s3BucketExposed when bucket returns 200', async () => {
    mockedDns.resolve4.mockRejectedValue(new Error('ENOTFOUND'));
    mockedDns.resolveCname.mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('no ip'));
    mockedAxios.head = jest.fn().mockResolvedValue({ status: 200 });

    const result = await scanCloud('example.com');

    expect(result.s3BucketExposed).toBe(true);
  });

  it('s3BucketExposed is false for 404 response', async () => {
    mockedDns.resolve4.mockRejectedValue(new Error('ENOTFOUND'));
    mockedDns.resolveCname.mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('no ip'));
    mockedAxios.head = jest.fn().mockResolvedValue({ status: 404 });

    const result = await scanCloud('example.com');

    expect(result.s3BucketExposed).toBe(false);
  });

  it('returns minimal result when all lookups fail', async () => {
    mockedDns.resolve4.mockRejectedValue(new Error('ENOTFOUND'));
    mockedDns.resolveCname.mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('network'));
    mockedAxios.head = jest.fn().mockRejectedValue(new Error('network'));

    const result = await scanCloud('unknown-domain.xyz');

    expect(result.ip).toBeUndefined();
    expect(result.cloudProvider).toBeUndefined();
    expect(result.s3BucketExposed).toBe(false);
  });
});
