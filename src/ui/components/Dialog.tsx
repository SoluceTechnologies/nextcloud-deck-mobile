import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import Stack from './Stack';

interface DialogProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function Dialog({ visible, onClose, children }: DialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <AnimatedPressable animated={false} onPress={onClose} style={styles.backdrop}>
        <View onStartShouldSetResponder={() => true} style={styles.stop}>
          <Stack card gap={12} padding={24} hAlign="center">
            {children}
          </Stack>
        </View>
      </AnimatedPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 24,
  },
  stop: { width: '86%' },
});

export default React.memo(Dialog);
