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
        // The row disappears when a snapshot pass reconciles a server-side delete.
        error: () => setCard(null),
      });
    return () => subscription.unsubscribe();
  }, [cardLocalId, database]);

  return card;
}
