import {
  unsupportedBlocksIn,
  canUseRichEditor,
} from '../../../../src/features/card/markdown/unsupportedBlocks';

it('finds nothing in plain prose', () => {
  expect(unsupportedBlocksIn('Just **text** and a [link](http://x).')).toEqual([]);
});

it('detects a fenced code block', () => {
  expect(unsupportedBlocksIn('```js\nconst x = 1;\n```')).toContain('codeFence');
});

it('detects a tilde-fenced block', () => {
  expect(unsupportedBlocksIn('~~~\ncode\n~~~')).toContain('codeFence');
});

it('detects a table by its delimiter row', () => {
  expect(unsupportedBlocksIn('| a | b |\n| - | - |\n| 1 | 2 |')).toContain('table');
});

it('detects a block quote', () => {
  expect(unsupportedBlocksIn('> quoted')).toContain('blockQuote');
});

// ~~strikethrough~~ is supported and must not be read as a tilde fence.
it('does not read inline strikethrough as a code fence', () => {
  expect(unsupportedBlocksIn('some ~~struck~~ text')).toEqual([]);
});

// A pipe in a sentence is not a table.
it('does not read a stray pipe as a table', () => {
  expect(unsupportedBlocksIn('use a | b to pipe')).toEqual([]);
});

// A quote inside a fence is already covered by the fence.
it('reports each kind once', () => {
  const md = '```\ncode\n```\n\n```\nmore\n```';
  expect(unsupportedBlocksIn(md)).toEqual(['codeFence']);
});

it('refuses the rich editor when anything unsupported is present', () => {
  expect(canUseRichEditor('```\ncode\n```')).toBe(false);
});

it('allows the rich editor for supported content', () => {
  expect(canUseRichEditor('# Title\n\n- a\n- b\n\n**bold**')).toBe(true);
});

it('allows the rich editor for an empty description', () => {
  expect(canUseRichEditor('')).toBe(true);
});

// Conservative branch: docs/v0/markdown-spike.md has no verdict yet, so task
// lists are treated as unsafe until the spike proves otherwise (spec §8).
it('detects a task list item', () => {
  expect(unsupportedBlocksIn('- [ ] a')).toContain('taskList');
});

it('refuses the rich editor for a description containing a task list', () => {
  expect(canUseRichEditor('- [x] done')).toBe(false);
});
