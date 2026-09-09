export type Account = {
  id: string;
  displayName: string;
  baseUrl: string;
  username: string;
  appPassword: string;
  davUserId: string;
  timezone?: string;
  email?: string;
};

export type DeckAppStatus = 'unknown' | 'available' | 'unavailable';

export type ServerCapabilities = {
  deckApp: DeckAppStatus;
  deckVersion: string;
  canCreateBoards: boolean;
};
