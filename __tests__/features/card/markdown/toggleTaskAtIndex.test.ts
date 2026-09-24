import { toggleTaskAtIndex } from '../../../../src/features/card/markdown/toggleTaskAtIndex';

it('checks an unchecked box', () => {
  expect(toggleTaskAtIndex('- [ ] a', 0, true)).toBe('- [x] a');
});

it('unchecks a checked box', () => {
  expect(toggleTaskAtIndex('- [x] a', 0, false)).toBe('- [ ] a');
});

it('recognizes an uppercase X', () => {
  expect(toggleTaskAtIndex('- [X] a', 0, false)).toBe('- [ ] a');
});

it('handles every unordered marker', () => {
  expect(toggleTaskAtIndex('* [ ] a', 0, true)).toBe('* [x] a');
  expect(toggleTaskAtIndex('+ [ ] a', 0, true)).toBe('+ [x] a');
});

it('handles an ordered list', () => {
  expect(toggleTaskAtIndex('1. [ ] a', 0, true)).toBe('1. [x] a');
});

it('preserves indentation on a nested item', () => {
  const md = '- [ ] a\n  - [ ] b';
  expect(toggleTaskAtIndex(md, 1, true)).toBe('- [ ] a\n  - [x] b');
});

it('counts in document order across nesting levels', () => {
  const md = '- [ ] a\n  - [ ] b\n- [ ] c';
  expect(toggleTaskAtIndex(md, 2, true)).toBe('- [ ] a\n  - [ ] b\n- [x] c');
});

it('touches only the indexed item', () => {
  const md = '- [ ] a\n- [ ] b\n- [ ] c';
  expect(toggleTaskAtIndex(md, 1, true)).toBe('- [ ] a\n- [x] b\n- [ ] c');
});

it('preserves the rest of the line exactly', () => {
  const md = '- [ ] buy **milk** and `bread` [link](http://x)';
  expect(toggleTaskAtIndex(md, 0, true)).toBe('- [x] buy **milk** and `bread` [link](http://x)');
});

// A bracket pair mid-sentence is not a task marker.
it('ignores a bracket pair that is not at the start of a list item', () => {
  const md = 'a sentence with [ ] in it\n- [ ] real task';
  expect(toggleTaskAtIndex(md, 0, true)).toBe('a sentence with [ ] in it\n- [x] real task');
});

it('ignores a bracket pair in a plain paragraph line', () => {
  const md = '[ ] not a task\n- [ ] task';
  expect(toggleTaskAtIndex(md, 0, true)).toBe('[ ] not a task\n- [x] task');
});

// Out of range must be inert, never throw and never corrupt the document.
it('returns the document unchanged for an index past the last task', () => {
  const md = '- [ ] a';
  expect(toggleTaskAtIndex(md, 5, true)).toBe(md);
});

it('returns the document unchanged for a negative index', () => {
  const md = '- [ ] a';
  expect(toggleTaskAtIndex(md, -1, true)).toBe(md);
});

it('returns an empty document unchanged', () => {
  expect(toggleTaskAtIndex('', 0, true)).toBe('');
});

// Setting the state it already has must be a no-op, not a rewrite.
it('is idempotent when the target state already holds', () => {
  expect(toggleTaskAtIndex('- [x] a', 0, true)).toBe('- [x] a');
});

it('preserves CRLF line endings', () => {
  expect(toggleTaskAtIndex('- [ ] a\r\n- [ ] b', 1, true)).toBe('- [ ] a\r\n- [x] b');
});

it('does not treat a fenced code block line as a task', () => {
  const md = '```\n- [ ] not a task\n```\n- [ ] real';
  expect(toggleTaskAtIndex(md, 0, true)).toBe('```\n- [ ] not a task\n```\n- [x] real');
});
