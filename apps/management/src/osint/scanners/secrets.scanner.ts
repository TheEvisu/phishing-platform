import axios from 'axios';

export interface SecretFinding {
  file: string;
  type: string;
  preview: string;
}

export interface SecretsResult {
  scannedFiles: number;
  jsFiles: string[];
  findings: SecretFinding[];
}

const SECRET_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: 'AWS Access Key',     regex: /AKIA[0-9A-Z]{16}/g },
  { type: 'Google API Key',     regex: /AIza[0-9A-Za-z_-]{35}/g },
  { type: 'Stripe Secret Key',  regex: /sk_(live|test)_[0-9a-zA-Z]{24,}/g },
  { type: 'GitHub Token',       regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
  { type: 'Slack Token',        regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { type: 'Private Key',        regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { type: 'JWT Token',          regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { type: 'Hardcoded Password', regex: /(?:password|passwd|pwd)\s*[:=]\s*["'`][^"'`\s]{8,}["'`]/gi },
  { type: 'API Key / Secret',   regex: /(?:api[_-]?key|apikey|api[_-]?secret|client[_-]?secret)\s*[:=]\s*["'`][A-Za-z0-9_\-]{16,}["'`]/gi },
  { type: 'Bearer Token',       regex: /Authorization["'`\s]*[:=]["'`\s]*["'`]Bearer\s+[A-Za-z0-9_\-.]{20,}["'`]/gi },
  { type: 'Internal URL',       regex: /https?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)[:/]/g },
];

const MAX_JS_FILES = 8;
const MAX_FILE_BYTES = 300_000;

function redact(match: string): string {
  if (match.length <= 8) return '****';
  return `${match.slice(0, 4)}****${match.slice(-4)}`;
}

function extractJsUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const re = /<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  const base = new URL(baseUrl);

  while ((m = re.exec(html)) !== null) {
    try {
      const url = new URL(m[1], baseUrl);
      if (url.hostname === base.hostname) urls.push(url.href);
    } catch {
      // skip malformed
    }
  }

  return [...new Set(urls)].slice(0, MAX_JS_FILES);
}

function scanContent(content: string, label: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();

  for (const { type, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const dedup = `${type}:${m[0].slice(0, 10)}`;
      if (!seen.has(dedup)) {
        seen.add(dedup);
        findings.push({ file: label, type, preview: redact(m[0]) });
      }
    }
  }

  return findings;
}

export async function scanSecrets(domain: string): Promise<SecretsResult> {
  const baseUrl = `https://${domain}`;
  const allFindings: SecretFinding[] = [];
  const jsFiles: string[] = [];

  let html = '';
  try {
    const res = await axios.get<string>(baseUrl, {
      timeout: 10_000,
      responseType: 'text',
      maxContentLength: 500_000,
      validateStatus: () => true,
    });
    html = String(res.data);
  } catch {
    return { scannedFiles: 0, jsFiles: [], findings: [] };
  }

  allFindings.push(...scanContent(html, `${domain} (inline)`));

  const urls = extractJsUrls(html, baseUrl);

  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await axios.get<string>(url, {
          timeout: 8_000,
          responseType: 'text',
          maxContentLength: MAX_FILE_BYTES,
          validateStatus: () => true,
        });
        if (res.status === 200) {
          jsFiles.push(url);
          allFindings.push(...scanContent(String(res.data), url));
        }
      } catch {
        // silently skip
      }
    }),
  );

  const seen = new Set<string>();
  const findings = allFindings.filter((f) => {
    const key = `${f.type}:${f.file}:${f.preview}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { scannedFiles: jsFiles.length, jsFiles, findings };
}
