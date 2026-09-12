import { participantsOf, filterParticipants } from '../../../src/features/card/participants';

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
