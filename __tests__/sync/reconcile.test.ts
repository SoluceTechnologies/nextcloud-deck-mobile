import { reconcile } from '../../src/sync/reconcile';
import { markLocalWrite, localWriteEpoch } from '../../src/sync/localWrites';

type Remote = { id: string; value: string };
type Row = { key: string; value: string };

const params = (over: Partial<Parameters<typeof reconcile<Remote, Row>>[0]> = {}) => ({
  remote: [] as Remote[],
  rows: [] as Row[],
  remoteKey: (r: Remote) => r.id,
  rowKey: (r: Row) => r.key,
  unchanged: (row: Row, remote: Remote) => row.value === remote.value,
  deleteMissing: false,
  ...over,
});

describe('reconcile', () => {
  it('creates entities that have no local row', () => {
    const result = reconcile(params({ remote: [{ id: 'a', value: '1' }] }));
    expect(result.create).toEqual([{ id: 'a', value: '1' }]);
    expect(result.update).toEqual([]);
    expect(result.remove).toEqual([]);
  });

  it('updates a row whose remote value changed', () => {
    const row = { key: 'a', value: 'old' };
    const result = reconcile(params({ remote: [{ id: 'a', value: 'new' }], rows: [row] }));
    expect(result.update).toEqual([{ row, remote: { id: 'a', value: 'new' } }]);
    expect(result.create).toEqual([]);
  });

  it('skips a row that already matches', () => {
    const row = { key: 'a', value: 'same' };
    const result = reconcile(params({ remote: [{ id: 'a', value: 'same' }], rows: [row] }));
    expect(result.update).toEqual([]);
  });

  it('never removes on a delta pass, even when a row is missing from the response', () => {
    const row = { key: 'ghost', value: 'x' };
    const result = reconcile(params({ remote: [], rows: [row], deleteMissing: false }));
    expect(result.remove).toEqual([]);
  });

  it('removes rows missing from a snapshot pass', () => {
    const row = { key: 'ghost', value: 'x' };
    const result = reconcile(params({ remote: [], rows: [row], deleteMissing: true }));
    expect(result.remove).toEqual([row]);
  });

  it('never removes a protected row, even on a snapshot pass', () => {
    const pending = { key: 'pending', value: 'x' };
    const result = reconcile(
      params({
        remote: [],
        rows: [pending],
        deleteMissing: true,
        protectedRowIds: new Set(['pending']),
      }),
    );
    expect(result.remove).toEqual([]);
  });

  // The mirror of the case above: a protected row can also be temporarily
  // absent from `rows` (a queued removal already deleted it locally, and the
  // server has not caught up). The remote key must not be read as "never
  // seen" and recreated — the same protection that blocks a remove must also
  // block a create.
  it('does not recreate a protected key whose row a queued removal already deleted', () => {
    const result = reconcile(
      params({
        remote: [{ id: 'k1', value: 'x' }],
        rows: [],
        deleteMissing: true,
        protectedRowIds: new Set(['k1']),
      }),
    );
    expect(result.create).toEqual([]);
  });

  it('keeps the first row and removes the duplicates of one key', () => {
    const first = { key: 'a', value: 'x' };
    const dup = { key: 'a', value: 'x' };
    const result = reconcile(
      params({ remote: [{ id: 'a', value: 'x' }], rows: [first, dup], deleteMissing: true }),
    );
    expect(result.remove).toEqual([dup]);
    expect(result.update).toEqual([]);
  });

  // The dedup loop runs before, and independently of, the deleteMissing loop
  // below it. A caller that protects a key relies on that protection holding
  // everywhere reconcile can produce a `remove`, not just in one of the two
  // loops that can.
  it('does not remove a duplicate row whose key is protected', () => {
    const first = { key: 'a', value: 'x' };
    const dup = { key: 'a', value: 'x' };
    const result = reconcile(
      params({
        remote: [{ id: 'a', value: 'x' }],
        rows: [first, dup],
        deleteMissing: true,
        protectedRowIds: new Set(['a']),
      }),
    );
    expect(result.remove).toEqual([]);
  });

  it('ignores a duplicated remote entity', () => {
    const result = reconcile(
      params({ remote: [{ id: 'a', value: '1' }, { id: 'a', value: '1' }] }),
    );
    expect(result.create).toHaveLength(1);
  });
});

describe('localWriteEpoch', () => {
  it('advances on every local write', () => {
    const before = localWriteEpoch();
    markLocalWrite();
    expect(localWriteEpoch()).toBe(before + 1);
  });
});
