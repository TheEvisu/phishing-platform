import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { DomainScan, DomainScanSchema } from '../schemas/domain-scan.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: DomainScan.name, schema: DomainScanSchema }])],
  controllers: [DomainsController],
  providers: [DomainsService],
})
export class DomainsModule {}
