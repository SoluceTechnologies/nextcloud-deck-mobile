// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Card extends Model {
  static table = 'cards';

  @field('account_id') accountId: string;
  @field('board_id') boardId: string;
  @field('stack_id') stackId: string;
  @field('remote_id') remoteId: string;
  @field('title') title: string;
  @field('description') description: string;
  @field('type') type: string;
  @field('order') order: number;
  @field('owner') owner: string;
  @field('color') color?: string;
  @field('archived') archived: boolean;
  @field('done_at') doneAt?: number;
  @field('duedate') duedate?: number;
  @field('startdate') startdate?: number;
  @field('created_at') createdAt: number;
  @field('last_modified') lastModified: number;
  @field('attachment_count') attachmentCount: number;
  @field('comments_count') commentsCount: number;
  @field('dependent_cards_json') dependentCardsJson: string;
  @field('pending') pending: boolean;
}
