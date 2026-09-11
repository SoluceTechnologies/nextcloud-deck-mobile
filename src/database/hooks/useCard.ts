import { useEffect, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Card from '@/database/models/Card';

export function useCard(cardLocalId: string | null): Card | null {
  const database = useDatabase();
  const [card, setCard] = useState<Card | null>(null);

  useEffect(() => {
    if (!cardLocalId) {
      setCard(null);
      return;
    }
    const subscription = database
      .get<Card>('cards')
      .findAndObserve(cardLocalId)
      .subscribe({
        next: setCard,
        // No row matches this id on the initial fetch (e.g. a bad id, or already gone).
        error: () => setCard(null),
        // The row was found, then deleted — e.g. a snapshot pass reconciles a server-side delete.
        complete: () => setCard(null),
      });
    return () => subscription.unsubscribe();
  }, [cardLocalId, database]);

  return card;
}
