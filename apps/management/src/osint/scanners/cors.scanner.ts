import axios from 'axios';

export interface CorsIssue {
  url: string;
  allowOrigin: string;
  allowCredentials: boolean;
  issue: 'wildcard' | 'reflects-origin' | 'null-origin';
  risk: 'critical' | 'high' | 'medium';
}

export interface CorsResult {
  vulnerable: boolean;
  issues: CorsIssue[];
  checkedUrls: string[];
}

// A clearly external origin that will never belong to the target domain
const TEST_ORIGIN = 'https://cors-probe.security-scan.invalid';

const PROBE_PATHS = ['/', '/api', '/api/v1'];

async function probeUrl(url: string): Promise<CorsIssue | null> {
  try {
    const res = await axios.get(url, {
      timeout: 6_000,
      validateStatus: () => true,
      maxRedirects: 2,
      headers: { Origin: TEST_ORIGIN },
    });

    const allowOrigin = String(res.headers['access-control-allow-origin'] ?? '').trim();
    if (!allowOrigin) return null;

    const allowCredentials =
      String(res.headers['access-control-allow-credentials'] ?? '').toLowerCase() === 'true';

    if (allowOrigin === '*') {
      return {
        url, allowOrigin, allowCredentials,
        issue: 'wildcard',
        // Wildcard + credentials is spec-invalid but servers may still respond dangerously
        risk: allowCredentials ? 'high' : 'medium',
      };
    }

    if (allowOrigin === TEST_ORIGIN) {
      return {
        url, allowOrigin, allowCredentials,
        issue: 'reflects-origin',
        // Reflecting arbitrary origin + credentials = fully authenticated cross-origin requests
        risk: allowCredentials ? 'critical' : 'high',
      };
    }

    if (allowOrigin === 'null') {
      return {
        url, allowOrigin, allowCredentials,
        issue: 'null-origin',
        risk: allowCredentials ? 'high' : 'medium',
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function scanCors(domain: string): Promise<CorsResult> {
  const baseUrl = `https://${domain}`;
  const urls = PROBE_PATHS.map((p) => `${baseUrl}${p}`);

  const results = await Promise.all(urls.map(probeUrl));
  const issues = results.filter((r): r is CorsIssue => r !== null);

  return {
    vulnerable: issues.length > 0,
    issues,
    checkedUrls: urls,
  };
}
