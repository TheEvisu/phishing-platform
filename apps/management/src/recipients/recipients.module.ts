import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecipientsController } from './recipients.controller';
import { RecipientsService } from './recipients.service';
import { Recipient, RecipientSchema } from '../schemas/recipient.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Recipient.name, schema: RecipientSchema }]),
  ],
  controllers: [RecipientsController],
  providers: [RecipientsService],
  exports: [RecipientsService],
})
export class RecipientsModule {}
