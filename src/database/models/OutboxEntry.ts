// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class OutboxEntry extends Model {
  static table = 'outbox';

  @field('account_id') accountId: string;
  @field('kind') kind: string;
  @field('entity_type') entityType: string;
  @field('entity_id') entityId: string;
  @field('payload_json') payloadJson: string;
  @field('server_values_json') serverValuesJson: string;
  @field('created_at') createdAt: number;
  @field('attempts') attempts: number;
  @field('next_attempt_at') nextAttemptAt: number;
  @field('last_error') lastError?: string;
  @field('state') state: string;
}
