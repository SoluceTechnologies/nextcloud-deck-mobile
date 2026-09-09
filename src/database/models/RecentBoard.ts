// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class RecentBoard extends Model {
  static table = 'recent_boards';

  @field('account_id') accountId: string;
  @field('board_id') boardId: string;
  @field('opened_at') openedAt: number;
}
