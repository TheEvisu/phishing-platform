import axios from 'axios';
import { EndpointsResult, SensitiveEndpoint } from '../../schemas/osint-scan.schema';

const SENSITIVE_PATHS: Array<{ path: string; risk: string; note: string }> = [
  { path: '/api',             risk: 'low',      note: 'API root - confirm auth is enforced and no unauthenticated endpoints are exposed' },
  { path: '/api/v1',          risk: 'low',      note: 'Versioned API - check for deprecated endpoints that may lack modern auth controls' },
  { path: '/api/v2',          risk: 'low',      note: 'Versioned API - check for deprecated endpoints that may lack modern auth controls' },
  { path: '/graphql',         risk: 'medium',   note: 'GraphQL endpoint - introspection may expose full schema; disable in production' },
  { path: '/swagger',         risk: 'medium',   note: 'Swagger UI exposes full API spec; should not be publicly accessible in production' },
  { path: '/swagger-ui.html', risk: 'medium',   note: 'Swagger UI exposes full API spec; should not be publicly accessible in production' },
  { path: '/openapi.json',    risk: 'medium',   note: 'OpenAPI spec exposed - reveals all endpoints, parameters, and data models' },
  { path: '/api-docs',        risk: 'medium',   note: 'API documentation exposed - reveals endpoints and authentication requirements' },
  { path: '/v1/api-docs',     risk: 'medium',   note: 'API documentation exposed - reveals endpoints and authentication requirements' },
  { path: '/admin',           risk: 'high',     note: 'Admin panel publicly reachable - should be behind VPN or IP allowlist' },
  { path: '/wp-admin',        risk: 'high',     note: 'WordPress admin panel exposed - target for brute-force and credential stuffing attacks' },
  { path: '/phpmyadmin',      risk: 'high',     note: 'phpMyAdmin exposes direct database access; remove or restrict to internal networks only' },
  { path: '/.env',            risk: 'critical', note: 'Environment file leaked - may contain database passwords, API keys, and secrets' },
  { path: '/config.json',     risk: 'critical', note: 'Configuration file exposed - may contain credentials, connection strings, or internal URLs' },
  { path: '/health',          risk: 'low',      note: 'Health check endpoint - may reveal internal service versions or dependency status' },
  { path: '/status',          risk: 'low',      note: 'Status endpoint - verify it does not expose internal infrastructure details' },
  { path: '/metrics',         risk: 'medium',   note: 'Metrics endpoint (Prometheus/StatsD) - exposes performance data and internal service topology' },
  { path: '/actuator',        risk: 'medium',   note: 'Spring Boot Actuator - can expose heap dumps, env vars, and bean definitions' },
  { path: '/actuator/health', risk: 'low',      note: 'Spring Boot health check - verify sensitive details are not included in the response' },
  { path: '/actuator/env',    risk: 'critical', note: 'Spring Boot env actuator - exposes all environment variables including secrets' },
  { path: '/.git/HEAD',       risk: 'critical', note: 'Git repository exposed - full source code may be downloadable via /.git/ path traversal' },
  { path: '/server-status',   risk: 'medium',   note: 'Apache server-status page - reveals active connections, request URIs, and worker info' },
];

const SENSITIVE_PATH_SET = new Set(SENSITIVE_PATHS.map((p) => p.path));
const MAX_SUBDOMAIN_HOSTS = 10;
const MAX_ROBOTS_PATHS = 20;
const PREVIEW_MAX_CHARS = 2_000;

const RISK_ORDER = ['low', 'medium', 'high', 'critical'] as const;

function computeEffectiveRisk(inherentRisk: string, status: number): string {
  const idx = RISK_ORDER.indexOf(inherentRisk as typeof RISK_ORDER[number]);
  if (idx === -1) return inherentRisk;
  let drop = 0;
  if (status === 401 || status === 403) drop = 2;
  else if ((status >= 300 && status < 400) || (status >= 400 && status < 600)) drop = 1;
  return RISK_ORDER[Math.max(0, idx - drop)];
}

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

async function fetchPreview(url: string): Promise<string | undefined> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 5_000,
      responseType: 'text',
      validateStatus: (s) => s === 200,
      maxContentLength: PREVIEW_MAX_CHARS * 4,
    });
    const contentType = String(res.headers['content-type'] ?? '');
    if (contentType.includes('html')) return undefined;
    const text = String(res.data).trim().slice(0, PREVIEW_MAX_CHARS);
    return text || undefined;
  } catch {
    return undefined;
  }
}

async function probeOne(
  baseUrl: string,
  host: string,
  path: string,
  risk: string,
  note: string,
): Promise<SensitiveEndpoint | null> {
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
    const effectiveRisk = computeEffectiveRisk(risk, status);

    const responsePreview = status === 200
      ? await fetchPreview(`${baseUrl}${path}`)
      : undefined;

    return { host, path, status, redirectTo, risk, effectiveRisk, note, responsePreview };
  } catch {
    return null;
  }
}

async function probeHost(host: string): Promise<SensitiveEndpoint[]> {
  const baseUrl = `https://${host}`;
  const BATCH = 5;
  const found: SensitiveEndpoint[] = [];

  for (let i = 0; i < SENSITIVE_PATHS.length; i += BATCH) {
    const batch = SENSITIVE_PATHS.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(({ path, risk, note }) => probeOne(baseUrl, host, path, risk, note)),
    );
    found.push(...results.filter((r): r is SensitiveEndpoint => r !== null));
  }

  return found;
}

async function probeRobotsPaths(host: string, robotsPaths: string[]): Promise<SensitiveEndpoint[]> {
  const baseUrl = `https://${host}`;
  // Only probe paths not already covered by SENSITIVE_PATHS
  const candidates = robotsPaths
    .filter((p) => !SENSITIVE_PATH_SET.has(p))
    .slice(0, MAX_ROBOTS_PATHS);

  const results = await Promise.all(
    candidates.map((path) =>
      probeOne(
        baseUrl,
        host,
        path,
        'medium',
        'Path hidden from crawlers via robots.txt Disallow but publicly accessible',
      ),
    ),
  );

  return results.filter((r): r is SensitiveEndpoint => r !== null);
}

export async function scanEndpoints(domain: string, liveSubdomains: string[] = []): Promise<EndpointsResult> {
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

  const hostsToProbe = [domain, ...liveSubdomains.slice(0, MAX_SUBDOMAIN_HOSTS)];
  const [standardResults, robotsResults] = await Promise.all([
    Promise.all(hostsToProbe.map((h) => probeHost(h))),
    probeRobotsPaths(domain, robotsDisallowed),
  ]);

  const sensitiveEndpoints = [...standardResults.flat(), ...robotsResults];

  return { robotsDisallowed, sitemapUrls, sensitiveEndpoints };
}
