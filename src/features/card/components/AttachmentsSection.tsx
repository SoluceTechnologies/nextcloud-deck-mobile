import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { File, FileText, Image as ImageIcon } from 'lucide-react-native';

import type Attachment from '@/database/models/Attachment';
import { Icon, Item, List, SectionHeader, Spinner, Typography } from '@/ui/components';

export interface AttachmentsSectionProps {
  attachments: Attachment[];
  /** The card's detail fetch is in flight — see useCardDetailSync. */
  loading?: boolean;
  onOpen: (attachment: Attachment) => void;
}

/** 1024-based, no decimal below 1 MB — matches how Files/Nextcloud show size. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mime: string): ComponentType<{ color?: string; size?: number }> {
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime === 'application/pdf') return FileText;
  return File;
}

/**
 * The card's file list (spec §7.5.8 / §13.5) — view only in v0, so there is
 * no upload affordance here, only the list and an empty state. Opening a file
 * is the caller's job (onOpen): this component knows nothing about accounts
 * or download URLs.
 */
export function AttachmentsSection({ attachments, loading, onOpen }: AttachmentsSectionProps) {
  const { t } = useTranslation();

  return (
    <View>
      <SectionHeader title={t('card.files')} />
      {attachments.length === 0 ? (
        // "No files" is only true once the fetch has answered: an empty list
        // means "not in yet" just as often as it means "there are none".
        loading ? (
          <Spinner testID="files-loading" />
        ) : (
          <Typography color="secondary" align="center">
            {t('card.noFiles')}
          </Typography>
        )
      ) : (
        <List>
          {attachments.map((attachment) => {
            const AttachmentIcon = iconFor(attachment.mime);
            return (
              <View key={attachment.id} testID={`attachment-${attachment.id}`}>
                <Item
                  title={attachment.fileName}
                  description={
                    <View style={styles.meta}>
                      <Typography variant="caption" color="secondary">
                        {formatSize(attachment.size)}
                      </Typography>
                      <Typography variant="caption" color="secondary">{` · ${attachment.mime}`}</Typography>
                    </View>
                  }
                  leading={
                    <Icon>
                      <AttachmentIcon />
                    </Icon>
                  }
                  onPress={() => onOpen(attachment)}
                />
              </View>
            );
          })}
        </List>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row' },
});
