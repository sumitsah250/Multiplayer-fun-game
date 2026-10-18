// Private-room protocol: what the host phone and guest phones send each other
// over a Supabase Realtime channel. Pure functions only (no React Native or
// Supabase imports) so the rules can be unit tested with `npm test`.
//
// The host is the source of truth. It broadcasts a full `RoomSnapshot` whenever
// the game changes and whenever someone joins, so a guest that reconnects
// catches up from the next snapshot. Guests only ever send `ready` and
// `callout`; the host checks every call-out before it counts.
import { CHAOS_EVENTS, playerKey } from '../gameLogic.ts';
import type { Callout, ChaosEvent, ChaosEventId, GameMode, Player, RoundOutcome } from '../gameLogic.ts';

export const ROOM_CODE_LENGTH = 4;
// No I or O, so codes can't be misread as 1 or 0.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const ROOM_EVENTS = {
  snapshot: 'snapshot',
  ready: 'ready',
  callout: 'callout',
  hello: 'hello',
  closed: 'closed',
} as const;

export type MemberRole = 'host' | 'guest';

// What each phone publishes through Realtime presence.
export type RoomMember = {
  id: string;
  name: string;
  role: MemberRole;
  joinedAt: number;
  avatar?: string;
};

export type RoomPhase = 'lobby' | 'missions' | 'playing' | 'reveal';

export type RoomScore = { name: string; score: number; streak: number };

// The host's view of the game, as broadcast to guests.
export type RoomSnapshot = {
  phase: RoomPhase;
  roundId: number;
  mode: GameMode;
  durationSeconds: number;
  chaosEventId: ChaosEventId | null;
  players: Player[];
  readyNames: string[];
  // Time left when the host sent the snapshot. Guests add it to their own clock,
  // so phones with slightly different clocks still agree on the countdown.
  remainingMs: number | null;
  revealReady: boolean;
  roundsPlayed: number;
  scores: RoomScore[];
  callouts: Callout[];
  bountyName: string | null;
  // The two players who trade missions in a Swap round, and whether it happened yet.
  swapPair: [string, string] | null;
  swapped: boolean;
  creativeName: string | null;
  deniedNames: string[];
};

export type ReadyMessage = { roundId: number; name: string };
export type CalloutMessage = { roundId: number; accuser: string; suspect: string; guess: string };

export function makeRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && [...code].every((letter) => ROOM_CODE_ALPHABET.includes(letter));
}

export function roomChannelName(code: string): string {
  return `lowkey-room-${code}`;
}

