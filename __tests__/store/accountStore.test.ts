import { useAccountStore } from '../../src/stores/accountStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('accountStore', () => {
  beforeEach(() => {
    useAccountStore.setState({
      activeAccountId: null,
      capabilities: { deckApp: 'unknown', deckVersion: '', canCreateBoards: false },
      capabilitiesAccountId: null,
    });
  });

  it('sets active account id', () => {
    useAccountStore.getState().setActiveAccountId('acc-1');
    expect(useAccountStore.getState().activeAccountId).toBe('acc-1');
  });

  it('clears active account id', () => {
    useAccountStore.getState().setActiveAccountId('acc-1');
    useAccountStore.getState().setActiveAccountId(null);
    expect(useAccountStore.getState().activeAccountId).toBeNull();
  });

  it('sets capabilities', () => {
    useAccountStore.getState().setCapabilities({ deckApp: 'available', deckVersion: '1.14.2', canCreateBoards: true }, 'acc-1');
    expect(useAccountStore.getState().capabilities.deckApp).toBe('available');
  });

  it('records which account the capabilities were measured against', () => {
    useAccountStore.getState().setCapabilities({ deckApp: 'unavailable', deckVersion: '', canCreateBoards: false }, 'acc-1');
    expect(useAccountStore.getState().capabilitiesAccountId).toBe('acc-1');
  });
});
