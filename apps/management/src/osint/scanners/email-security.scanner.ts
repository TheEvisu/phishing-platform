import { promises as dns } from 'dns';
import axios from 'axios';

export interface DkimSelector {
  selector: string;
}

export interface EmailSecurityResult {
  dkim: DkimSelector[];
  dkimFound: boolean;
  mtaSts: boolean;
  mtaStsMode?: 'enforce' | 'testing' | 'none';
  dnssec: boolean;
  bimi: boolean;
  bimiUrl?: string;
}

const DKIM_SELECTORS = [
  'default', 'google', 'k1', 'mail', 'dkim',
  'selector1', 'selector2', 'smtp', 'email',
  'mandrill', 'sg', 's1', 's2', 'm1',
];

async function checkDkim(domain: string): Promise<DkimSelector[]> {
  const results = await Promise.allSettled(
    DKIM_SELECTORS.map(async (selector) => {
      try {
        const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
        const flat = records.flat().join('');
        if (flat.includes('v=DKIM1')) return { selector };
        return null;
      } catch {
        return null;
      }
    }),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<DkimSelector | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((r): r is DkimSelector => r !== null);
}

async function checkMtaSts(domain: string): Promise<{ enabled: boolean; mode?: 'enforce' | 'testing' | 'none' }> {
  try {
    await dns.resolveTxt(`_mta-sts.${domain}`);
    // DNS record found - fetch the policy file
    try {
      const res = await axios.get<string>(`https://mta-sts.${domain}/.well-known/mta-sts.txt`, {
        timeout: 5_000,
        responseType: 'text',
        validateStatus: (s) => s === 200,
      });
      const body = String(res.data);
      const modeMatch = body.match(/^mode:\s*(enforce|testing|none)/im);
      const mode = (modeMatch?.[1] ?? 'none') as 'enforce' | 'testing' | 'none';
      return { enabled: true, mode };
    } catch {
      return { enabled: true };
    }
  } catch {
    return { enabled: false };
  }
}

async function checkDnssec(domain: string): Promise<boolean> {
  try {
    const res = await axios.get<{ Answer?: Array<{ type: number }> }>(
      'https://dns.google/resolve',
      {
        params: { name: domain, type: 'DS' },
        timeout: 5_000,
      },
    );
    // DS record (type 43) present = DNSSEC properly delegated
    return Array.isArray(res.data?.Answer) && res.data.Answer.length > 0;
  } catch {
    return false;
  }
}

async function checkBimi(domain: string): Promise<{ found: boolean; url?: string }> {
  try {
    const records = await dns.resolveTxt(`default._bimi.${domain}`);
    const flat = records.flat().join('');
    if (flat.includes('v=BIMI1')) {
      const urlMatch = flat.match(/l=([^;]+)/i);
      return { found: true, url: urlMatch?.[1]?.trim() };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

export async function scanEmailSecurity(domain: string): Promise<EmailSecurityResult> {
  const [dkim, mtaSts, dnssec, bimi] = await Promise.all([
    checkDkim(domain),
    checkMtaSts(domain),
    checkDnssec(domain),
    checkBimi(domain),
  ]);

  return {
    dkim,
    dkimFound: dkim.length > 0,
    mtaSts: mtaSts.enabled,
    mtaStsMode: mtaSts.mode,
    dnssec,
    bimi: bimi.found,
    bimiUrl: bimi.url,
  };
}
