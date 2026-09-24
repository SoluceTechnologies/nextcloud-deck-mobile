import { deckRequest, type DeckAccount } from './client';
import { normalizeCard } from './normalize';
import type { DeckCard, DeckUpcoming } from './types';

const GROUPS: (keyof DeckUpcoming)[] = [
  'overdue',
  'today',
  'tomorrow',
  'nextSevenDays',
  'later',
  'nodue',
];

function emptyUpcoming(): DeckUpcoming {
  return { overdue: [], today: [], tomorrow: [], nextSevenDays: [], later: [], nodue: [] };
}

export async function fetchUpcoming(account: DeckAccount): Promise<DeckUpcoming> {
  const result = await deckRequest<Record<string, any[]>>(account, {
    path: '/overview/upcoming',
    api: 'ocs',
    context: 'fetchUpcoming',
  });

  const raw = result.data ?? {};
  const upcoming = emptyUpcoming();

  for (const group of GROUPS) {
    const entries = Array.isArray(raw[group]) ? raw[group] : [];
    upcoming[group] = entries
      .filter((c) => c?.boardId != null)
      .map((c) => normalizeCard(c, String(c.boardId)));
  }

  return upcoming;
}

export function flattenUpcoming(upcoming: DeckUpcoming): DeckCard[] {
  const seen = new Set<string>();
  const flat: DeckCard[] = [];
  for (const group of GROUPS) {
    const cards = upcoming[group];
    if (!Array.isArray(cards)) continue;
    for (const card of cards) {
      if (seen.has(card.remoteId)) continue;
      seen.add(card.remoteId);
      flat.push(card);
    }
  }
  return flat;
}
