import axios from 'axios';
import { SecurityHeadersResult, SecurityHeaderResult } from '../../schemas/osint-scan.schema';

function analyzeCsp(value: string): string[] {
  const issues: string[] = [];

  // Parse directives into a map
  const directives: Record<string, string> = {};
  for (const part of value.split(';')) {
    const trimmed = part.trim();
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) continue;
    const name = trimmed.slice(0, spaceIdx).toLowerCase();
    directives[name] = trimmed.slice(spaceIdx + 1);
  }

  // script-src takes precedence over default-src for scripts
  const scriptPolicy = directives['script-src'] ?? directives['default-src'] ?? '';

  if (scriptPolicy.includes("'unsafe-inline'")) issues.push('unsafe-inline');
  if (scriptPolicy.includes("'unsafe-eval'"))   issues.push('unsafe-eval');
  if (/(?<![a-z0-9])\*(?![a-z0-9.])/.test(scriptPolicy)) issues.push('wildcard');
  if (/\bhttp:/.test(scriptPolicy))             issues.push('http-scheme');

  return issues;
}

const CHECKED_HEADERS: Array<{ name: string; evaluate: (value: string | undefined) => { pass: boolean; note?: string } }> = [
  {
    name: 'strict-transport-security',
    evaluate: (v) => ({
      pass: v != null && v.toLowerCase().includes('max-age='),
      note: v == null ? 'Missing - HTTPS not enforced' : undefined,
    }),
  },
  {
    name: 'content-security-policy',
    evaluate: (v) => ({
      pass: v != null,
      note: v == null ? 'Missing - XSS mitigation not configured' : undefined,
    }),
  },
  {
    name: 'x-frame-options',
    evaluate: (v) => ({
      pass: v != null && ['deny', 'sameorigin'].includes(v.toLowerCase()),
      note: v == null ? 'Missing - clickjacking possible' : undefined,
    }),
  },
  {
    name: 'x-content-type-options',
    evaluate: (v) => ({
      pass: v?.toLowerCase() === 'nosniff',
      note: v == null ? 'Missing - MIME sniffing not blocked' : undefined,
    }),
  },
  {
    name: 'referrer-policy',
    evaluate: (v) => ({
      pass: v != null,
      note: v == null ? 'Missing - referrer leakage possible' : undefined,
    }),
  },
  {
    name: 'permissions-policy',
    evaluate: (v) => ({
      pass: v != null,
      note: v == null ? 'Missing - browser features not restricted' : undefined,
    }),
  },
  {
    name: 'cross-origin-opener-policy',
    evaluate: (v) => ({
      pass: v != null,
      note: v == null ? 'Missing - cross-origin isolation not set' : undefined,
    }),
  },
  {
    name: 'cross-origin-resource-policy',
    evaluate: (v) => ({
      pass: v != null,
      note: v == null ? 'Missing - cross-origin resource policy not set' : undefined,
    }),
  },
];

export async function scanSecurityHeaders(domain: string): Promise<SecurityHeadersResult> {
  let responseHeaders: Record<string, string> = {};

  try {
    const res = await axios.get(`https://${domain}`, {
      timeout: 10_000,
      maxRedirects: 3,
      validateStatus: () => true,
    });
    responseHeaders = Object.fromEntries(
      Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), String(v)]),
    );
  } catch {
    // Fall back to http if https fails
    try {
      const res = await axios.get(`http://${domain}`, {
        timeout: 8_000,
        maxRedirects: 3,
        validateStatus: () => true,
      });
      responseHeaders = Object.fromEntries(
        Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), String(v)]),
      );
    } catch {
      // Return empty result if site unreachable
      return { headers: {}, passingCount: 0, totalChecked: 0, cspIssues: [] };
    }
  }

  const headers: Record<string, SecurityHeaderResult> = {};
  let passingCount = 0;

  for (const { name, evaluate } of CHECKED_HEADERS) {
    const value = responseHeaders[name];
    const { pass, note } = evaluate(value);
    headers[name] = { present: value != null, value, pass, note };
    if (pass) passingCount++;
  }

  const cspValue = headers['content-security-policy']?.value;
  const cspIssues = cspValue ? analyzeCsp(cspValue) : [];

  return { headers, passingCount, totalChecked: CHECKED_HEADERS.length, cspIssues };
}
