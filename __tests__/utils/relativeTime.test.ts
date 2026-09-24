import { formatRelative } from '@/utils/relativeTime';

describe('formatRelative', () => {
  it('renders a short relative-time phrase', () => {
    expect(formatRelative(Date.now() - 4 * 86400000)).toContain('4 days');
  });
});
