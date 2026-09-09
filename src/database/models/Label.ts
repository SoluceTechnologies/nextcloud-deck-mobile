// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Label extends Model {
  static table = 'labels';

  @field('account_id') accountId: string;
  @field('board_id') boardId: string;
  @field('remote_id') remoteId: string;
  @field('title') title: string;
  @field('color') color?: string;
}
