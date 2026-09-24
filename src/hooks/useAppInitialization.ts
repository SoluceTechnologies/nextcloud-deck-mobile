import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import {
  loadAccounts,
  getActiveAccountId,
  setActiveAccountId as persistActiveAccountId,
  refreshAccountProfiles,
} from '@/services/nextcloud/auth';
import { useAccountStore } from '@/stores/accountStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { setAccounts } from '@/hooks/useAccounts';
import { fetchCapabilities } from '@/services/nextcloud/nextcloud';
import { setupOnlineManager } from '@/services/shared/network';
import { initializeDatabaseOnStartup } from '@/database/utils/initialization';
import { migrateFromAsyncStorage } from '@/storage';
import { pushPinsToNative } from '@/services/shared/certPins';

SplashScreen.preventAutoHideAsync();

const MAX_BOOT_ATTEMPTS = 3;

export function useAppInitialization() {
  const [isAppReady, setIsAppReady] = useState(false);
  const setStoreAccountId = useAccountStore((s) => s.setActiveAccountId);
  const setCapabilities = useAccountStore((s) => s.setCapabilities);

  useEffect(() => {
    const teardownOnline = setupOnlineManager();
    return teardownOnline;
  }, []);

  useEffect(() => {
    let mounted = true;
    let booted = false;
    let running = false;
    let attempts = 0;

    const boot = async () => {
      if (booted || running) return;
      running = true;
      try {
        await migrateFromAsyncStorage();
        pushPinsToNative();
        await Promise.all([
          useAccountStore.persist.rehydrate(),
          useSettingsStore.persist.rehydrate(),
        ]);
        await initializeDatabaseOnStartup();

        const accounts = await loadAccounts();
        booted = true;
        setAccounts(accounts);
        if (accounts.length > 0) {
          const activeId = await getActiveAccountId();
          const id = activeId ?? accounts[0].id;
          await persistActiveAccountId(id);
          setStoreAccountId(id);

          const activeAccount = accounts.find((a) => a.id === id) ?? accounts[0];
          void refreshAccountProfiles()
            .then((refreshed) => {
              if (refreshed.length > 0) setAccounts(refreshed);
            })
            .catch((e) => {
              console.warn('[useAppInitialization] refreshAccountProfiles failed:', String(e));
            });
          void fetchCapabilities(activeAccount)
            .then((caps) => {
              if (
                mounted &&
                caps &&
                useAccountStore.getState().activeAccountId === activeAccount.id
              ) {
                setCapabilities(caps, activeAccount.id);
              }
            })
            .catch((e) => {
              console.warn('[useAppInitialization] fetchCapabilities failed:', String(e));
            });
        }
        if (mounted) setIsAppReady(true);
      } catch (e) {
        attempts += 1;
        console.warn(`[useAppInitialization] boot attempt ${attempts} failed:`, String(e));
        if (mounted && attempts >= MAX_BOOT_ATTEMPTS) setIsAppReady(true);
      } finally {
        running = false;
      }
    };

    void boot();
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') void boot();
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [setStoreAccountId, setCapabilities]);

  return { isAppReady };
}
