import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

/** "4 days ago", in the app's current dayjs locale. */
export function formatRelative(ms: number): string {
  return dayjs(ms).fromNow();
}
