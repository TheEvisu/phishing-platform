import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { Template, TemplateSchema } from '../schemas/template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Template.name, schema: TemplateSchema }]),
  ],
  providers: [TemplatesService],
  controllers: [TemplatesController],
})
export class TemplatesModule {}
