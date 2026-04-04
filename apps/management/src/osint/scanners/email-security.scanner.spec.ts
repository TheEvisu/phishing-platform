import axios from 'axios';
import { promises as dns } from 'dns';
import { scanEmailSecurity } from './email-security.scanner';

jest.mock('axios');
jest.mock('dns', () => ({
  promises: {
    resolveTxt: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedDns = dns as jest.Mocked<typeof dns>;

beforeEach(() => jest.clearAllMocks());

describe('scanEmailSecurity', () => {
  it('detects DKIM when a known selector has a valid DKIM1 TXT record', async () => {
    mockedDns.resolveTxt = jest.fn().mockImplementation((name: string) => {
      if (name === 'google._domainkey.example.com') return Promise.resolve([['v=DKIM1; k=rsa; p=MIGf']]);
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));

    const result = await scanEmailSecurity('example.com');

    expect(result.dkimFound).toBe(true);
    expect(result.dkim).toEqual(expect.arrayContaining([{ selector: 'google' }]));
  });

  it('returns dkimFound=false when no selectors resolve', async () => {
    mockedDns.resolveTxt = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('network'));

    const result = await scanEmailSecurity('example.com');

    expect(result.dkimFound).toBe(false);
    expect(result.dkim).toEqual([]);
  });

  it('detects MTA-STS with enforce mode from policy file', async () => {
    mockedDns.resolveTxt = jest.fn().mockImplementation((name: string) => {
      if (name === '_mta-sts.example.com') return Promise.resolve([['v=STSv1; id=20230101']]);
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockedAxios.get = jest.fn().mockImplementation((url: string) => {
      if (url.includes('mta-sts.example.com')) {
        return Promise.resolve({ status: 200, data: 'version: STSv1\nmode: enforce\nmx: mail.example.com\nmax_age: 86400' });
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });

    const result = await scanEmailSecurity('example.com');

    expect(result.mtaSts).toBe(true);
    expect(result.mtaStsMode).toBe('enforce');
  });

  it('detects MTA-STS in testing mode', async () => {
    mockedDns.resolveTxt = jest.fn().mockImplementation((name: string) => {
      if (name === '_mta-sts.example.com') return Promise.resolve([['v=STSv1; id=20230101']]);
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockedAxios.get = jest.fn().mockResolvedValue({ status: 200, data: 'version: STSv1\nmode: testing\nmax_age: 86400' });

    const result = await scanEmailSecurity('example.com');

    expect(result.mtaSts).toBe(true);
    expect(result.mtaStsMode).toBe('testing');
  });

  it('returns mtaSts=false when no _mta-sts TXT record', async () => {
    mockedDns.resolveTxt = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('network'));

    const result = await scanEmailSecurity('example.com');

    expect(result.mtaSts).toBe(false);
    expect(result.mtaStsMode).toBeUndefined();
  });

  it('detects DNSSEC when Google DoH returns DS Answer records', async () => {
    mockedDns.resolveTxt = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockImplementation((url: string) => {
      if (url.includes('dns.google')) {
        return Promise.resolve({ data: { Answer: [{ type: 43, data: 'dsrecorddata' }] } });
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });

    const result = await scanEmailSecurity('example.com');

    expect(result.dnssec).toBe(true);
  });

  it('returns dnssec=false when Google DoH returns empty Answer', async () => {
    mockedDns.resolveTxt = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockImplementation((url: string) => {
      if (url.includes('dns.google')) return Promise.resolve({ data: { Answer: [] } });
      return Promise.reject(new Error('ENOTFOUND'));
    });

    const result = await scanEmailSecurity('example.com');

    expect(result.dnssec).toBe(false);
  });

  it('detects BIMI and extracts logo URL', async () => {
    mockedDns.resolveTxt = jest.fn().mockImplementation((name: string) => {
      if (name === 'default._bimi.example.com') {
        return Promise.resolve([['v=BIMI1; l=https://example.com/logo.svg; a=']]);
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('network'));

    const result = await scanEmailSecurity('example.com');

    expect(result.bimi).toBe(true);
    expect(result.bimiUrl).toBe('https://example.com/logo.svg');
  });

  it('returns bimi=false when no BIMI record exists', async () => {
    mockedDns.resolveTxt = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('network'));

    const result = await scanEmailSecurity('example.com');

    expect(result.bimi).toBe(false);
    expect(result.bimiUrl).toBeUndefined();
  });

  it('returns all-false result when all lookups fail', async () => {
    mockedDns.resolveTxt = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('network'));

    const result = await scanEmailSecurity('unknown.example.com');

    expect(result.dkimFound).toBe(false);
    expect(result.mtaSts).toBe(false);
    expect(result.dnssec).toBe(false);
    expect(result.bimi).toBe(false);
  });
});
