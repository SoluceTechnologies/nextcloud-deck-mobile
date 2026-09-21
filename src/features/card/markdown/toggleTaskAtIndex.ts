const FENCE_LINE = /^\s*(?:`{3,}|~{3,})/;
const TASK_LINE = /^(\s*)([-*+]|\d+[.)])(\s+)\[( |x|X)\]/;

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

function splitKeepingLineEndings(text: string): string[] {
  const parts = text.split(/(\r\n|\n)/);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push(parts[i] + (parts[i + 1] ?? ''));
  }
  return lines;
}
