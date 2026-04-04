import axios from 'axios';
import { promises as dns } from 'dns';
import { CloudResult } from '../../schemas/osint-scan.schema';

const CLOUD_ORG_PATTERNS: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /amazon|aws/i,           provider: 'AWS' },
  { pattern: /cloudflare/i,           provider: 'Cloudflare' },
  { pattern: /google/i,               provider: 'Google Cloud' },
  { pattern: /microsoft|azure/i,      provider: 'Azure' },
  { pattern: /fastly/i,               provider: 'Fastly' },
  { pattern: /akamai/i,               provider: 'Akamai' },
  { pattern: /digitalocean/i,         provider: 'DigitalOcean' },
  { pattern: /linode|akamai/i,        provider: 'Linode' },
  { pattern: /hetzner/i,              provider: 'Hetzner' },
  { pattern: /ovh/i,                  provider: 'OVH' },
  { pattern: /vultr/i,                provider: 'Vultr' },
  { pattern: /vercel/i,               provider: 'Vercel' },
  { pattern: /netlify/i,              provider: 'Netlify' },
];

const CLOUD_CNAME_PATTERNS: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /\.cloudfront\.net$/i,     provider: 'AWS CloudFront' },
  { pattern: /\.amazonaws\.com$/i,      provider: 'AWS' },
  { pattern: /\.elb\.amazonaws\.com$/i, provider: 'AWS ELB' },
  { pattern: /\.cloudflare\.com$/i,     provider: 'Cloudflare' },
  { pattern: /\.azurewebsites\.net$/i,  provider: 'Azure' },
  { pattern: /\.azure\.com$/i,          provider: 'Azure' },
  { pattern: /\.googleapis\.com$/i,     provider: 'Google Cloud' },
  { pattern: /\.fastly\.net$/i,         provider: 'Fastly' },
  { pattern: /\.vercel\.app$/i,         provider: 'Vercel' },
  { pattern: /\.netlify\.app$/i,        provider: 'Netlify' },
];

async function resolveIp(domain: string): Promise<string | undefined> {
  try {
    const records = await dns.resolve4(domain);
    return records[0];
  } catch {
    return undefined;
  }
}

async function resolveCname(domain: string): Promise<string | undefined> {
  try {
    const records = await dns.resolveCname(domain);
    return records[0];
  } catch {
    return undefined;
  }
}

async function checkS3Bucket(domain: string): Promise<boolean> {
  // Check if domain itself is an exposed S3 bucket
  const bucketName = domain.replace(/\./g, '-');
  try {
    const res = await axios.head(`https://${bucketName}.s3.amazonaws.com`, {
      timeout: 4_000,
      validateStatus: () => true,
    });
    // 403 = bucket exists but access denied (still exposed), 200 = public bucket
    return res.status === 403 || res.status === 200;
  } catch {
    return false;
  }
}

export async function scanCloud(domain: string): Promise<CloudResult> {
  const [ip, cname] = await Promise.all([
    resolveIp(domain),
    resolveCname(domain),
  ]);

  // Detect provider from CNAME
  let cloudProvider: string | undefined;
  if (cname) {
    for (const { pattern, provider } of CLOUD_CNAME_PATTERNS) {
      if (pattern.test(cname)) { cloudProvider = provider; break; }
    }
  }

  let org: string | undefined;
  let asn: string | undefined;
  let country: string | undefined;

  if (ip) {
    try {
      const res = await axios.get(`https://ipinfo.io/${ip}/json`, {
        timeout: 6_000,
        headers: { Accept: 'application/json' },
      });
      const data = res.data;
      org     = data.org;
      asn     = data.org?.split(' ')[0];
      country = data.country;

      if (!cloudProvider && org) {
        for (const { pattern, provider } of CLOUD_ORG_PATTERNS) {
          if (pattern.test(org)) { cloudProvider = provider; break; }
        }
      }
    } catch {
      // ipinfo.io unavailable - skip
    }
  }

  const s3BucketExposed = await checkS3Bucket(domain);

  return { ip, asn, org, country, cloudProvider, cname, s3BucketExposed };
}
