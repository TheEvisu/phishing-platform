import axios from 'axios';
import { EndpointsResult, SensitiveEndpoint } from '../../schemas/osint-scan.schema';

const SENSITIVE_PATHS = [
  { path: '/api',                risk: 'low'  },
  { path: '/api/v1',             risk: 'low'  },
  { path: '/api/v2',             risk: 'low'  },
  { path: '/graphql',            risk: 'medium' },
  { path: '/swagger',            risk: 'medium' },
  { path: '/swagger-ui.html',    risk: 'medium' },
  { path: '/openapi.json',       risk: 'medium' },
  { path: '/api-docs',           risk: 'medium' },
  { path: '/v1/api-docs',        risk: 'medium' },
  { path: '/admin',              risk: 'high'  },
  { path: '/wp-admin',           risk: 'high'  },
  { path: '/phpmyadmin',         risk: 'high'  },
  { path: '/.env',               risk: 'critical' },
  { path: '/config.json',        risk: 'critical' },
  { path: '/health',             risk: 'low'  },
  { path: '/status',             risk: 'low'  },
  { path: '/metrics',            risk: 'medium' },
  { path: '/actuator',           risk: 'medium' },
  { path: '/actuator/health',    risk: 'low'  },
  { path: '/actuator/env',       risk: 'critical' },
  { path: '/.git/HEAD',          risk: 'critical' },
  { path: '/server-status',      risk: 'medium' },
] as const;

function parseRobots(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.toLowerCase().startsWith('disallow:'))
    .map((l) => l.replace(/^disallow:\s*/i, '').split('#')[0].trim())
    .filter((p) => p && p !== '/');
}

function parseSitemap(content: string): string[] {
  const matches = content.matchAll(/<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi);
  return Array.from(matches, (m) => m[1]).slice(0, 50);
}

async function probeEndpoints(baseUrl: string): Promise<SensitiveEndpoint[]> {
  const BATCH = 5;
  const found: SensitiveEndpoint[] = [];

  for (let i = 0; i < SENSITIVE_PATHS.length; i += BATCH) {
    const batch = SENSITIVE_PATHS.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async ({ path, risk }) => {
        try {
          const res = await axios.head(`${baseUrl}${path}`, {
            timeout: 4_000,
            maxRedirects: 0,
            validateStatus: () => true,
          });
          const status = res.status;
          if (status === 404 || status === 410) return null;
          const redirectTo = status >= 300 && status < 400
            ? (res.headers['location'] ?? undefined)
            : undefined;
          return { path, status, redirectTo, risk } as SensitiveEndpoint;
        } catch {
          return null;
        }
      }),
    );
    found.push(...results.filter((r): r is SensitiveEndpoint => r !== null));
  }

  return found;
}

export async function scanEndpoints(domain: string): Promise<EndpointsResult> {
  const base = `https://${domain}`;

  const [robotsRes, sitemapRes] = await Promise.allSettled([
    axios.get(`${base}/robots.txt`, { timeout: 8_000, validateStatus: () => true }),
    axios.get(`${base}/sitemap.xml`, { timeout: 8_000, validateStatus: () => true }),
  ]);

  const robotsDisallowed = robotsRes.status === 'fulfilled' && robotsRes.value.status === 200
    ? parseRobots(String(robotsRes.value.data))
    : [];

  const sitemapUrls = sitemapRes.status === 'fulfilled' && sitemapRes.value.status === 200
    ? parseSitemap(String(sitemapRes.value.data))
    : [];

  const sensitiveEndpoints = await probeEndpoints(base);

  return { robotsDisallowed, sitemapUrls, sensitiveEndpoints };
}
