// __tests__/features/DeckUnavailable.test.tsx
import { render, screen, renderHook } from '@testing-library/react-native';

import { DeckUnavailable, useDeckAvailability } from '../../src/features/board/components/DeckUnavailable';
import { useAccountStore } from '../../src/stores/accountStore';

// `useTheme` is the only thing the UI primitives pull from expo-router; the
// proxy answers every colour lookup so the component never reads undefined.
jest.mock('expo-router', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }) }),
}));

// There is no global i18n mock in jest.setup.js, so translation is stubbed here
// to keep the assertions independent of the English copy. This must keep the
// rest of the real module intact (spread jest.requireActual): `@/ui/components`
// transitively imports `@/utils/i18n`, which calls `i18n.use(initReactI18next)`
// at module scope, so replacing the whole module with just `useTranslation`
// makes that call throw "You are passing an undefined module!" on import.
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('DeckUnavailable', () => {
  it('names the server so the user knows which account is affected', () => {
    render(<DeckUnavailable baseUrl="https://cloud.example.com" />);
    expect(screen.getByText('cloud.example.com')).toBeTruthy();
  });

  it('explains what to do about it', () => {
    render(<DeckUnavailable baseUrl="https://cloud.example.com" />);
    expect(screen.getByText('deck.unavailableHint')).toBeTruthy();
  });
});

// The capability verdict is one flat, persisted object that is not keyed by
// account (see src/stores/accountStore.ts). Without an explicit check that it
// was measured against the CURRENTLY active account, a verdict left over from
// a previous account (or a stale probe) would incorrectly gate the new one.
// These tests fail if that id comparison is removed, even though the
// component tests above would keep passing.
describe('useDeckAvailability', () => {
  const baseCapabilities = { deckApp: 'unknown' as const, deckVersion: '', canCreateBoards: false };

  beforeEach(() => {
    useAccountStore.setState({
      activeAccountId: null,
      capabilities: baseCapabilities,
      capabilitiesAccountId: null,
    });
  });

  it('returns the stored verdict when it was measured against the active account', () => {
    useAccountStore.setState({
      activeAccountId: 'acc-1',
      capabilities: { ...baseCapabilities, deckApp: 'unavailable' },
      capabilitiesAccountId: 'acc-1',
    });

    const { result } = renderHook(() => useDeckAvailability());

    expect(result.current).toBe('unavailable');
  });

  it('returns unknown when the stored verdict belongs to a different account', () => {
    useAccountStore.setState({
      activeAccountId: 'acc-2',
      capabilities: { ...baseCapabilities, deckApp: 'unavailable' },
      capabilitiesAccountId: 'acc-1',
    });

    const { result } = renderHook(() => useDeckAvailability());

    expect(result.current).toBe('unknown');
  });

  it('returns unknown when there is no active account', () => {
    useAccountStore.setState({
      activeAccountId: null,
      capabilities: { ...baseCapabilities, deckApp: 'unavailable' },
      capabilitiesAccountId: null,
    });

    const { result } = renderHook(() => useDeckAvailability());

    expect(result.current).toBe('unknown');
  });
});
