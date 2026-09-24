// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Comment extends Model {
  static table = 'comments';

  @field('account_id') accountId: string;
  @field('card_id') cardId: string;
  @field('remote_id') remoteId: string;
  @field('message') message: string;
  @field('actor_id') actorId: string;
  @field('actor_display_name') actorDisplayName: string;
  @field('created_at') createdAt: number;
  @field('parent_id') parentId?: string;
}
