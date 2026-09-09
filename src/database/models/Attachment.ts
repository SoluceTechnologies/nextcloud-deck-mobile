// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Attachment extends Model {
  static table = 'attachments';

  @field('account_id') accountId: string;
  @field('card_id') cardId: string;
  @field('remote_id') remoteId: string;
  @field('attachment_type') attachmentType: string;
  @field('file_name') fileName: string;
  @field('mime') mime: string;
  @field('size') size: number;
  @field('created_at') createdAt: number;
  @field('created_by') createdBy: string;
}
