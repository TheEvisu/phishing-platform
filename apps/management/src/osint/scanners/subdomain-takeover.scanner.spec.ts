import axios from 'axios';
import { promises as dns } from 'dns';
import { scanSubdomainTakeover } from './subdomain-takeover.scanner';

jest.mock('axios');
jest.mock('dns', () => ({
  promises: {
    resolveCname: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedDns = dns as jest.Mocked<typeof dns>;

beforeEach(() => jest.clearAllMocks());

describe('scanSubdomainTakeover', () => {
  it('returns empty array when no subdomains are provided', async () => {
    const result = await scanSubdomainTakeover([]);
    expect(result).toEqual([]);
  });

  it('detects GitHub Pages takeover when CNAME points to github.io and body matches', async () => {
    mockedDns.resolveCname = jest.fn().mockResolvedValue(['org.github.io']);
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 404,
      data: "There isn't a GitHub Pages site here.",
    });

    const result = await scanSubdomainTakeover(['blog.example.com']);

    expect(result).toHaveLength(1);
    expect(result[0].subdomain).toBe('blog.example.com');
    expect(result[0].service).toBe('GitHub Pages');
    expect(result[0].cname).toBe('org.github.io');
  });

  it('detects Heroku takeover when CNAME points to herokuapp.com and body matches', async () => {
    mockedDns.resolveCname = jest.fn().mockResolvedValue(['myapp.herokuapp.com']);
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 404,
      data: 'No such app',
    });

    const result = await scanSubdomainTakeover(['app.example.com']);

    expect(result).toHaveLength(1);
    expect(result[0].service).toBe('Heroku');
    expect(result[0].cname).toBe('myapp.herokuapp.com');
  });

  it('does not report takeover when CNAME matches service but body does not match fingerprint', async () => {
    mockedDns.resolveCname = jest.fn().mockResolvedValue(['org.github.io']);
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      data: '<html><h1>My Blog</h1></html>',
    });

    const result = await scanSubdomainTakeover(['blog.example.com']);

    expect(result).toEqual([]);
  });

  it('skips cname-gated signatures when subdomain has no CNAME', async () => {
    mockedDns.resolveCname = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 404,
      data: "There isn't a GitHub Pages site here.",
    });

    // GitHub Pages has a cnamePattern, so without a CNAME it should NOT match
    const result = await scanSubdomainTakeover(['blog.example.com']);

    expect(result).toEqual([]);
  });

  it('checks body-only signatures (no cnamePattern) even without CNAME', async () => {
    mockedDns.resolveCname = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 404,
      data: 'Sorry, this shop is currently unavailable.',
    });

    // Shopify has no cnamePattern - should match on body alone
    const result = await scanSubdomainTakeover(['shop.example.com']);

    expect(result).toHaveLength(1);
    expect(result[0].service).toBe('Shopify');
    expect(result[0].cname).toBeUndefined();
  });

  it('returns empty when HTTP fetch fails', async () => {
    mockedDns.resolveCname = jest.fn().mockResolvedValue(['org.github.io']);
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await scanSubdomainTakeover(['blog.example.com']);

    expect(result).toEqual([]);
  });

  it('limits probing to MAX_SUBDOMAINS (20)', async () => {
    mockedDns.resolveCname = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    mockedAxios.get = jest.fn().mockResolvedValue({ status: 200, data: 'ok' });

    const manySubdomains = Array.from({ length: 30 }, (_, i) => `sub${i}.example.com`);
    await scanSubdomainTakeover(manySubdomains);

    // At most 20 subdomains probed - 20 CNAME lookups + 20 HTTP fetches
    expect((mockedAxios.get as jest.Mock).mock.calls.length).toBeLessThanOrEqual(20);
  });

  it('includes evidence snippet in result', async () => {
    mockedDns.resolveCname = jest.fn().mockResolvedValue(['org.github.io']);
    const fingerprint = "There isn't a GitHub Pages site here. Check the source.";
    mockedAxios.get = jest.fn().mockResolvedValue({ status: 404, data: fingerprint });

    const result = await scanSubdomainTakeover(['docs.example.com']);

    expect(result[0].evidence).toBeTruthy();
    expect(result[0].evidence.length).toBeLessThanOrEqual(200);
  });
});
