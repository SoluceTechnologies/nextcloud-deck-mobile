const FENCE_LINE = /^\s*(?:`{3,}|~{3,})/;
const TASK_LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]/;
const BLOCK_QUOTE_LINE = /^\s*>/;
const TABLE_DELIMITER_LINE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

export type UnsupportedBlock = 'codeFence' | 'table' | 'blockQuote' | 'taskList';

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

export function canUseRichEditor(markdown: string): boolean {
  return unsupportedBlocksIn(markdown).length === 0;
}
