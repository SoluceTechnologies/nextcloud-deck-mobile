import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ScreenHeader, ViewContainer } from '@/ui/components';

export default function BoardsScreen() {
  const { t } = useTranslation();

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title={t('tabs.boards')} />
      </SafeAreaView>
    </ViewContainer>
  );
}
