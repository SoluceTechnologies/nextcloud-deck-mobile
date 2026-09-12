import { SpikeScreen } from '@/features/card/markdown/__spike__/SpikeScreen';

// Throwaway route for the §8 markdown round-trip spike (Task 20). Reachable
// only by deep link — see docs/v0/markdown-spike.md — never linked from the
// app. Deleted along with the harness once the spike result is recorded.
export default function MarkdownSpikeRoute() {
  return <SpikeScreen />;
}
