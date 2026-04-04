import { promises as dns } from 'dns';
import { DnsSecurity } from '../../schemas/osint-scan.schema';

async function resolveSafe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function scanDns(domain: string): Promise<DnsSecurity> {
  const [txtRecords, dmarcRecords, mxRecords, nsRecords] = await Promise.all([
    resolveSafe(() => dns.resolveTxt(domain)),
    resolveSafe(() => dns.resolveTxt(`_dmarc.${domain}`)),
    resolveSafe(() => dns.resolveMx(domain)),
    resolveSafe(() => dns.resolveNs(domain)),
  ]);

  const allTxt = (txtRecords ?? []).map((r) => r.join(''));
  const spfRecord = allTxt.find((r) => r.startsWith('v=spf1'));

  const dmarcAllTxt = (dmarcRecords ?? []).map((r) => r.join(''));
  const dmarcRecord = dmarcAllTxt.find((r) => r.startsWith('v=DMARC1'));

  let dmarcPolicy: string | undefined;
  if (dmarcRecord) {
    const match = dmarcRecord.match(/p=([^;]+)/);
    dmarcPolicy = match?.[1]?.trim();
  }

  const spfValid = spfRecord != null;

  const mxHosts = (mxRecords ?? [])
    .sort((a, b) => a.priority - b.priority)
    .map((r) => r.exchange);

  const nameservers = (nsRecords ?? []).sort();

  return {
    spf: spfRecord,
    spfValid,
    dmarc: dmarcRecord,
    dmarcPolicy,
    mxRecords: mxHosts,
    nameservers,
  };
}
