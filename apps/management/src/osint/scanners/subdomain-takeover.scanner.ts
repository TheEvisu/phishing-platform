import { promises as dns } from 'dns';
import axios from 'axios';

export interface TakeoverEntry {
  subdomain: string;
  cname?: string;
  service: string;
  evidence: string;
}

interface TakeoverSignature {
  service: string;
  cnamePattern?: RegExp;
  bodyPattern: RegExp;
}

const SIGNATURES: TakeoverSignature[] = [
  {
    service: 'GitHub Pages',
    cnamePattern: /github\.io$/i,
    bodyPattern: /There isn't a GitHub Pages site here/i,
  },
  {
    service: 'Heroku',
    cnamePattern: /herokuapp\.com$/i,
    bodyPattern: /No such app/i,
  },
  {
    service: 'AWS S3',
    cnamePattern: /s3\.amazonaws\.com|s3-website/i,
    bodyPattern: /NoSuchBucket|The specified bucket does not exist/i,
  },
  {
    service: 'AWS CloudFront',
    cnamePattern: /cloudfront\.net$/i,
    bodyPattern: /ERROR: The request could not be satisfied|Bad request.*CloudFront/i,
  },
  {
    service: 'Fastly',
    cnamePattern: /fastly\.net$/i,
    bodyPattern: /Fastly error: unknown domain/i,
  },
  {
    service: 'Shopify',
    bodyPattern: /Sorry, this shop is currently unavailable\./i,
  },
  {
    service: 'Tumblr',
    cnamePattern: /tumblr\.com$/i,
    bodyPattern: /There's nothing here\.|Not Found \| Tumblr/i,
  },
  {
    service: 'Ghost',
    cnamePattern: /ghost\.io$/i,
    bodyPattern: /The thing you were looking for is no longer here/i,
  },
  {
    service: 'Surge.sh',
    cnamePattern: /surge\.sh$/i,
    bodyPattern: /project not found/i,
  },
  {
    service: 'Netlify',
    cnamePattern: /netlify\.app$|netlify\.com$/i,
    bodyPattern: /Not Found - Request ID/i,
  },
  {
    service: 'Webflow',
    cnamePattern: /webflow\.io$/i,
    bodyPattern: /The page you are looking for doesn.*exist or has been moved/i,
  },
  {
    service: 'Pantheon',
    cnamePattern: /pantheonsite\.io$/i,
    bodyPattern: /404 error unknown site/i,
  },
  {
    service: 'WordPress.com',
    cnamePattern: /wordpress\.com$/i,
    bodyPattern: /Do you want to register.*wordpress\.com/i,
  },
  {
    service: 'Zendesk',
    cnamePattern: /zendesk\.com$/i,
    bodyPattern: /Help Center Closed/i,
  },
  {
    service: 'Unbounce',
    cnamePattern: /unbouncepages\.com$/i,
    bodyPattern: /The requested URL.*was not found on this server/i,
  },
  {
    service: 'Fly.io',
    cnamePattern: /fly\.dev$|fly\.io$/i,
    bodyPattern: /404 Not Found.*fly\.io/i,
  },
];

const MAX_SUBDOMAINS = 20;
const BATCH = 5;

async function getCname(subdomain: string): Promise<string | undefined> {
  try {
    const records = await dns.resolveCname(subdomain);
    return records[0];
  } catch {
    return undefined;
  }
}

async function fetchBody(url: string): Promise<string | undefined> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 6_000,
      responseType: 'text',
      validateStatus: () => true,
      maxContentLength: 50_000,
      maxRedirects: 3,
    });
    return String(res.data).slice(0, 10_000);
  } catch {
    return undefined;
  }
}

async function probeSubdomain(subdomain: string): Promise<TakeoverEntry | null> {
  const cname = await getCname(subdomain);

  // When CNAME exists, check only signatures that match it (or have no cname filter)
  // When no CNAME, skip cname-gated signatures to reduce false positives
  const candidates = SIGNATURES.filter((s) =>
    cname ? (!s.cnamePattern || s.cnamePattern.test(cname)) : !s.cnamePattern,
  );

  if (candidates.length === 0) return null;

  const body = await fetchBody(`https://${subdomain}`);
  if (!body) return null;

  for (const sig of candidates) {
    if (sig.bodyPattern.test(body)) {
      return {
        subdomain,
        cname,
        service: sig.service,
        evidence: body.slice(0, 200).replace(/\s+/g, ' ').trim(),
      };
    }
  }

  return null;
}

export async function scanSubdomainTakeover(subdomains: string[]): Promise<TakeoverEntry[]> {
  const targets = subdomains.slice(0, MAX_SUBDOMAINS);
  const found: TakeoverEntry[] = [];

  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(probeSubdomain));
    found.push(...results.filter((r): r is TakeoverEntry => r !== null));
  }

  return found;
}
