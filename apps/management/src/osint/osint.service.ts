import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OsintScan, OsintResults } from '../schemas/osint-scan.schema';
import { scanWhois } from './scanners/whois.scanner';
import { scanDns } from './scanners/dns.scanner';
import { scanSubdomains } from './scanners/subdomains.scanner';
import { scanSecurityHeaders } from './scanners/headers.scanner';
import { scanTechStack } from './scanners/tech.scanner';
import { scanWayback } from './scanners/wayback.scanner';
import { scanGithubExposure } from './scanners/github.scanner';
import { scanEndpoints } from './scanners/endpoints.scanner';
import { scanMobile } from './scanners/mobile.scanner';
import { scanCloud } from './scanners/cloud.scanner';
import { scanSsl } from './scanners/ssl.scanner';
import { scanSecrets } from './scanners/secrets.scanner';
import { scanEmailSecurity } from './scanners/email-security.scanner';
import { scanSubdomainTakeover } from './scanners/subdomain-takeover.scanner';
import { scanCors } from './scanners/cors.scanner';

@Injectable()
export class OsintService {
  private readonly logger = new Logger(OsintService.name);

  constructor(
    @InjectModel(OsintScan.name)
    private osintScanModel: Model<OsintScan>,
  ) {}

  async startScan(targetDomain: string, organizationId: Types.ObjectId): Promise<{ scanId: string }> {
    const doc = await this.osintScanModel.create({
      organizationId,
      targetDomain,
      status: 'pending',
      progress: 0,
      results: null,
    });

    const scanId = (doc._id as Types.ObjectId).toString();

    this.runScan(scanId, targetDomain).catch((err: Error) =>
      this.logger.error(`OSINT scan ${scanId} failed: ${err.message}`),
    );

    return { scanId };
  }

  private async setProgress(scanId: string, progress: number): Promise<void> {
    await this.osintScanModel.findByIdAndUpdate(scanId, { progress });
  }

  private async runScan(scanId: string, domain: string): Promise<void> {
    await this.osintScanModel.findByIdAndUpdate(scanId, { status: 'running' });

    const errors: Record<string, string> = {};
    const githubToken = process.env.GITHUB_TOKEN;

    const run = async <T>(
      name: string,
      fn: () => Promise<T>,
      fallback: T,
    ): Promise<T> => {
      try {
        return await fn();
      } catch (err: any) {
        errors[name] = err?.message ?? 'Unknown error';
        this.logger.warn(`OSINT [${scanId}] ${name} failed: ${errors[name]}`);
        return fallback;
      }
    };

    try {
      const ssl = await run('ssl', () => scanSsl(domain), null);
      await this.setProgress(scanId, 6);

      const whois = await run('whois', () => scanWhois(domain), null);
      await this.setProgress(scanId, 11);

      const dns = await run('dns', () => scanDns(domain), null);
      await this.setProgress(scanId, 18);

      const emailSecurity = await run('emailSecurity', () => scanEmailSecurity(domain), null);
      await this.setProgress(scanId, 24);

      const subdomains = await run('subdomains', () => scanSubdomains(domain), []);
      await this.setProgress(scanId, 36);

      const liveSubdomains = (subdomains ?? [])
        .filter((s) => s.hasA)
        .map((s) => s.subdomain);

      const takeoverRisks = await run(
        'subdomainTakeover',
        () => scanSubdomainTakeover(liveSubdomains),
        [],
      );
      await this.setProgress(scanId, 43);

      const securityHeaders = await run('securityHeaders', () => scanSecurityHeaders(domain), null);
      await this.setProgress(scanId, 49);

      const cors = await run('cors', () => scanCors(domain), null);
      await this.setProgress(scanId, 55);

      const techStack = await run('techStack', () => scanTechStack(domain), []);
      await this.setProgress(scanId, 58);

      const wayback = await run('wayback', () => scanWayback(domain), null);
      await this.setProgress(scanId, 65);

      const githubExposure = await run(
        'githubExposure',
        () => scanGithubExposure(domain, githubToken),
        [],
      );
      await this.setProgress(scanId, 72);

      const endpoints = await run('endpoints', () => scanEndpoints(domain, liveSubdomains), null);
      await this.setProgress(scanId, 81);

      const mobile = await run('mobile', () => scanMobile(domain), null);
      await this.setProgress(scanId, 87);

      const cloud = await run('cloud', () => scanCloud(domain), null);
      await this.setProgress(scanId, 93);

      const secrets = await run('secrets', () => scanSecrets(domain), null);
      await this.setProgress(scanId, 100);

      const results: OsintResults = {
        subdomains,
        dns,
        securityHeaders,
        techStack,
        githubExposure,
        wayback,
        whois,
        endpoints,
        mobile,
        cloud,
        ssl,
        secrets,
        emailSecurity,
        takeoverRisks,
        cors,
        errors,
      };

      await this.osintScanModel.findByIdAndUpdate(scanId, {
        status: 'completed',
        progress: 100,
        results,
      });

      this.logger.log(
        `OSINT scan ${scanId} completed for ${domain} ` +
        `(${subdomains.length} subdomains, ${githubExposure.length} github hits)`,
      );
    } catch (err: any) {
      await this.osintScanModel.findByIdAndUpdate(scanId, {
        status: 'failed',
        error: err?.message ?? 'Unexpected error',
      });
    }
  }

  async getScan(scanId: string, organizationId: Types.ObjectId): Promise<OsintScan> {
    const scan = await this.osintScanModel
      .findOne({ _id: scanId, organizationId })
      .lean()
      .exec();
    if (!scan) throw new NotFoundException('OSINT scan not found');
    return scan;
  }

  async getLatest(organizationId: Types.ObjectId): Promise<OsintScan | null> {
    return this.osintScanModel
      .findOne({ organizationId, status: 'completed' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getHistory(organizationId: Types.ObjectId): Promise<OsintScan[]> {
    return this.osintScanModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('-results')
      .lean()
      .exec();
  }
}
