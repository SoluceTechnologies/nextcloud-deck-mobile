import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import Attachment from '@/database/models/Attachment';
import Board from '@/database/models/Board';
import Card from '@/database/models/Card';
import CardAssignee from '@/database/models/CardAssignee';
import CardLabel from '@/database/models/CardLabel';
import Comment from '@/database/models/Comment';
import Label from '@/database/models/Label';
import OutboxEntry from '@/database/models/OutboxEntry';
import RecentBoard from '@/database/models/RecentBoard';
import Stack from '@/database/models/Stack';

import { deckSchema } from './schema';
import { migrations } from './migrations';

const adapter = new SQLiteAdapter({
  schema: deckSchema,
  migrations,
});

export const database = new Database({
  adapter,
  modelClasses: [
    Board,
    Stack,
    Card,
    Label,
    CardLabel,
    CardAssignee,
    Comment,
    Attachment,
    OutboxEntry,
    RecentBoard,
  ],
});
