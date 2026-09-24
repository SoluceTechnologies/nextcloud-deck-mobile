// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Stack extends Model {
  static table = 'stacks';

  @field('account_id') accountId: string;
  @field('board_id') boardId: string;
  @field('remote_id') remoteId: string;
  @field('title') title: string;
  @field('order') order: number;
  @field('last_modified') lastModified: number;
}
