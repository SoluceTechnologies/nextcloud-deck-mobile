import { EMPTY_MODEL, isEmptyModel, reduceSearch, toStored } from '../../../src/features/search/searchModel';
import type { Resolve, Resolved, SearchAction, SearchModel } from '../../../src/features/search/searchModel';

const KNOWN: Record<string, Resolved> = {
  'tag:design': { value: 'design', label: 'design', color: '#D4537E' },
  'list:en cours': { value: 'En cours', label: 'En cours' },
  'assigned:alice martin': { value: 'alice', label: 'Alice Martin' },
  'assigned:alice': { value: 'alice', label: 'Alice Martin' },
};
const resolve: Resolve = (key, raw) => KNOWN[`${key}:${raw.toLowerCase()}`] ?? null;

const run = (...actions: SearchAction[]) =>
  actions.reduce<SearchModel>((model, action) => reduceSearch(model, action, resolve), EMPTY_MODEL);
const type = (text: string): SearchAction => ({ type: 'input', text });
const backspace: SearchAction = { type: 'backspaceEmpty' };
const parts = (model: SearchModel) =>
  model.segments.map((s) => (s.kind === 'token' ? `${s.token.key}:${s.token.value}` : `"${s.text}"`));
const firstTokenId = (model: SearchModel) => (model.segments[0].kind === 'token' ? model.segments[0].token.id : '');

it('keeps plain words in the input', () => {
  expect(run(type('loyer'))).toEqual({ ...EMPTY_MODEL, input: 'loyer' });
});

it('turns a typed key into a pending filter and freezes the text before it', () => {
  const model = run(type('loyer tag:'));
  expect(parts(model)).toEqual(['"loyer"']);
  expect(model).toMatchObject({ pending: 'tag', input: '' });
});

it('commits a pending value followed by a space when it is known', () => {
  const model = run(type('tag:'), type('design '));
  expect(parts(model)).toEqual(['tag:design']);
  expect(model.segments[0]).toMatchObject({ token: { color: '#D4537E' } });
  expect(model).toMatchObject({ pending: null, input: '' });
});

it('keeps a space inside a value until the value is known', () => {
  const model = run(type('list:'), type('En '));
  expect(model).toMatchObject({ pending: 'list', input: 'En ' });
  expect(parts(reduceSearch(model, type('En cours '), resolve))).toEqual(['list:En cours']);
});

it('commits a free title value on space and keeps quoted spaces', () => {
  expect(parts(run(type('title:'), type('"two words" ')))).toEqual(['title:two words']);
  expect(run(type('title:'), type('"two '))).toMatchObject({ pending: 'title', input: '"two ' });
});

it('drops a leading space on an empty value', () => {
  expect(run(type('tag:'), type(' '))).toMatchObject({ pending: 'tag', input: '' });
});

it('commits the typed value on Return, resolving its label', () => {
  const model = run(type('assigned:'), type('alice'), { type: 'commitRaw' });
  expect(model.segments[0]).toMatchObject({ token: { key: 'assigned', value: 'alice', label: 'Alice Martin' } });
});

it('cancels an empty pending filter on Return', () => {
  expect(run(type('tag:'), { type: 'commitRaw' })).toEqual(EMPTY_MODEL);
});

it('removes the whole pending key on backspace', () => {
  const model = run(type('loyer tag:'), backspace);
  expect(parts(model)).toEqual(['"loyer"']);
  expect(model).toMatchObject({ pending: null, input: '' });
});

it('highlights then deletes the last token on backspace', () => {
  const highlighted = run(type('tag:design '), backspace);
  expect(highlighted.selectedId).toBe(firstTokenId(highlighted));
  expect(reduceSearch(highlighted, backspace, resolve).segments).toEqual([]);
});

it('reopens the last text on backspace, minus one character', () => {
  expect(run(type('loyer tag:'), backspace, backspace)).toEqual({ ...EMPTY_MODEL, input: 'loye' });
});

it('clears the highlight when typing', () => {
  expect(run(type('tag:design '), backspace, type('x'))).toMatchObject({ selectedId: null, input: 'x' });
});

it('selects, unselects and removes a token by id', () => {
  const model = run(type('tag:design '));
  const id = firstTokenId(model);
  const selected = reduceSearch(model, { type: 'select', id }, resolve);
  expect(selected.selectedId).toBe(id);
  expect(reduceSearch(selected, { type: 'select', id }, resolve).selectedId).toBeNull();
  expect(reduceSearch(selected, { type: 'remove', id }, resolve).segments).toEqual([]);
});

it('starts a filter from the menu, freezing the typed text', () => {
  const model = run(type('loyer'), { type: 'startFilter', key: 'board' });
  expect(parts(model)).toEqual(['"loyer"']);
  expect(model).toMatchObject({ pending: 'board', input: '' });
});

it('commits a picked suggestion', () => {
  const model = run({ type: 'startFilter', key: 'tag' }, { type: 'commit', resolved: { value: 'design', label: 'design' } });
  expect(parts(model)).toEqual(['tag:design']);
});

it('replaces the word being typed with a hint', () => {
  const model = run(type('loyer desi'), { type: 'replaceLastWord', key: 'tag', resolved: { value: 'design', label: 'design' } });
  expect(parts(model)).toEqual(['"loyer"', 'tag:design']);
  expect(model.input).toBe('');
});

it('parses pasted syntax into tokens and text', () => {
  const model = run(type('tag:design list:"En cours" loyer'));
  expect(parts(model)).toEqual(['tag:design', 'list:En cours']);
  expect(model.input).toBe('loyer');
});

it('does not add the same filter twice', () => {
  expect(parts(run(type('tag:design '), type('tag:DESIGN ')))).toEqual(['tag:design']);
});

it('clears everything and loads a stored search without its pending filter', () => {
  expect(run(type('tag:design '), { type: 'clear' })).toEqual(EMPTY_MODEL);
  const stored = run(type('loyer tag:'), type('des'));
  expect(run({ type: 'load', model: stored })).toMatchObject({ pending: null, input: '', selectedId: null });
});

it('knows when a model is empty', () => {
  expect(isEmptyModel(EMPTY_MODEL)).toBe(true);
  expect(isEmptyModel({ ...EMPTY_MODEL, input: '   ' })).toBe(true);
  expect(isEmptyModel(run({ type: 'startFilter', key: 'tag' }))).toBe(false);
  expect(toStored(run(type('loyer tag:'), type('des')))).toMatchObject({ pending: null, input: '' });
});
