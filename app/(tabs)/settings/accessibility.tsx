import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/stores/settingsStore';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { Divider, Stack, Toggle, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

interface RowProps {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}

function ToggleRow({ label, hint, value, onValueChange }: RowProps) {
  return (
    <Stack direction="horizontal" vAlign="center" gap={12}>
      <Stack gap={2} style={{ flex: 1 }}>
        <Typography variant="body1">{label}</Typography>
        <Typography variant="caption" color="secondary">{hint}</Typography>
      </Stack>
      <Toggle value={value} onValueChange={onValueChange} />
    </Stack>
  );
}

export default function AccessibilitySettingsScreen() {
  const { t } = useTranslation();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setReduceMotion = useSettingsStore((s) => s.setReduceMotion);

  return (
    <SettingsPage title={t('settings.accessibility.title')}>
      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <ToggleRow
          label={t('settings.accessibility.haptics')}
          hint={t('settings.accessibility.hapticsHint')}
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
        />
        <Divider />
        <ToggleRow
          label={t('settings.accessibility.reduceMotion')}
          hint={t('settings.accessibility.reduceMotionHint')}
          value={reduceMotion}
          onValueChange={setReduceMotion}
        />
      </Stack>
    </SettingsPage>
  );
}
