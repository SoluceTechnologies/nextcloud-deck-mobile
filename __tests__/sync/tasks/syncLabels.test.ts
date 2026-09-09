import { buildLabelOps, labelUnchanged } from '../../../src/sync/tasks/syncLabels';

function makeDb() {
  const collection = {
    prepareCreate: jest.fn((writer: (r: any) => void) => {
      const r: any = { _op: 'create' };
      writer(r);
      return r;
    }),
  };
  return { get: jest.fn(() => collection) } as any;
}

function row(over: Record<string, unknown> = {}) {
  return {
    remoteId: '3',
    boardId: 'b-local',
    title: 'Urgent',
    color: '#ff0000',
    prepareUpdate: jest.fn((writer: (r: any) => void) => {
      const r: any = { _op: 'update' };
      writer(r);
      return r;
    }),
    prepareMarkAsDeleted: jest.fn(() => ({ _op: 'delete' })),
    ...over,
  } as any;
}

const label = { remoteId: '3', title: 'Urgent', color: '#ff0000' };

describe('labelUnchanged', () => {
  it('is true when title and colour match', () => {
    expect(labelUnchanged(row(), label)).toBe(true);
  });

  it('is false when the colour changed', () => {
    expect(labelUnchanged(row(), { ...label, color: '#00ff00' })).toBe(false);
  });
});

describe('buildLabelOps', () => {
  const base = { db: makeDb(), accountId: 'acc-1', boardLocalId: 'b-local' };

  it('creates a label the board gained', () => {
    const ops = buildLabelOps({ ...base, remote: [label], rows: [] });
    expect(ops).toEqual([
      expect.objectContaining({
        _op: 'create',
        accountId: 'acc-1',
        boardId: 'b-local',
        remoteId: '3',
        title: 'Urgent',
        color: '#ff0000',
      }),
    ]);
  });

  it('updates a renamed label', () => {
    const ops = buildLabelOps({ ...base, remote: [{ ...label, title: 'Blocking' }], rows: [row()] });
    expect(ops[0]).toMatchObject({ _op: 'update', title: 'Blocking' });
  });

  it('removes a label the board no longer has', () => {
    const ops = buildLabelOps({ ...base, remote: [], rows: [row()] });
    expect(ops).toEqual([{ _op: 'delete' }]);
  });

  it('emits nothing when the label set is identical', () => {
    expect(buildLabelOps({ ...base, remote: [label], rows: [row()] })).toEqual([]);
  });

  it('stores a colourless label as undefined rather than null', () => {
    const ops = buildLabelOps({ ...base, remote: [{ ...label, color: null }], rows: [] });
    expect(ops[0]).toMatchObject({ color: undefined });
  });
});
