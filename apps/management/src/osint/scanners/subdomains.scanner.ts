import axios from 'axios';
import { promises as dns } from 'dns';
import { SubdomainEntry } from '../../schemas/osint-scan.schema';

interface CrtEntry {
  name_value: string;
  not_before: string;
}

async function resolveARecord(subdomain: string): Promise<string | undefined> {
  try {
    const records = await dns.resolve4(subdomain);
    return records[0];
  } catch {
    return undefined;
  }
}

export async function scanSubdomains(domain: string): Promise<SubdomainEntry[]> {
  const res = await axios.get<CrtEntry[]>(
    `https://crt.sh/?q=%.${domain}&output=json`,
    { timeout: 30_000 },
  );

  const seen = new Set<string>();
  const raw: Array<{ subdomain: string; firstSeen: string }> = [];

  for (const entry of res.data) {
    for (const name of entry.name_value.split('\n')) {
      const sub = name.trim().toLowerCase().replace(/^\*\./, '');
      if (!sub || sub === domain || seen.has(sub)) continue;
      // skip wildcard-only entries
      if (sub.startsWith('*')) continue;
      seen.add(sub);
      raw.push({ subdomain: sub, firstSeen: entry.not_before });
    }
  }

  // Sort by firstSeen descending, take top 100 to avoid excessive DNS lookups
  raw.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
  const top = raw.slice(0, 100);

  const results: SubdomainEntry[] = await Promise.all(
    top.map(async ({ subdomain, firstSeen }) => {
      const ip = await resolveARecord(subdomain);
      return { subdomain, firstSeen, hasA: ip != null, ip };
    }),
  );

  return results;
}
