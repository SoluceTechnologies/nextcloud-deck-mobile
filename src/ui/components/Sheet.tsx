import React, { useEffect, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
  type LayoutChangeEvent,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import IconButton from './IconButton';
import ScreenHeader from './ScreenHeader';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const OPEN_SPRING = { damping: 28, stiffness: 260, mass: 0.9 };
const CLOSE_DURATION = 200;

function useKeyboardVisible(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setShown(true));
    const hide = Keyboard.addListener(hideEvent, () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

function Sheet({ visible, onClose, title, children, footer }: SheetProps) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const keyboardVisible = useKeyboardVisible();

  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const height = useSharedValue(1000);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = reduceMotion ? 1 : withSpring(1, OPEN_SPRING);
      return undefined;
    }
    if (reduceMotion) {
      progress.value = 0;
      setMounted(false);
      return undefined;
    }
    progress.value = withTiming(0, { duration: CLOSE_DURATION });
    const timer = setTimeout(() => setMounted(false), CLOSE_DURATION);
    return () => clearTimeout(timer);
  }, [visible, reduceMotion, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(progress.value, 1) }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height.value }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height;
  };

  const bottomPadding = keyboardVisible ? 16 : insets.bottom + 16;

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Reanimated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Reanimated.View>
        <View pointerEvents="box-none" style={[styles.anchor, { paddingTop: insets.top + 8 }]}>
          <Reanimated.View
            onLayout={handleLayout}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                borderTopLeftRadius: radius.lg,
                borderTopRightRadius: radius.lg,
              },
              sheetStyle,
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <ScreenHeader
              title={title}
              left={
                <IconButton
                  variant="ghost"
                  glass
                  round
                  size={40}
                  onPress={onClose}
                  accessibilityLabel={t('common.close')}
                >
                  <X size={22} color={colors.text} />
                </IconButton>
              }
            />
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, { paddingBottom: footer ? 12 : bottomPadding }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            {footer ? (
              <View style={[styles.footer, { paddingBottom: bottomPadding }]}>{footer}</View>
            ) : null}
          </Reanimated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxHeight: '100%',
    paddingTop: 8,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
});

export default React.memo(Sheet);
