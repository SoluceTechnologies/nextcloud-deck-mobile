import { useState } from 'react';
import { Image, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ExternalLink, X } from 'lucide-react-native';

import type Attachment from '@/database/models/Attachment';
import { useAttachmentPreview } from '@/features/card/hooks/useAttachmentPreview';
import type { CardRemoteRef } from '@/sync/outbox/types';
import type { Account } from '@/types';
import { Button, Icon, IconButton, ScreenHeader, Spinner, Typography, ViewContainer } from '@/ui/components';

import { formatSize } from './AttachmentsSection';

export interface AttachmentPreviewProps {
  attachment: Attachment | null;
  account: Account | null;
  ref_: CardRemoteRef | null;
  onClose: () => void;
  onOpenExternally: (attachment: Attachment) => void;
}

export function AttachmentPreview({
  attachment,
  account,
  ref_,
  onClose,
  onOpenExternally,
}: AttachmentPreviewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const state = useAttachmentPreview(account, ref_, attachment);
  const [decodeFailed, setDecodeFailed] = useState(false);

  const fallbackMessage =
    state.status === 'tooLarge'
      ? t('card.preview.tooLarge')
      : state.status === 'failed' || decodeFailed
        ? t('card.preview.failed')
        : t('card.preview.unsupported');

  const showFallback =
    state.status === 'unsupported' ||
    state.status === 'tooLarge' ||
    state.status === 'failed' ||
    decodeFailed;

  return (
    <Modal
      visible={attachment !== null}
      animationType="slide"
      onRequestClose={onClose}
      key={attachment?.id ?? 'none'}
    >
      <ViewContainer>
        <SafeAreaView edges={['top']} style={styles.flex}>
          <ScreenHeader
            title={attachment?.fileName}
            left={
              <IconButton
                variant="ghost"
                round
                size={40}
                testID="preview-close"
                accessibilityLabel={t('common.close')}
                onPress={onClose}
              >
                <X size={22} color={colors.text} />
              </IconButton>
            }
          />

          <View style={styles.body}>
            {state.status === 'loading' ? <Spinner testID="preview-spinner" /> : null}

            {state.status === 'ready' && !decodeFailed ? (
              <Image
                testID="preview-image"
                source={{ uri: state.uri }}
                style={styles.image}
                resizeMode="contain"
                onError={() => setDecodeFailed(true)}
              />
            ) : null}

            {showFallback ? (
              <View style={styles.fallback}>
                <Typography testID="preview-fallback" color="secondary" align="center">
                  {fallbackMessage}
                </Typography>
                {attachment ? (
                  <Typography variant="caption" color="secondary" align="center">
                    {`${attachment.mime} · ${formatSize(attachment.size)}`}
                  </Typography>
                ) : null}
              </View>
            ) : null}
          </View>

          {attachment ? (
            <Button
              testID="preview-open-externally"
              variant="secondary"
              icon={<Icon size={18}><ExternalLink /></Icon>}
              title={t('card.preview.openExternally')}
              style={styles.action}
              onPress={() => onOpenExternally(attachment)}
            />
          ) : null}
        </SafeAreaView>
      </ViewContainer>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  image: { width: '100%', height: '100%' },
  fallback: { gap: 8 },
  action: { marginHorizontal: 16, marginBottom: 12 },
});
