import { useEffect, useState } from 'react';

import { useDatabase } from '@/database/DatabaseProvider';
import type Card from '@/database/models/Card';

export function useCard(cardLocalId: string | null): Card | null {
  const database = useDatabase();
  // Wrapped: `findAndObserve` emits the SAME model instance after an in-place
  // update, and a setState with an identical reference is a React bail-out —
  // the screen would keep showing the stale field. A fresh wrapper per
  // emission forces the re-render.
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
        // No row matches this id on the initial fetch (e.g. a bad id, or already gone).
        error: () => setState({ card: null }),
        // The row was found, then deleted — e.g. a snapshot pass reconciles a server-side delete.
        complete: () => setState({ card: null }),
      });
    return () => subscription.unsubscribe();
  }, [cardLocalId, database]);

  return state.card;
}
