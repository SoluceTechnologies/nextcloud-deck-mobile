import { createMMKV, type MMKV } from 'react-native-mmkv';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage: MMKV = createMMKV();

export const zustandStorage = {
  getItem: (name: string): string | null => storage.getString(name) ?? null,
  setItem: (name: string, value: string): void => storage.set(name, value),
  removeItem: (name: string): void => {
    storage.remove(name);
  },
};

export const asyncStorage = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(storage.getString(key) ?? null),
  setItem: (key: string, value: string): Promise<void> => {
    storage.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    storage.remove(key);
    return Promise.resolve();
  },
};

const MIGRATION_FLAG = '__migrated_from_async_storage__';

const MIGRATION_KEYS = ['account_ids', 'active_account_id', 'app-store'];

export async function migrateFromAsyncStorage(): Promise<void> {
  if (storage.getBoolean(MIGRATION_FLAG)) return;
  try {
    for (const key of MIGRATION_KEYS) {
      const value = await AsyncStorage.getItem(key);
      if (value != null && storage.getString(key) == null) {
        storage.set(key, value);
      }
    }
  } catch {}
  storage.set(MIGRATION_FLAG, true);
}
