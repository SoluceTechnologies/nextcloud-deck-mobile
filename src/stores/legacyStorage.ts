import { zustandStorage } from '@/storage';

const LEGACY_KEY = 'app-store';

export function legacyBackedStorage(ownedKeys: readonly string[]) {
  return {
    getItem: (name: string): string | null => {
      const own = zustandStorage.getItem(name);
      if (own != null) return own;

      const legacy = zustandStorage.getItem(LEGACY_KEY);
      if (legacy == null) return null;

      try {
        const parsed = JSON.parse(legacy) as { state?: Record<string, unknown> };
        const state = parsed.state ?? {};
        const picked: Record<string, unknown> = {};
        for (const key of ownedKeys) {
          if (key in state) picked[key] = state[key];
        }
        if (Object.keys(picked).length === 0) return null;
        return JSON.stringify({ state: picked, version: 0 });
      } catch {
        return null;
      }
    },
    setItem: zustandStorage.setItem,
    removeItem: zustandStorage.removeItem,
  };
}
