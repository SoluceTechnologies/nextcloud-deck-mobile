import { useWindowDimensions } from 'react-native';

export const WIDE_LAYOUT_MIN_WIDTH = 600;

export function useWideLayout(): boolean {
  return useWindowDimensions().width >= WIDE_LAYOUT_MIN_WIDTH;
}
