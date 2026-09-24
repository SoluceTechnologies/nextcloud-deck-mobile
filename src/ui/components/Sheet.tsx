import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
  type LayoutChangeEvent,
} from 'react-native';
import Reanimated, {
  useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withSpring,
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

const IOS = Platform.OS === 'ios';

function Sheet({ visible, onClose, title, children, footer }: SheetProps) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const keyboard = useAnimatedKeyboard();

  const progress = useSharedValue(0);
  const height = useSharedValue(1000);

  useEffect(() => {
    if (!visible) {
      progress.value = 0;
      return;
    }
    progress.value = reduceMotion ? 1 : withSpring(1, OPEN_SPRING);
  }, [visible, reduceMotion, progress]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height.value }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height;
  };

  const safeBottom = insets.bottom;
  const liftStyle = useAnimatedStyle(() => ({ paddingBottom: IOS ? keyboard.height.value : 0 }));
  const safeSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(safeBottom - (IOS ? keyboard.height.value : 0), 0),
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.flex} behavior="height" enabled={!IOS}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        <Reanimated.View pointerEvents="box-none" style={[styles.anchor, { paddingTop: insets.top + 8 }, liftStyle]}>
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
              contentContainerStyle={[styles.content, { paddingBottom: footer ? 12 : 16 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            {footer ? (
              <View style={styles.footer}>{footer}</View>
            ) : null}
            <Reanimated.View style={safeSpacerStyle} />
          </Reanimated.View>
        </Reanimated.View>
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
  footer: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 12 },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
});

export default React.memo(Sheet);
