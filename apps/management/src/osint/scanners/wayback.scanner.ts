import axios from 'axios';
import { WaybackResult } from '../../schemas/osint-scan.schema';

const EMPTY: WaybackResult = { totalSnapshots: 0, yearlyBreakdown: {} };

export async function scanWayback(domain: string): Promise<WaybackResult> {
  let res;
  try {
    res = await axios.get('https://web.archive.org/cdx/search/cdx', {
      params: {
        url: domain,
        output: 'json',
        fl: 'timestamp',
        collapse: 'timestamp:4',
        limit: 50,
      },
      timeout: 20_000,
    });
  } catch {
    // CDX API is unreliable - timeout or network error returns empty result, not an error
    return EMPTY;
  }

  const rows: string[][] = res.data;
  if (!Array.isArray(rows) || rows.length <= 1) return EMPTY;

  const timestamps = rows.slice(1).map((r) => r[0]);
  if (timestamps.length === 0) return EMPTY;

  const yearlyBreakdown: Record<string, number> = {};
  for (const ts of timestamps) {
    const year = ts.slice(0, 4);
    yearlyBreakdown[year] = (yearlyBreakdown[year] ?? 0) + 1;
  }

  const sorted = [...timestamps].sort();
  const toDate = (ts: string) =>
    `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;

  return {
    firstSeen: toDate(sorted[0]),
    lastSeen: toDate(sorted[sorted.length - 1]),
    totalSnapshots: timestamps.length,
    yearlyBreakdown,
  };
}
