import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OsintController } from './osint.controller';
import { OsintService } from './osint.service';
import { OsintScan, OsintScanSchema } from '../schemas/osint-scan.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: OsintScan.name, schema: OsintScanSchema }])],
  controllers: [OsintController],
  providers: [OsintService],
})
export class OsintModule {}
