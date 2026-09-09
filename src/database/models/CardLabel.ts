// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class CardLabel extends Model {
  static table = 'card_labels';

  @field('account_id') accountId: string;
  @field('card_id') cardId: string;
  @field('label_id') labelId: string;
}
