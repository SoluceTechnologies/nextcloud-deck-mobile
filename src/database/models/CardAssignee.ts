// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class CardAssignee extends Model {
  static table = 'card_assignees';

  @field('account_id') accountId: string;
  @field('card_id') cardId: string;
  @field('participant') participant: string;
  @field('assignee_type') assigneeType: number;
  @field('display_name') displayName: string;
}
