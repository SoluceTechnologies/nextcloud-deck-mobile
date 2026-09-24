import {
  bumpWriteEpoch,
  localWriteEpoch,
  markLocalWrite,
  onLocalWrite,
} from '../../src/sync/localWrites';

describe('localWrites', () => {
  it('advances the epoch on every write', () => {
    const before = localWriteEpoch();
    markLocalWrite();
    expect(localWriteEpoch()).toBe(before + 1);
  });

  // The drain calls this after a send lands. It must move the epoch, so a
  // sync pass whose fetch predates the send aborts instead of reverting it —
  // but must not notify, or every send would re-enter drainOutbox through its
  // own listener for an extra no-op pass.
  it('bumpWriteEpoch advances the epoch without notifying listeners', () => {
    const listener = jest.fn();
    const off = onLocalWrite(listener);
    const before = localWriteEpoch();

    bumpWriteEpoch();

    expect(localWriteEpoch()).toBe(before + 1);
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('notifies a subscribed listener on a local write', () => {
    const listener = jest.fn();
    const off = onLocalWrite(listener);

    markLocalWrite();

    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('no longer notifies a listener once unsubscribed', () => {
    const listener = jest.fn();
    const off = onLocalWrite(listener);
    off();

    markLocalWrite();

    expect(listener).not.toHaveBeenCalled();
  });
});
