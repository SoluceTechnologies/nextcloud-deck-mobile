import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ScreenHeader, ViewContainer } from '@/ui/components';

export default function TodayScreen() {
  const { t } = useTranslation();

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title={t('tabs.today')} />
      </SafeAreaView>
    </ViewContainer>
  );
}