export function makeMemberId(random: () => number = Math.random): string {
  return `${Date.now().toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;
}

function isRoomMember(value: unknown): value is RoomMember {
  if (!value || typeof value !== 'object') return false;
  const member = value as Partial<RoomMember>;
  return (
    typeof member.id === 'string' &&
    typeof member.name === 'string' &&
    member.name.trim().length > 0 &&
    (member.role === 'host' || member.role === 'guest') &&
    typeof member.joinedAt === 'number'
  );
}

// Turns Realtime's presence state ({ key: [payload, ...] }) into one entry per
// phone: the host first, then guests in the order they joined.
export function membersFromPresence(state: Record<string, unknown[]>): RoomMember[] {
  const byId = new Map<string, RoomMember>();
  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      if (!isRoomMember(entry)) continue;
      const member: RoomMember = { id: entry.id, name: entry.name.trim(), role: entry.role, joinedAt: entry.joinedAt };
      if (typeof entry.avatar === 'string' && entry.avatar) member.avatar = entry.avatar;
      const existing = byId.get(member.id);
      if (!existing || member.joinedAt < existing.joinedAt) byId.set(member.id, member);
    }
  }
  return [...byId.values()].sort(
    (left, right) =>
      Number(right.role === 'host') - Number(left.role === 'host') || left.joinedAt - right.joinedAt,
  );
}

// True when someone else in the room already uses this name: the host, or a
// guest who joined earlier. The later joiner is the one asked to pick again.
export function isNameTaken(members: RoomMember[], me: RoomMember): boolean {
  const key = playerKey(me.name);
  return members.some(
    (member) =>
      member.id !== me.id &&
      playerKey(member.name) === key &&
      (member.role === 'host' || member.joinedAt < me.joinedAt || (member.joinedAt === me.joinedAt && member.id < me.id)),
  );
}

export function chaosEventById(id: ChaosEventId | null): ChaosEvent | null {
  return CHAOS_EVENTS.find((event) => event.id === id) ?? null;
}

export function missionFor(snapshot: RoomSnapshot, name: string): Player | null {
  const key = playerKey(name);
  return snapshot.players.find((player) => playerKey(player.name) === key) ?? null;
}

export function isReady(readyNames: string[], name: string): boolean {
  const key = playerKey(name);
  return readyNames.some((readyName) => playerKey(readyName) === key);
}

// Adds a guest's "got it" for the current round; ignores stale rounds and repeats.
export function addReady(
  current: { roundId: number; names: string[] },
  message: ReadyMessage,
): { roundId: number; names: string[] } {
  if (message.roundId < current.roundId) return current;
  const base = message.roundId > current.roundId ? { roundId: message.roundId, names: [] } : current;
  if (isReady(base.names, message.name)) return base;
  return { roundId: base.roundId, names: [...base.names, message.name] };
}

export function everyoneReady(players: Player[], readyNames: string[]): boolean {
  return players.length > 0 && players.every((player) => isReady(readyNames, player.name));
}

export function isReadyMessage(value: unknown): value is ReadyMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ReadyMessage>;
  return typeof message.roundId === 'number' && typeof message.name === 'string';
}

export function isCalloutMessage(value: unknown): value is CalloutMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<CalloutMessage>;
  return (
    typeof message.roundId === 'number' &&
    typeof message.accuser === 'string' &&
    typeof message.suspect === 'string' &&
    typeof message.guess === 'string'
  );
}

export function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<RoomSnapshot>;
  return (
    (snapshot.phase === 'lobby' ||
      snapshot.phase === 'missions' ||
      snapshot.phase === 'playing' ||
      snapshot.phase === 'reveal') &&
    typeof snapshot.roundId === 'number' &&
    Array.isArray(snapshot.players) &&
    Array.isArray(snapshot.readyNames) &&
    Array.isArray(snapshot.scores)
  );
}

function normalizePlayer(value: Partial<Player>): Player {
  return {
    name: String(value.name ?? ''),
    avatar: String(value.avatar ?? '😎'),
    mission: String(value.mission ?? ''),
    missionId: String(value.missionId ?? ''),
    target: String(value.target ?? ''),
    difficulty: value.difficulty === 'easy' || value.difficulty === 'hard' ? value.difficulty : 'medium',
    kind: value.kind === 'say' || value.kind === 'react' ? value.kind : 'do',
    role: value.role === 'double-agent' ? 'double-agent' : 'agent',
    completed: typeof value.completed === 'boolean' ? value.completed : null,
  };
}

// Fills in fields an older host version doesn't send, so guests never crash on them.
export function normalizeSnapshot(value: unknown): RoomSnapshot | null {
  if (!isRoomSnapshot(value)) return null;
  const raw = value as Partial<RoomSnapshot> & Pick<RoomSnapshot, 'phase' | 'roundId' | 'players' | 'readyNames' | 'scores'>;
  return {
    ...raw,
    mode: raw.mode ?? 'classic',
    durationSeconds: raw.durationSeconds ?? 300,
    chaosEventId: raw.chaosEventId ?? null,
    remainingMs: raw.remainingMs ?? null,
    revealReady: raw.revealReady ?? false,
    roundsPlayed: raw.roundsPlayed ?? 0,
    players: raw.players.map(normalizePlayer),
    callouts: Array.isArray(raw.callouts) ? raw.callouts : [],
    bountyName: raw.bountyName ?? null,
    swapPair: Array.isArray(raw.swapPair) && raw.swapPair.length === 2 ? raw.swapPair : null,
    swapped: raw.swapped ?? false,
    creativeName: raw.creativeName ?? null,
    deniedNames: Array.isArray(raw.deniedNames) ? raw.deniedNames : [],
  };
}

export function outcomeFromSnapshot(snapshot: RoomSnapshot): RoundOutcome {
  return {
    mode: snapshot.mode,
    event: chaosEventById(snapshot.chaosEventId),
    bountyName: snapshot.bountyName,
    callouts: snapshot.callouts,
    creativeName: snapshot.creativeName,
  };
}
