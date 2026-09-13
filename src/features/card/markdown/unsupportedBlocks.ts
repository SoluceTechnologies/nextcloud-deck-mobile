// A fence line's *trimmed* start is 3+ backticks or tildes — same idiom as
// toggleTaskAtIndex.ts. This is why `~~struck~~` (inline, mid-line) never
// matches: a fence's tildes must be at line start and run three or more.
const FENCE_LINE = /^\s*(?:`{3,}|~{3,})/;

// Anchored at line start: a list marker, required whitespace, then the
// checkbox — the same TASK_LINE idiom as toggleTaskAtIndex.ts.
const TASK_LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]/;

const BLOCK_QUOTE_LINE = /^\s*>/;

// A GFM delimiter row: cells of only optional colons and dashes, separated
// and optionally bounded by pipes. Matched only against the line right
// after a header row (a line containing `|`), which is what keeps a stray
// "a | b" sentence from being read as a table.
const TABLE_DELIMITER_LINE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

export type UnsupportedBlock = 'codeFence' | 'table' | 'blockQuote' | 'taskList';

/**
 * Lists, in first-seen order, the kinds of markdown block in `markdown` that
 * the rich editor cannot round-trip (spec §8 measure 2). Fenced code blocks
 * are walked with fence state, as in toggleTaskAtIndex.ts, so nothing inside
 * a fence — including a `>` or a task marker — is inspected separately.
 */
export function unsupportedBlocksIn(markdown: string): UnsupportedBlock[] {
  const found = new Set<UnsupportedBlock>();
  let inFence = false;
  let previousLine: string | null = null;

  for (const line of markdown.split(/\r\n|\n/)) {
    if (FENCE_LINE.test(line)) {
      found.add('codeFence');
      inFence = !inFence;
      previousLine = line;
      continue;
    }
    if (inFence) continue;

    if (BLOCK_QUOTE_LINE.test(line)) {
      found.add('blockQuote');
    }

    // Conservative branch: docs/v0/markdown-spike.md has no verdict yet, so
    // task lists are treated as unsafe until the spike proves otherwise.
    if (TASK_LIST_LINE.test(line)) {
      found.add('taskList');
    }

    if (previousLine !== null && previousLine.includes('|') && TABLE_DELIMITER_LINE.test(line)) {
      found.add('table');
    }

    previousLine = line;
  }

  return Array.from(found);
}

/** `true` unless `markdown` holds a block {@link unsupportedBlocksIn} would flag. */
export function canUseRichEditor(markdown: string): boolean {
  return unsupportedBlocksIn(markdown).length === 0;
}
