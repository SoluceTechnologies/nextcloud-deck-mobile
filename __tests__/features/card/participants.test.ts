import {
  filterParticipants,
  participantName,
  participantsOf,
} from '../../../src/features/card/participants';

// board.usersJson/aclJson hold what writeBoardRow stored: DeckBoardUser[]
// ({ uid, displayName }) and DeckAclEntry[] ({ uid, displayName, type }) — not
// the raw wire shapes the Deck API returns.
it('reads users and acl entries into one participant list', () => {
  const board: any = {
    usersJson: JSON.stringify([{ uid: 'alice', displayName: 'Alice' }]),
    aclJson: JSON.stringify([{ uid: 'devs', displayName: 'Devs', type: 1 }]),
  };
  expect(participantsOf(board)).toHaveLength(2);
});

// Both columns can name the same person; showing them twice is a bug.
it('does not list the same participant twice', () => {
  const board: any = {
    usersJson: JSON.stringify([{ uid: 'alice', displayName: 'Alice' }]),
    aclJson: JSON.stringify([{ uid: 'alice', displayName: 'Alice', type: 0 }]),
  };
  expect(participantsOf(board)).toHaveLength(1);
});

// A user and a group can share the same id — that is not the same duplicate.
it('keeps a user and a group that share an id as separate participants', () => {
  const board: any = {
    usersJson: JSON.stringify([{ uid: 'devs', displayName: 'Devs (user)' }]),
    aclJson: JSON.stringify([{ uid: 'devs', displayName: 'Devs (group)', type: 1 }]),
  };
  expect(participantsOf(board)).toHaveLength(2);
});

// These columns come off the wire and can be anything after a bad response.
it('returns an empty list rather than throwing on malformed JSON', () => {
  expect(participantsOf({ usersJson: 'not json', aclJson: '[]' } as never)).toEqual([]);
});

it('returns an empty list rather than throwing when a column holds a non-array', () => {
  expect(participantsOf({ usersJson: '{}', aclJson: 'null' } as never)).toEqual([]);
});

it('matches on display name and on id, case-insensitively', () => {
  const all = [{ participant: 'alice', displayName: 'Alice Martin', assigneeType: 0 }];
  expect(filterParticipants(all, 'martin')).toHaveLength(1);
  expect(filterParticipants(all, 'ALI')).toHaveLength(1);
});

// The threshold is what stops a 500-person board rendering on the first keystroke.
it('returns nothing below two characters', () => {
  const all = [{ participant: 'alice', displayName: 'Alice', assigneeType: 0 }];
  expect(filterParticipants(all, 'a')).toEqual([]);
  expect(filterParticipants(all, 'al')).toHaveLength(1);
});

// Deck reports a card's owner as a bare uid; on an SSO server that is an
// opaque UUID, which is what the details block was printing.
describe('participantName', () => {
  const people = [
    { participant: 'keycloak-3ddbe54d', displayName: 'Charles Gauthereau', assigneeType: 0 },
    { participant: 'devs', displayName: 'Devs', assigneeType: 1 },
  ];

  it('resolves an id to the name the board carries for it', () => {
    expect(participantName(people, 'keycloak-3ddbe54d')).toBe('Charles Gauthereau');
  });

  // The owner may have left the board since creating the card, so the board's
  // people list no longer names them.
  it('falls back to the signed-in account when the board does not list them', () => {
    const self = { davUserId: 'gone', displayName: 'Me' };
    expect(participantName(people, 'gone', self)).toBe('Me');
  });

  // The board wins: a shared board names everyone, and the account only knows
  // about itself.
  it('prefers the board entry over the account', () => {
    const self = { davUserId: 'keycloak-3ddbe54d', displayName: 'Stale Name' };
    expect(participantName(people, 'keycloak-3ddbe54d', self)).toBe('Charles Gauthereau');
  });

  // A stable identifier beats a blank row.
  it('falls back to the raw id when nothing names them', () => {
    expect(participantName(people, 'stranger')).toBe('stranger');
    expect(participantName(people, 'stranger', { davUserId: 'me', displayName: 'Me' })).toBe('stranger');
  });

  it('is empty for an empty id', () => {
    expect(participantName(people, '')).toBe('');
  });
});
