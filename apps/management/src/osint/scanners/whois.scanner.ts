import axios from 'axios';
import { WhoisResult } from '../../schemas/osint-scan.schema';

export async function scanWhois(domain: string): Promise<WhoisResult | null> {
  let res;
  try {
    res = await axios.get(`https://rdap.org/domain/${domain}`, { timeout: 8_000 });
  } catch {
    // rdap.org is best-effort: 4xx (unsupported TLD), timeouts, network errors → null
    return null;
  }
  const data = res.data;

  const registrar = data.entities
    ?.flatMap((e: any) => e.roles?.includes('registrar') ? [e.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3]] : [])
    .filter(Boolean)[0];

  const getDate = (type: string): string | undefined =>
    data.events?.find((e: any) => e.eventAction === type)?.eventDate;

  const nameservers: string[] = (data.nameservers ?? []).map((n: any) =>
    typeof n === 'string' ? n : n.ldhName,
  ).filter(Boolean);

  const status: string[] = Array.isArray(data.status)
    ? data.status.map((s: any) => (typeof s === 'string' ? s : s.toString()))
    : [];

  return {
    registrar,
    registeredAt: getDate('registration'),
    expiresAt: getDate('expiration'),
    updatedAt: getDate('last changed'),
    nameservers,
    status,
  };
}
