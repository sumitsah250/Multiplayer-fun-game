/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Player } from '../gameLogic.ts';
import {
  addReady,
  everyoneReady,
  isNameTaken,
  isCalloutMessage,
  isRoomSnapshot,
  isValidRoomCode,
  makeRoomCode,
  membersFromPresence,
  missionFor,
  normalizeRoomCode,
  normalizeSnapshot,
} from './protocol.ts';
import type { RoomMember, RoomSnapshot } from './protocol.ts';

function member(id: string, name: string, joinedAt: number, role: RoomMember['role'] = 'guest'): RoomMember {
  return { id, name, role, joinedAt };
}

function player(name: string): Player {
  return {
    name,
    avatar: '😎',
    mission: `Mission for ${name}`,
    missionId: `id-${name}`,
    target: '',
    difficulty: 'medium',
    kind: 'say',
    role: 'agent',
    completed: null,
  };
}

describe('room codes', () => {
  it('makes four-letter codes without I or O', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const code = makeRoomCode(() => (seed % 100) / 100);
      assert.equal(code.length, 4);
      assert.ok(isValidRoomCode(code), code);
      assert.ok(!/[IO]/.test(code));
    }
  });

  it('cleans up what a player types', () => {
    assert.equal(normalizeRoomCode(' ab-cd9e '), 'ABCD');
    assert.equal(normalizeRoomCode('xy'), 'XY');
    assert.equal(isValidRoomCode('XY'), false);
    assert.equal(isValidRoomCode('ABIO'), false);
  });
});

describe('membersFromPresence', () => {
  it('lists the host first, then guests in join order, one entry per phone', () => {
    const members = membersFromPresence({
      g2: [member('g2', 'Cleo', 30)],
      host: [member('host', 'Ana', 50, 'host')],
      g1: [member('g1', ' Ben ', 20), member('g1', 'Ben', 40)],
    });
    assert.deepEqual(
      members.map((entry) => [entry.name, entry.role]),
      [
        ['Ana', 'host'],
        ['Ben', 'guest'],
        ['Cleo', 'guest'],
      ],
    );
  });

  it('ignores malformed presence payloads', () => {
    const members = membersFromPresence({
      a: [{ id: 'a', name: '', role: 'guest', joinedAt: 1 }],
      b: [{ nonsense: true }],
      c: [member('c', 'Cleo', 3)],
    });
    assert.deepEqual(members.map((entry) => entry.name), ['Cleo']);
  });
});

describe('isNameTaken', () => {
  const host = member('h', 'Ana', 10, 'host');
  const ben = member('b', 'Ben', 20);

  it('asks the later joiner to rename', () => {
    const lateBen = member('b2', 'ben', 30);
    assert.equal(isNameTaken([host, ben, lateBen], lateBen), true);
    assert.equal(isNameTaken([host, ben, lateBen], ben), false);
  });

  it('never lets a guest take the host name', () => {
    const earlyAna = member('a2', 'ANA', 1);
    assert.equal(isNameTaken([host, earlyAna], earlyAna), true);
  });

  it('allows distinct names', () => {
    const cleo = member('c', 'Cleo', 30);
    assert.equal(isNameTaken([host, ben, cleo], cleo), false);
  });
});

describe('ready tracking', () => {
  it('collects each player once per round', () => {
    let ready = { roundId: 1, names: [] as string[] };
    ready = addReady(ready, { roundId: 1, name: 'Ben' });
    ready = addReady(ready, { roundId: 1, name: 'ben' });
    assert.deepEqual(ready, { roundId: 1, names: ['Ben'] });
  });

  it('starts fresh for a new round and ignores stale messages', () => {
    let ready = { roundId: 1, names: ['Ben'] };
    ready = addReady(ready, { roundId: 2, name: 'Cleo' });
    assert.deepEqual(ready, { roundId: 2, names: ['Cleo'] });
    assert.deepEqual(addReady(ready, { roundId: 1, name: 'Dev' }), ready);
  });

  it('knows when everyone in the round has checked their mission', () => {
    const players = [player('Ana'), player('Ben')];
    assert.equal(everyoneReady(players, ['Ana']), false);
    assert.equal(everyoneReady(players, ['ana', 'BEN']), true);
    assert.equal(everyoneReady([], []), false);
  });
});

describe('snapshots', () => {
  const snapshot: RoomSnapshot = {
    phase: 'missions',
    roundId: 3,
    mode: 'classic',
    durationSeconds: 300,
    chaosEventId: null,
    players: [player('Ana'), player('Ben')],
    readyNames: [],
    remainingMs: null,
    revealReady: false,
    roundsPlayed: 2,
    scores: [],
    callouts: [],
    bountyName: null,
    swapPair: null,
    swapped: false,
    creativeName: null,
    deniedNames: [],
  };

  it('finds a player mission by name, case-insensitively', () => {
    assert.equal(missionFor(snapshot, 'ben ')?.mission, 'Mission for Ben');
    assert.equal(missionFor(snapshot, 'Cleo'), null);
  });

  it('validates incoming payloads', () => {
    assert.equal(isRoomSnapshot(snapshot), true);
    assert.equal(isRoomSnapshot({ ...snapshot, phase: 'dancing' }), false);
    assert.equal(isRoomSnapshot(null), false);
  });

  it('fills in fields an older host does not send', () => {
    const old = {
      phase: 'playing',
      roundId: 1,
      players: [{ name: 'Ana', avatar: '🦊', mission: 'Make Ben laugh.', completed: null }],
      readyNames: [],
      scores: [],
    };
    const normalized = normalizeSnapshot(old);
    assert.ok(normalized);
    assert.deepEqual(normalized.callouts, []);
    assert.equal(normalized.players[0].role, 'agent');
    assert.equal(normalized.swapped, false);
    assert.equal(normalizeSnapshot({ phase: 'nope' }), null);
  });
});

describe('call-out messages', () => {
  it('validates incoming call-outs', () => {
    assert.equal(isCalloutMessage({ roundId: 1, accuser: 'Ana', suspect: 'Ben', guess: 'x' }), true);
    assert.equal(isCalloutMessage({ roundId: 1, accuser: 'Ana', suspect: 'Ben' }), false);
    assert.equal(isCalloutMessage(null), false);
  });
});

describe('presence avatars', () => {
  it('keeps a chosen avatar and ignores a bad one', () => {
    const members = membersFromPresence({
      a: [{ ...member('a', 'Ana', 1), avatar: '👑' }],
      b: [{ ...member('b', 'Ben', 2), avatar: 7 }],
    });
    assert.equal(members[0].avatar, '👑');
    assert.equal(members[1].avatar, undefined);
  });
});
