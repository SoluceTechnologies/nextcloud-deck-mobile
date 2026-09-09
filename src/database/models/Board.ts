// @ts-nocheck
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Board extends Model {
  static table = 'boards';

  @field('account_id') accountId: string;
  @field('remote_id') remoteId: string;
  @field('title') title: string;
  @field('color') color?: string;
  @field('archived') archived: boolean;
  @field('owner') owner: string;
  @field('shared') shared: boolean;
  @field('can_edit') canEdit: boolean;
  @field('can_manage') canManage: boolean;
  @field('can_share') canShare: boolean;
  @field('last_modified') lastModified: number;
  @field('etag') etag?: string;
  @field('acl_json') aclJson: string;
  @field('users_json') usersJson: string;
}
