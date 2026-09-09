import { Image, Linking } from 'react-native';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Bug } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { Button, Icon, Stack, Typography } from '@/ui/components';

const GITHUB_URL = 'https://github.com/SoluceTechnologies/nextcloud-calendar-mobile';
const ISSUES_URL = 'https://github.com/SoluceTechnologies/nextcloud-calendar-mobile/issues/new';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

export default function AboutScreen() {
  const { t } = useTranslation();
  const appVersion = Constants.expoConfig?.version ?? '—';

  return (
    <SettingsPage title={t('settings.about.title')}>
      <Stack card gap={12} padding={24} hAlign="center" style={cardOuter}>
        <Image
          source={require('../../../assets/icon.png')}
          style={{ width: 72, height: 72, borderRadius: 16 }}
        />
        <Typography variant="title">{t('settings.about.name')}</Typography>
        <Typography variant="caption" color="secondary">
          {t('settings.version', { version: appVersion })}
        </Typography>
        <Typography variant="caption" color="secondary" align="center">
          {t('settings.about.description')}
        </Typography>
      </Stack>

      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Button
          variant="primary"
          title={t('settings.about.github')}
          icon={<Icon size={18}><Ionicons name="logo-github" color="#fff" /></Icon>}
          onPress={() => Linking.openURL(GITHUB_URL)}
        />
        <Button
          variant="secondary"
          color="text"
          title={t('settings.about.reportBug')}
          icon={<Icon size={18}><Bug /></Icon>}
          onPress={() => Linking.openURL(ISSUES_URL)}
        />
      </Stack>
    </SettingsPage>
  );
}
