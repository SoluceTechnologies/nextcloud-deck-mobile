// A fence line's *trimmed* start is 3+ backticks or tildes; content between
// an opening and closing fence is never a list item.
const FENCE_LINE = /^\s*(?:`{3,}|~{3,})/;

// Anchored at line start: a list marker, required whitespace, then the
// checkbox. This is why "a sentence with [ ] in it" and "[ ] not a task"
// never match — there is no list marker before the bracket pair.
const TASK_LINE = /^(\s*)([-*+]|\d+[.)])(\s+)\[( |x|X)\]/;

/**
 * Flips the checkbox of the `index`-th GFM task item in `markdown`, counting
 * matches in document order across nesting levels (spec §8, §12). Fenced
 * code blocks are skipped. Only the checkbox character changes — the rest
 * of the line, including indentation and the list marker, is untouched.
 *
 * An out-of-range or negative `index` returns `markdown` unchanged.
 */
export function toggleTaskAtIndex(markdown: string, index: number, checked: boolean): string {
  const newMarker = checked ? 'x' : ' ';
  let taskCount = 0;
  let inFence = false;

  const lines = splitKeepingLineEndings(markdown).map((line) => {
    if (FENCE_LINE.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    const match = line.match(TASK_LINE);
    if (!match) return line;

    const isTarget = taskCount === index;
    taskCount += 1;
    if (!isTarget) return line;

    const [prefix, indent, marker, spacing] = match;
    const remainder = line.slice(prefix.length);
    return `${indent}${marker}${spacing}[${newMarker}]${remainder}`;
  });

  return lines.join('');
}

/** Splits on line endings while keeping each line's own `\n` or `\r\n`. */
function splitKeepingLineEndings(text: string): string[] {
  const parts = text.split(/(\r\n|\n)/);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push(parts[i] + (parts[i + 1] ?? ''));
  }
  return lines;
}
