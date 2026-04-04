import axios from 'axios';
import { scanEndpoints } from './endpoints.scanner';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const robotsTxt = `
User-agent: *
Disallow: /admin
Disallow: /private # internal
Disallow: /
`;

const sitemapXml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`;

beforeEach(() => jest.clearAllMocks());

describe('scanEndpoints', () => {
  it('parses disallowed paths from robots.txt (excludes bare /)', async () => {
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({ status: 200, data: robotsTxt })   // robots.txt
      .mockResolvedValueOnce({ status: 404, data: '' });           // sitemap.xml
    mockedAxios.head = jest.fn().mockResolvedValue({ status: 404, headers: {} });

    const result = await scanEndpoints('example.com');

    expect(result.robotsDisallowed).toEqual(['/admin', '/private']);
    expect(result.robotsDisallowed).not.toContain('/');
  });

  it('parses URLs from sitemap.xml', async () => {
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({ status: 404, data: '' })            // robots.txt
      .mockResolvedValueOnce({ status: 200, data: sitemapXml });   // sitemap.xml
    mockedAxios.head = jest.fn().mockResolvedValue({ status: 404, headers: {} });

    const result = await scanEndpoints('example.com');

    expect(result.sitemapUrls).toEqual([
      'https://example.com/',
      'https://example.com/about',
    ]);
  });

  it('reports exposed sensitive endpoints (non-404 responses)', async () => {
    mockedAxios.get = jest.fn()
      .mockResolvedValue({ status: 404, data: '' });

    mockedAxios.head = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/.env'))    return Promise.resolve({ status: 200, headers: {} });
      if (url.includes('/graphql')) return Promise.resolve({ status: 200, headers: {} });
      return Promise.resolve({ status: 404, headers: {} });
    });

    const result = await scanEndpoints('example.com');

    expect(result.sensitiveEndpoints.some((e) => e.path === '/.env' && e.risk === 'critical')).toBe(true);
    expect(result.sensitiveEndpoints.some((e) => e.path === '/graphql')).toBe(true);
    expect(result.sensitiveEndpoints.every((e) => e.status !== 404)).toBe(true);
  });

  it('captures redirect target for 3xx responses', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({ status: 404, data: '' });
    mockedAxios.head = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/admin'))
        return Promise.resolve({ status: 301, headers: { location: 'https://example.com/login' } });
      return Promise.resolve({ status: 404, headers: {} });
    });

    const result = await scanEndpoints('example.com');

    const adminEntry = result.sensitiveEndpoints.find((e) => e.path === '/admin');
    expect(adminEntry).toBeDefined();
    expect(adminEntry?.redirectTo).toBe('https://example.com/login');
  });

  it('returns empty arrays when robots.txt and sitemap are unavailable', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({ status: 404, data: '' });
    mockedAxios.head = jest.fn().mockResolvedValue({ status: 404, headers: {} });

    const result = await scanEndpoints('example.com');

    expect(result.robotsDisallowed).toEqual([]);
    expect(result.sitemapUrls).toEqual([]);
  });

  it('silently skips endpoints that throw (network error)', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({ status: 404, data: '' });
    mockedAxios.head = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await scanEndpoints('example.com');

    expect(result.sensitiveEndpoints).toEqual([]);
  });
});
