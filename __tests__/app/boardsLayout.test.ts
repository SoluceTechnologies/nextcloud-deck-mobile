import { unstable_settings } from '../../app/(tabs)/boards/_layout';

// A deep link or a reload straight to /boards/<id> builds the boards stack
// from scratch. Without an anchor it holds that board alone, and the back
// control has nowhere to go.
it('anchors the boards stack to the board list', () => {
  expect(unstable_settings).toEqual({ anchor: 'index' });
});
