import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Tabs, usePathname, useTheme } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import {
  Sun, LayoutGrid, Plus, Search, Settings as SettingsIcon, type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { AndroidSymbol } from 'expo-symbols';
import { nativeTabsEnabled } from '@/utils/nativeTabs';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { DeckUnavailable, useDeckAvailability } from '@/features/board/components/DeckUnavailable';
import { QuickAddCardFlow } from '@/features/card/components/QuickAddCardFlow';
import { useFailedSyncCount } from '@/features/settings/hooks/useFailedSyncCount';
import { Typography } from '@/ui/components';

type IconState<T> = { default: T; selected: T };

type TabItem = {
  name: string;
  labelKey: string;
  sf: IconState<SFSymbol>;
  md: IconState<AndroidSymbol>;
  Icon: LucideIcon;
};

const TAB_ITEMS: TabItem[] = [
  {
    name: 'today/index',
    labelKey: 'tabs.today',
    sf: { default: 'sun.max', selected: 'sun.max.fill' },
    md: { default: 'today', selected: 'today' },
    Icon: Sun,
  },
  {
    name: 'boards',
    labelKey: 'tabs.boards',
    sf: { default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' },
    md: { default: 'grid_view', selected: 'grid_view' },
    Icon: LayoutGrid,
  },
  {
    name: 'search/index',
    labelKey: 'tabs.search',
    sf: { default: 'magnifyingglass', selected: 'magnifyingglass' },
    md: { default: 'search', selected: 'search' },
    Icon: Search,
  },
  {
    name: 'settings',
    labelKey: 'tabs.settings',
    sf: { default: 'gearshape', selected: 'gearshape.fill' },
    md: { default: 'settings', selected: 'settings' },
    Icon: SettingsIcon,
  },
];

// Tabs whose screens offer "Add a card"; on iOS 26 it floats above the tab bar
// as the native bottom accessory instead of sitting under the glass bar.
const QUICK_ADD_PATHS = new Set(['/today', '/search']);

function NativeTabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const pathname = usePathname();
  const accountId = useAccountStore((s) => s.activeAccountId);
  const [addVisible, setAddVisible] = useState(false);
  const failedSyncCount = useFailedSyncCount();

  return (
    <>
      <NativeTabs labelStyle={{ color: theme.colors.text }} tintColor={theme.colors.primary}>
        {QUICK_ADD_PATHS.has(pathname) ? (
            <NativeTabs.BottomAccessory>
              <Pressable
                  testID="tabs-add-card"
                  accessibilityRole="button"
                  style={styles.accessory}
                  onPress={() => setAddVisible(true)}
              >
                <Plus size={18} color={theme.colors.primary} />
                <Typography color="primary" weight="600">{t('today.addCard')}</Typography>
              </Pressable>
            </NativeTabs.BottomAccessory>
        ) : null}
        {TAB_ITEMS.map((tab) => (
            <NativeTabs.Trigger key={tab.name} name={tab.name}>
              <NativeTabs.Trigger.Label>{t(tab.labelKey)}</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
              {tab.name === 'settings' && failedSyncCount > 0 ? (
                  <NativeTabs.Trigger.Badge>{String(failedSyncCount)}</NativeTabs.Trigger.Badge>
              ) : null}
            </NativeTabs.Trigger>
        ))}
      </NativeTabs>
      <QuickAddCardFlow visible={addVisible} accountId={accountId} onClose={() => setAddVisible(false)} />
    </>
  );
}

function JsTabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  const failedSyncCount = useFailedSyncCount();

  return (
      <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.tabBarInactive,
            tabBarStyle: {
              backgroundColor: theme.colors.tabBar,
              borderTopColor: theme.colors.tabBarBorder,
              borderTopWidth: 1,
              elevation: 0,
            },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }}
      >
        {TAB_ITEMS.map(({ name, labelKey, Icon }) => (
            <Tabs.Screen
                key={name}
                name={name}
                options={{
                  title: t(labelKey),
                  tabBarLabel: t(labelKey),
                  tabBarBadge: name === 'settings' && failedSyncCount > 0 ? failedSyncCount : undefined,
                  tabBarIcon: ({ color, focused }) => (
                      <Icon size={focused ? 26 : 24} color={color} strokeWidth={focused ? 2.5 : 2} />
                  ),
                }}
            />
        ))}
      </Tabs>
  );
}

export default function TabsLayout() {
  const status = useDeckAvailability();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(activeAccountId);
  if (status === 'unavailable' && account) {
    return <DeckUnavailable baseUrl={account.baseUrl} />;
  }

  return nativeTabsEnabled() ? <NativeTabsLayout /> : <JsTabsLayout />;
}
const styles = StyleSheet.create({
  accessory: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
