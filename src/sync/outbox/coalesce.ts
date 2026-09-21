import type { Intent } from './types';

export type CoalesceEntry = { id: string; intent: Intent };

export type CoalesceResult = {
  send: CoalesceEntry[];
  drop: string[];
};

function createKindOf(deleteKind: Intent['kind']): Intent['kind'] | null {
  switch (deleteKind) {
    case 'deleteCard':
      return 'createCard';
    case 'deleteStack':
      return 'createStack';
    case 'deleteBoard':
      return 'createBoard';
    case 'deleteComment':
      return 'createComment';
    default:
      return null;
  }
}

export function coalesceIntents(entries: CoalesceEntry[]): CoalesceResult {
  const deleteIndex = entries.findIndex((e) => createKindOf(e.intent.kind) !== null);

  if (deleteIndex !== -1) {
    const createKind = createKindOf(entries[deleteIndex].intent.kind);
    const before = entries.slice(0, deleteIndex);
    const wasCreatedHere = before.some((e) => e.intent.kind === createKind);
    if (wasCreatedHere) {
      return { send: [], drop: entries.map((e) => e.id) };
    }
    return {
      send: [entries[deleteIndex]],
      drop: [...before.map((e) => e.id), ...entries.slice(deleteIndex + 1).map((e) => e.id)],
    };
  }

  const drop = new Set<string>();

  const lastByKey = new Map<string, string>();
  const keyOf = (intent: Intent): string | null => {
    switch (intent.kind) {
      case 'setCardArchived':
        return 'archived';
      case 'moveCard':
        return 'move';
      case 'assignLabel':
      case 'removeLabel':
        return `label:${intent.labelId}`;
      case 'assignUser':
      case 'unassignUser':
        return `user:${intent.participant}|${intent.assigneeType}`;
      case 'addDependency':
      case 'removeDependency':
        return `dep:${intent.dependentCardRemoteId}`;
      case 'updateComment':
        return 'comment';
      default:
        return null;
    }
  };

  for (const entry of entries) {
    const key = keyOf(entry.intent);
    if (key === null) continue;
    const previous = lastByKey.get(key);
    if (previous !== undefined) drop.add(previous);
    lastByKey.set(key, entry.id);
  }

  const createComment = entries.find((e) => e.intent.kind === 'createComment');
  let foldedCreate: Intent | null = null;
  if (createComment) {
    const edits = entries.filter(
      (e) => e.intent.kind === 'updateComment' && !drop.has(e.id),
    );
    const newest = edits[edits.length - 1];
    if (newest) {
      for (const edit of edits) drop.add(edit.id);
      foldedCreate = {
        ...(createComment.intent as Extract<Intent, { kind: 'createComment' }>),
        message: (newest.intent as Extract<Intent, { kind: 'updateComment' }>).message,
      };
    }
  }

  const patches = entries.filter((e) => e.intent.kind === 'patchCard');
  let mergedPatch: Intent | null = null;
  if (patches.length > 1) {
    const fields: string[] = [];
    const base: Record<string, unknown> = {};
    for (const { intent } of patches) {
      if (intent.kind !== 'patchCard') continue;
      for (const field of intent.fields) if (!fields.includes(field)) fields.push(field);
      for (const [field, value] of Object.entries(intent.base)) {
        if (!(field in base)) base[field] = value;
      }
    }
    const last = patches[patches.length - 1];
    for (const patch of patches) if (patch.id !== last.id) drop.add(patch.id);
    mergedPatch = {
      kind: 'patchCard',
      cardId: (last.intent as Extract<Intent, { kind: 'patchCard' }>).cardId,
      fields: fields as Extract<Intent, { kind: 'patchCard' }>['fields'],
      base,
    };
  }

  const lastPatchId = patches.length > 1 ? patches[patches.length - 1].id : null;

  const send = entries
    .filter((e) => !drop.has(e.id))
    .map((e) => (e.id === lastPatchId && mergedPatch ? { id: e.id, intent: mergedPatch } : e))
    .map((e) =>
      foldedCreate && createComment && e.id === createComment.id
        ? { id: e.id, intent: foldedCreate }
        : e,
    );

  return { send, drop: entries.filter((e) => drop.has(e.id)).map((e) => e.id) };
}
