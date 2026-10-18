// On-device persistence (AsyncStorage): lifetime stats and badges, the setup
// the group last used, and the last private room joined (so a dropped phone
// can rejoin the same seat). Nothing here leaves the device.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_PACKS, EMPTY_MISSION_EDITS, MAX_CUSTOM_MISSIONS, PACK_OPTIONS, cleanCustomMission } from './gameLogic';
import type { Difficulty, DifficultySetting, Lifetime, MissionEdits, MissionTemplate, PackId } from './gameLogic';

const KEYS = {
  lifetime: 'lowkey.lifetime.v1',
  setup: 'lowkey.setup.v1',
  lastRoom: 'lowkey.lastRoom.v1',
  sound: 'lowkey.sound.v1',
  library: 'lowkey.library.v1',
};

// A saved seat is only offered for a few hours; after that the room is long gone.
const LAST_ROOM_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type SetupPreferences = {
  packs: PackId[];
  difficulty: DifficultySetting;
  doubleAgent: boolean;
  customMissions: string[];
};

export type LastRoom = { code: string; name: string; memberId: string; avatar: string; savedAt: number };

export const DEFAULT_SETUP: SetupPreferences = {
  packs: DEFAULT_PACKS,
  difficulty: 'mixed',
  doubleAgent: false,
  customMissions: [],
};

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the game still works, it just won't remember.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function loadLifetime(): Promise<Lifetime> {
  const value = await readJson(KEYS.lifetime);
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, stats]) => isRecord(stats) && typeof stats.name === 'string'),
  ) as Lifetime;
}

// Updates go through one queue so two quick saves can't overwrite each other.
let lifetimeQueue: Promise<unknown> = Promise.resolve();

export function updateLifetime(change: (current: Lifetime) => Lifetime): Promise<{ before: Lifetime; after: Lifetime }> {
  const next = lifetimeQueue.then(async () => {
    const before = await loadLifetime();
    const after = change(before);
    if (after !== before) await writeJson(KEYS.lifetime, after);
    return { before, after };
  });
  lifetimeQueue = next.catch(() => undefined);
  return next;
}

export async function clearLifetime() {
  await updateLifetime(() => ({}));
}

export async function loadSetup(): Promise<SetupPreferences> {
  const value = await readJson(KEYS.setup);
  if (!isRecord(value)) return DEFAULT_SETUP;
  const packIds = PACK_OPTIONS.map((pack) => pack.id);
  const packs = Array.isArray(value.packs) ? value.packs.filter((pack): pack is PackId => packIds.includes(pack)) : [];
  const difficulty = ['mixed', 'easy', 'medium', 'hard'].includes(value.difficulty as string)
    ? (value.difficulty as DifficultySetting)
    : 'mixed';
  const customMissions = Array.isArray(value.customMissions)
    ? value.customMissions
        .filter((mission): mission is string => typeof mission === 'string')
        .map(cleanCustomMission)
        .filter(Boolean)
        .slice(0, MAX_CUSTOM_MISSIONS)
    : [];
  return { packs: packs.length ? packs : DEFAULT_PACKS, difficulty, doubleAgent: value.doubleAgent === true, customMissions };
}

export function saveSetup(setup: SetupPreferences) {
  void writeJson(KEYS.setup, setup);
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const isDifficulty = (value: unknown): value is Difficulty => DIFFICULTIES.includes(value as Difficulty);

export async function loadMissionEdits(): Promise<MissionEdits> {
  const value = await readJson(KEYS.library);
  if (!isRecord(value)) return EMPTY_MISSION_EDITS;
  const packIds = PACK_OPTIONS.map((pack) => pack.id);
  const removed = Array.isArray(value.removed) ? value.removed.filter((id): id is string => typeof id === 'string') : [];
  const edited = isRecord(value.edited)
    ? Object.fromEntries(
        Object.entries(value.edited).filter(
          (entry): entry is [string, { text: string; difficulty: Difficulty }] =>
            isRecord(entry[1]) && typeof entry[1].text === 'string' && isDifficulty(entry[1].difficulty),
        ),
      )
    : {};
  const added = Array.isArray(value.added)
    ? value.added.filter(
        (own): own is MissionTemplate =>
          isRecord(own) &&
          typeof own.id === 'string' &&
          typeof own.text === 'string' &&
          packIds.includes(own.pack as PackId) &&
          isDifficulty(own.difficulty),
      )
    : [];
  return { removed, edited, added: added.map((own) => ({ ...own, kind: own.kind ?? 'do' })) };
}

export function saveMissionEdits(edits: MissionEdits) {
  void writeJson(KEYS.library, edits);
}

// Sound is on unless the player turned it off.
export async function loadSoundEnabled(): Promise<boolean> {
  return (await readJson(KEYS.sound)) !== false;
}

export function saveSoundEnabled(enabled: boolean) {
  void writeJson(KEYS.sound, enabled);
}

export async function loadLastRoom(): Promise<LastRoom | null> {
  const value = await readJson(KEYS.lastRoom);
  if (!isRecord(value)) return null;
  const { code, name, memberId, avatar, savedAt } = value;
  if (typeof code !== 'string' || typeof name !== 'string' || typeof memberId !== 'string' || typeof savedAt !== 'number') {
    return null;
  }
  if (Date.now() - savedAt > LAST_ROOM_MAX_AGE_MS) return null;
  return { code, name, memberId, avatar: typeof avatar === 'string' ? avatar : '', savedAt };
}

export function saveLastRoom(room: LastRoom | null) {
  if (room) void writeJson(KEYS.lastRoom, room);
  else void AsyncStorage.removeItem(KEYS.lastRoom).catch(() => undefined);
}
