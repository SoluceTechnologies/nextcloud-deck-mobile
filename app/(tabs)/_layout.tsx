import { Tabs, useTheme } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import {
  Sun, LayoutGrid, Search, Settings as SettingsIcon, type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { AndroidSymbol } from 'expo-symbols';
import { nativeTabsEnabled } from '@/utils/nativeTabs';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { DeckUnavailable, useDeckAvailability } from '@/features/board/components/DeckUnavailable';

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

function NativeTabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
      <NativeTabs labelStyle={{ color: theme.colors.text }} tintColor={theme.colors.primary}>
        {TAB_ITEMS.map((tab) => (
            <NativeTabs.Trigger key={tab.name} name={tab.name}>
              <NativeTabs.Trigger.Label>{t(tab.labelKey)}</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
            </NativeTabs.Trigger>
        ))}
      </NativeTabs>
  );
}

function JsTabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();

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

  // 'unknown' covers both "the capability call has not answered yet" and "the
  // last answer was for a different account" (see useDeckAvailability) — the
  // cached data is still worth showing either way, so only a definite
  // 'unavailable' for the CURRENT account blocks the app.
  if (status === 'unavailable' && account) {
    return <DeckUnavailable baseUrl={account.baseUrl} />;
  }

  return nativeTabsEnabled() ? <NativeTabsLayout /> : <JsTabsLayout />;
}