import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

export interface ZoomableImageProps {
  uri: string;
  testID?: string;
  onError?: () => void;
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export function ZoomableImage({ uri, testID, onError }: ZoomableImageProps) {
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
    height.value = e.nativeEvent.layout.height;
  };

  const boundX = (s: number) => {
    'worklet';
    return (width.value * (s - 1)) / 2;
  };
  const boundY = (s: number) => {
    'worklet';
    return (height.value * (s - 1)) / 2;
  };

  const animateTo = (targetScale: number, targetX: number, targetY: number) => {
    'worklet';
    const s = clamp(targetScale, MIN_SCALE, MAX_SCALE);
    const x = clamp(targetX, -boundX(s), boundX(s));
    const y = clamp(targetY, -boundY(s), boundY(s));
    scale.value = withTiming(s);
    tx.value = withTiming(x);
    ty.value = withTiming(y);
    savedScale.value = s;
    savedTx.value = x;
    savedTy.value = y;
  };

  const settle = () => {
    'worklet';
    animateTo(scale.value, tx.value, ty.value);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = clamp(savedScale.value * e.scale, MIN_SCALE * 0.8, MAX_SCALE * 1.2);
      const fx = e.focalX - width.value / 2;
      const fy = e.focalY - height.value / 2;
      const ratio = next / savedScale.value;
      scale.value = next;
      tx.value = fx - ratio * (fx - savedTx.value);
      ty.value = fy - ratio * (fy - savedTy.value);
    })
    .onEnd(settle);

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (e.numberOfPointers > 1 || savedScale.value <= MIN_SCALE) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(settle);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (savedScale.value > MIN_SCALE) {
        animateTo(MIN_SCALE, 0, 0);
        return;
      }
      const fx = e.x - width.value / 2;
      const fy = e.y - height.value / 2;
      animateTo(DOUBLE_TAP_SCALE, fx - DOUBLE_TAP_SCALE * fx, fy - DOUBLE_TAP_SCALE * fy);
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View style={styles.frame} onLayout={handleLayout} collapsable={false}>
        <Reanimated.Image
          testID={testID}
          source={{ uri }}
          style={[styles.image, imageStyle]}
          resizeMode="contain"
          onError={onError}
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, alignSelf: 'stretch', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
