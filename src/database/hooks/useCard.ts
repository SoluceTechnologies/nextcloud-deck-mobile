import { useEffect, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Card from '@/database/models/Card';

export function useCard(cardLocalId: string | null): Card | null {
  const database = useDatabase();
  const [state, setState] = useState<{ card: Card | null }>({ card: null });

  useEffect(() => {
    if (!cardLocalId) {
      setState({ card: null });
      return;
    }
    const subscription = database
      .get<Card>('cards')
      .findAndObserve(cardLocalId)
      .subscribe({
        next: (row) => setState({ card: row }),
        error: () => setState({ card: null }),
        complete: () => setState({ card: null }),
      });
    return () => subscription.unsubscribe();
  }, [cardLocalId, database]);

  return state.card;
}
