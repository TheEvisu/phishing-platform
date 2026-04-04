import axios from 'axios';
import { EndpointsResult, SensitiveEndpoint } from '../../schemas/osint-scan.schema';

interface SensitivePath {
  path: string;
  risk: string;
  note: string;
  /**
   * When a 200 is returned, the response body must match this pattern to count as a real
   * finding. Prevents false positives from frameworks (Next.js, Nuxt, etc.) that serve a
   * custom 404 page with HTTP 200 for any unknown path.
   */
  confirm?: RegExp;
}

const SENSITIVE_PATHS: SensitivePath[] = [
  { path: '/api',             risk: 'low',      note: 'API root - confirm auth is enforced and no unauthenticated endpoints are exposed',
                                                 confirm: /\"data\"|\"error\"|\"message\"|\"status\"|\"result\"|\"version\"/i },
  { path: '/api/v1',          risk: 'low',      note: 'Versioned API - check for deprecated endpoints that may lack modern auth controls',
                                                 confirm: /\"data\"|\"error\"|\"message\"|\"status\"|\"result\"|\"version\"/i },
  { path: '/api/v2',          risk: 'low',      note: 'Versioned API - check for deprecated endpoints that may lack modern auth controls',
                                                 confirm: /\"data\"|\"error\"|\"message\"|\"status\"|\"result\"|\"version\"/i },
  { path: '/graphql',         risk: 'medium',   note: 'GraphQL endpoint - introspection may expose full schema; disable in production',
                                                 confirm: /"data"|"errors"|"__schema"|graphql/i },
  { path: '/swagger',         risk: 'medium',   note: 'Swagger UI exposes full API spec; should not be publicly accessible in production',
                                                 confirm: /swagger|openapi|Swagger UI/i },
  { path: '/swagger-ui.html', risk: 'medium',   note: 'Swagger UI exposes full API spec; should not be publicly accessible in production',
                                                 confirm: /swagger|Swagger UI/i },
  { path: '/openapi.json',    risk: 'medium',   note: 'OpenAPI spec exposed - reveals all endpoints, parameters, and data models',
                                                 confirm: /"openapi"|"swagger"/i },
  { path: '/api-docs',        risk: 'medium',   note: 'API documentation exposed - reveals endpoints and authentication requirements',
                                                 confirm: /swagger|openapi|"paths"/i },
  { path: '/v1/api-docs',     risk: 'medium',   note: 'API documentation exposed - reveals endpoints and authentication requirements',
                                                 confirm: /swagger|openapi|"paths"/i },
  { path: '/admin',           risk: 'high',     note: 'Admin panel publicly reachable - should be behind VPN or IP allowlist' },
  { path: '/wp-admin',        risk: 'high',     note: 'WordPress admin panel exposed - target for brute-force and credential stuffing attacks',
                                                 confirm: /wp-login|wp-content|WordPress|wp-includes/i },
  { path: '/phpmyadmin',      risk: 'high',     note: 'phpMyAdmin exposes direct database access; remove or restrict to internal networks only',
                                                 confirm: /phpMyAdmin|pma_/i },
  { path: '/.env',            risk: 'critical', note: 'Environment file leaked - may contain database passwords, API keys, and secrets',
                                                 confirm: /^[A-Z_][A-Z0-9_]*\s*=/m },
  { path: '/config.json',     risk: 'critical', note: 'Configuration file exposed - may contain credentials, connection strings, or internal URLs',
                                                 confirm: /^\s*\{/m },
  { path: '/health',          risk: 'low',      note: 'Health check endpoint - may reveal internal service versions or dependency status',
                                                 confirm: /"status"|"healthy"|"ok"|UP/i },
  { path: '/status',          risk: 'low',      note: 'Status endpoint - verify it does not expose internal infrastructure details',
                                                 confirm: /"status"|"version"|"uptime"|OK/i },
  { path: '/metrics',         risk: 'medium',   note: 'Metrics endpoint (Prometheus/StatsD) - exposes performance data and internal service topology',
                                                 confirm: /^# HELP|^# TYPE|process_cpu|http_requests/m },
  { path: '/actuator',        risk: 'medium',   note: 'Spring Boot Actuator - can expose heap dumps, env vars, and bean definitions',
                                                 confirm: /"_links"|actuator/i },
  { path: '/actuator/health', risk: 'low',      note: 'Spring Boot health check - verify sensitive details are not included in the response',
                                                 confirm: /"status"|"components"/i },
  { path: '/actuator/env',    risk: 'critical', note: 'Spring Boot env actuator - exposes all environment variables including secrets',
                                                 confirm: /"activeProfiles"|"propertySources"/i },
  { path: '/.git/HEAD',       risk: 'critical', note: 'Git repository exposed - full source code may be downloadable via /.git/ path traversal',
                                                 confirm: /^ref: refs\/|^[0-9a-f]{40}/m },
  { path: '/server-status',   risk: 'medium',   note: 'Apache server-status page - reveals active connections, request URIs, and worker info',
                                                 confirm: /Apache.*Status|Server Version|requests\/sec/i },
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
  pathConfig: SensitivePath,
): Promise<SensitiveEndpoint | null> {
  const { path, risk, note, confirm } = pathConfig;
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

    // For 200 responses on paths with a confirm pattern, fetch the body and verify
    // the content actually matches the expected service - prevents false positives
    // from frameworks (Next.js, Nuxt, etc.) that return HTTP 200 for unknown paths.
    let responsePreview: string | undefined;
    if (status === 200) {
      responsePreview = await fetchPreview(`${baseUrl}${path}`);
      if (confirm && !confirm.test(responsePreview ?? '')) return null;
    }

    const effectiveRisk = computeEffectiveRisk(risk, status);
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
      batch.map((pathConfig) => probeOne(baseUrl, host, pathConfig)),
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
      probeOne(baseUrl, host, {
        path,
        risk: 'medium',
        note: 'Path hidden from crawlers via robots.txt Disallow but publicly accessible',
      }),
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
