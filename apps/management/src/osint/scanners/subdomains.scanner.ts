import axios from 'axios';
import { promises as dns } from 'dns';
import { SubdomainEntry } from '../../schemas/osint-scan.schema';

interface CrtEntry {
  name_value: string;
  not_before: string;
}

// Common subdomain names to brute-force via DNS when not found in CT logs
const WORDLIST = [
  'www', 'www2', 'mail', 'smtp', 'pop', 'imap', 'webmail', 'email',
  'api', 'api2', 'api3', 'v1', 'v2', 'v3',
  'app', 'apps', 'web', 'portal', 'dashboard', 'console', 'panel', 'admin',
  'dev', 'dev2', 'staging', 'stage', 'test', 'beta', 'alpha', 'qa', 'uat', 'sandbox', 'demo',
  'cdn', 'static', 'assets', 'media', 'img', 'images', 'files', 'upload', 'download',
  'docs', 'help', 'support', 'wiki', 'kb', 'blog', 'news', 'status', 'monitor',
  'auth', 'login', 'sso', 'oauth', 'id', 'identity', 'account', 'accounts', 'profile',
  'shop', 'store', 'checkout', 'payment', 'pay', 'billing', 'wallet',
  'mobile', 'm', 'ios', 'android',
  'vpn', 'remote', 'gateway', 'proxy',
  'ftp', 'sftp', 'ssh',
  'old', 'legacy', 'backup', 'archive',
  'internal', 'intranet', 'corp', 'office',
  'search', 'analytics', 'tracking', 'metrics',
  'secure', 'security', 'vault',
];

async function resolveARecord(subdomain: string): Promise<string | undefined> {
  try {
    const records = await dns.resolve4(subdomain);
    return records[0];
  } catch {
    return undefined;
  }
}

async function bruteforceSubdomains(domain: string, known: Set<string>): Promise<SubdomainEntry[]> {
  const candidates = WORDLIST
    .map((word) => `${word}.${domain}`)
    .filter((sub) => !known.has(sub));

  const results = await Promise.all(
    candidates.map(async (subdomain) => {
      const ip = await resolveARecord(subdomain);
      if (!ip) return null;
      return { subdomain, hasA: true, ip } as SubdomainEntry;
    }),
  );

  return results.filter((r): r is SubdomainEntry => r !== null);
}

export async function scanSubdomains(domain: string): Promise<SubdomainEntry[]> {
  const seen = new Set<string>();
  const raw: Array<{ subdomain: string; firstSeen: string }> = [];

  // crt.sh is a public service that can be slow, return HTML errors, or rate-limit.
  // Treat failures as non-fatal - brute-force always runs regardless.
  try {
    const res = await axios.get<unknown>(
      `https://crt.sh/?q=%.${domain}&output=json`,
      { timeout: 15_000 },
    );

    if (Array.isArray(res.data)) {
      for (const entry of res.data as CrtEntry[]) {
        for (const name of entry.name_value.split('\n')) {
          const sub = name.trim().toLowerCase().replace(/^\*\./, '');
          if (!sub || sub === domain || seen.has(sub)) continue;
          if (sub.startsWith('*')) continue;
          seen.add(sub);
          raw.push({ subdomain: sub, firstSeen: entry.not_before });
        }
      }
    }
  } catch {
    // crt.sh unavailable - proceed with brute-force only
  }

  // Sort by firstSeen descending, take top 100 to avoid excessive DNS lookups
  raw.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
  const top = raw.slice(0, 100);

  const ctResults: SubdomainEntry[] = await Promise.all(
    top.map(async ({ subdomain, firstSeen }) => {
      const ip = await resolveARecord(subdomain);
      return { subdomain, firstSeen, hasA: ip != null, ip };
    }),
  );

  // Add brute-forced subdomains not already found via CT
  const bruteResults = await bruteforceSubdomains(domain, seen);

  // Merge: CT results first, then brute-forced extras
  const all = [...ctResults, ...bruteResults];

  // Stable sort: live first, then by subdomain name
  all.sort((a, b) => {
    if (a.hasA !== b.hasA) return a.hasA ? -1 : 1;
    return a.subdomain.localeCompare(b.subdomain);
  });

  return all;
}
