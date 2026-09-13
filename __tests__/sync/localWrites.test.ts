import { localWriteEpoch, markLocalWrite, onLocalWrite } from '../../src/sync/localWrites';

describe('localWrites', () => {
  it('advances the epoch on every write', () => {
    const before = localWriteEpoch();
    markLocalWrite();
    expect(localWriteEpoch()).toBe(before + 1);
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
