import type {ComponentType} from 'react';
import {StyleSheet, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {File, FileText, Image as ImageIcon, Paperclip} from 'lucide-react-native';

import type Attachment from '@/database/models/Attachment';
import {EmptyState, Icon, Item, List, SectionHeader, Typography} from '@/ui/components';

export interface AttachmentsSectionProps {
    attachments: Attachment[];
    loading?: boolean;
    expectedCount?: number;
    onOpen: (attachment: Attachment) => void;
}

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

export function AttachmentsSection({
                                       attachments,
                                       loading,
                                       expectedCount = 0,
                                       onOpen,
                                   }: AttachmentsSectionProps) {
    const {t} = useTranslation();

    const waiting = Boolean(loading) && attachments.length === 0 && expectedCount > 0;

    return (
        <View>
            <SectionHeader title={t('card.files')}/>
            {attachments.length === 0 ? (
                <EmptyState
                    testID="files-empty"
                    loading={waiting}
                    icon={<Paperclip/>}
                    title={t('card.noFiles')}
                    description={t('card.noFilesHint')}
                />
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
                                            <Typography variant="caption"
                                                        color="secondary">{` · ${attachment.mime}`}</Typography>
                                        </View>
                                    }
                                    leading={
                                        <Icon>
                                            <AttachmentIcon/>
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
    meta: {flexDirection: 'row'},
});
