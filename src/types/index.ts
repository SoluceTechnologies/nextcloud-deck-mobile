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

export type CalendarAppStatus = 'unknown' | 'available' | 'unconfigured';

export type ServerCapabilities = {
  talkEnabled: boolean;
  calendarApp: CalendarAppStatus;
};
