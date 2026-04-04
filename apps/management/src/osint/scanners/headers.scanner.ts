import axios from 'axios';
import { SecurityHeadersResult, SecurityHeaderResult } from '../../schemas/osint-scan.schema';

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
      return { headers: {}, passingCount: 0, totalChecked: 0 };
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

  return { headers, passingCount, totalChecked: CHECKED_HEADERS.length };
}
