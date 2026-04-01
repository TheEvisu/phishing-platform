import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { promises as dns } from 'dns';
import { DomainScan, LookalikeDomain } from '../schemas/domain-scan.schema';

const HOMOGLYPHS: Record<string, string[]> = {
  a: ['4'],
  e: ['3'],
  i: ['1', 'l'],
  l: ['1', 'i'],
  o: ['0'],
  s: ['5'],
  t: ['7'],
};

const BIGRAM_SUBS: Record<string, string> = {
  rn: 'm',
  cl: 'd',
  vv: 'w',
};

const TLDS = ['com', 'net', 'org', 'co', 'io', 'biz', 'info', 'online', 'site', 'app'];

const PREFIXES = ['login', 'secure', 'mail', 'my', 'account', 'support', 'help', 'admin', 'auth'];

const SUFFIXES = ['login', 'secure', 'official', 'online', 'support', 'help', 'inc', 'corp', 'hq'];

function parseDomain(raw: string): { name: string; tld: string } {
  const parts = raw.toLowerCase().trim().replace(/^https?:\/\//, '').split('.');
  const tld = parts.slice(-1)[0];
  const name = parts.slice(0, -1).join('.');
  return { name, tld };
}

function generateLookalikes(targetDomain: string): Array<{ domain: string; technique: string }> {
  const { name, tld } = parseDomain(targetDomain);
  const results = new Map<string, string>();

  const add = (domain: string, technique: string) => {
    const d = domain.toLowerCase();
    if (d !== targetDomain && !results.has(d)) results.set(d, technique);
  };

  // TLD variations
  for (const t of TLDS) {
    if (t !== tld) add(`${name}.${t}`, 'tld-swap');
  }

  // Prefix / suffix
  for (const p of PREFIXES) {
    add(`${p}-${name}.${tld}`, 'prefix');
    add(`${p}${name}.${tld}`, 'prefix');
  }
  for (const s of SUFFIXES) {
    add(`${name}-${s}.${tld}`, 'suffix');
    add(`${name}${s}.${tld}`, 'suffix');
  }

  // Homoglyph substitution
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    const subs = HOMOGLYPHS[ch];
    if (subs) {
      for (const sub of subs) {
        add(`${name.slice(0, i)}${sub}${name.slice(i + 1)}.${tld}`, 'homoglyph');
      }
    }
  }

  // Bigram substitution (rn -> m, etc.)
  for (const [bigram, sub] of Object.entries(BIGRAM_SUBS)) {
    if (name.includes(bigram)) {
      add(`${name.replace(bigram, sub)}.${tld}`, 'homoglyph');
    }
    // Reverse: m -> rn
    if (name.includes(sub)) {
      add(`${name.replace(sub, bigram)}.${tld}`, 'homoglyph');
    }
  }

  // Transposition (swap adjacent chars)
  for (let i = 0; i < name.length - 1; i++) {
    const swapped = name.slice(0, i) + name[i + 1] + name[i] + name.slice(i + 2);
    if (swapped !== name) add(`${swapped}.${tld}`, 'transposition');
  }

  // Missing character
  for (let i = 0; i < name.length; i++) {
    if (name.length > 2) add(`${name.slice(0, i)}${name.slice(i + 1)}.${tld}`, 'omission');
  }

  // Double character
  for (let i = 0; i < name.length; i++) {
    add(`${name.slice(0, i)}${name[i]}${name[i]}${name.slice(i + 1)}.${tld}`, 'repetition');
  }

  // Hyphenated split
  for (let i = 1; i < name.length - 1; i++) {
    add(`${name.slice(0, i)}-${name.slice(i)}.${tld}`, 'hyphenation');
  }

  return Array.from(results.entries()).map(([domain, technique]) => ({ domain, technique }));
}

async function checkDomain(domain: string): Promise<{ hasA: boolean; hasMx: boolean }> {
  const timeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))]);

  const [hasA, hasMx] = await Promise.all([
    timeout(dns.resolve4(domain)).then(() => true).catch(() => false),
    timeout(dns.resolveMx(domain)).then((r) => r.length > 0).catch(() => false),
  ]);

  return { hasA, hasMx };
}

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    @InjectModel(DomainScan.name)
    private domainScanModel: Model<DomainScan>,
  ) {}

  async scan(targetDomain: string, organizationId: Types.ObjectId): Promise<DomainScan> {
    const lookalikes = generateLookalikes(targetDomain);
    this.logger.log(`Scanning ${lookalikes.length} lookalike domains for ${targetDomain}`);

    const BATCH = 20;
    const results: LookalikeDomain[] = [];

    for (let i = 0; i < lookalikes.length; i += BATCH) {
      const batch = lookalikes.slice(i, i + BATCH);
      const checked = await Promise.all(
        batch.map(async ({ domain, technique }) => {
          const { hasA, hasMx } = await checkDomain(domain);
          return { domain, technique, registered: hasA || hasMx, hasA, hasMx };
        }),
      );
      results.push(...checked);
    }

    const found = results.filter((r) => r.registered);

    const scan = await this.domainScanModel.create({
      organizationId,
      targetDomain,
      results,
      totalChecked: results.length,
      totalFound: found.length,
    });

    return scan;
  }

  async getLatest(organizationId: Types.ObjectId): Promise<DomainScan | null> {
    return this.domainScanModel
      .findOne({ organizationId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getHistory(organizationId: Types.ObjectId): Promise<DomainScan[]> {
    return this.domainScanModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('-results')
      .lean()
      .exec();
  }
}
