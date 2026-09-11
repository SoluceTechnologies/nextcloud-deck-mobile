import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Board from '@/database/models/Board';
import type Card from '@/database/models/Card';
import { BOARD_OBSERVED_COLUMNS, CARD_OBSERVED_COLUMNS } from '@/database/observedColumns';

export function useBoards(accountId: string | null): Board[] {
  const database = useDatabase();
  const [boards, setBoards] = useState<Board[]>([]);

  useEffect(() => {
    if (!accountId) {
      setBoards([]);
      return;
    }
    const subscription = database
      .get<Board>('boards')
      .query(Q.where('account_id', accountId), Q.where('archived', false))
      .observeWithColumns(BOARD_OBSERVED_COLUMNS)
      .subscribe((rows) =>
        setBoards([...rows].sort((a, b) => a.title.localeCompare(b.title))),
      );
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  return boards;
}

/** Every card of the account, across all boards — the Boards tab needs this to
 * summarize each board's done/total counts without an N+1 subscription per board. */
export function useAccountCards(accountId: string | null): Card[] {
  const database = useDatabase();
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    if (!accountId) {
      setCards([]);
      return;
    }
    const subscription = database
      .get<Card>('cards')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(CARD_OBSERVED_COLUMNS)
      .subscribe((rows) => setCards([...rows]));
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  return cards;
}

export function useBoardCards(accountId: string | null, boardLocalId: string | null): Card[] {
  const database = useDatabase();
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    if (!accountId || !boardLocalId) {
      setCards([]);
      return;
    }
    const subscription = database
      .get<Card>('cards')
      .query(
        Q.where('account_id', accountId),
        Q.where('board_id', boardLocalId),
        Q.where('archived', false),
      )
      .observeWithColumns(CARD_OBSERVED_COLUMNS)
      .subscribe((rows) => setCards([...rows].sort((a, b) => a.order - b.order)));
    return () => subscription.unsubscribe();
  }, [accountId, boardLocalId, database]);

  return cards;
}
