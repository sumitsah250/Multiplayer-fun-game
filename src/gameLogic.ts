// Pure game rules for LOWKEY. Nothing in this file may import React Native,
// so it can be unit tested with `npm test` (Node's built-in test runner).

export type GameMode = 'classic' | 'chaos' | 'sudden-death';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type DifficultySetting = 'mixed' | Difficulty;
// What the mission asks for. Used to pick a hint that fits.
export type MissionKind = 'say' | 'do' | 'react';
export type PackId = 'everyday' | 'house-party' | 'dinner' | 'road-trip' | 'office';
export type PlayerRole = 'agent' | 'double-agent';
export type ChaosEventId =
  | 'double-down'
  | 'one-word'
  | 'silent-start'
  | 'swap'
  | 'whisper'
  | 'accent'
  | 'bounty'
  | 'reverse';
export type ChaosEvent = {
  id: ChaosEventId;
  name: string;
  instruction: string;
  detail: string;
  // Rules that only apply at the start of the round (e.g. silent start).
  activeSeconds?: number;
  activeText?: string;
  afterText?: string;
};
export type MissionTemplate = {
  id: string;
  pack: PackId;
  difficulty: Difficulty;
  kind: MissionKind;
  // `{t}` is replaced by the target's name.
  text: string;
};
export type Player = {
  name: string;
  avatar: string;
  mission: string;
  missionId: string;
  // The player this mission is aimed at (for a double agent: the player to sabotage).
  target: string;
  difficulty: Difficulty;
  kind: MissionKind;
  role: PlayerRole;
  completed: boolean | null;
};
// One "call it out" during a round: `accuser` claims `suspect` was targeting
// them with the mission `guess`.
export type Callout = {
  accuser: string;
  suspect: string;
  guess: string;
  correct: boolean;
};
export type RoundOutcome = {
  mode: GameMode;
  event: ChaosEvent | null;
  bountyName: string | null;
  callouts: Callout[];
  creativeName: string | null;
};
export type PlayerStats = {
  score: number;
  wins: number;
  streak: number;
  bestStreak: number;
  chaosWins: number;
  suddenDeathWins: number;
  hardWins: number;
  doubleAgentWins: number;
  callsRight: number;
  callsWrong: number;
  timesCaught: number;
  creative: number;
};
export type PlayerRoundResult = {
  name: string;
  avatar: string;
  mission: string;
  difficulty: Difficulty;
  role: PlayerRole;
  completed: boolean;
  caught: boolean;
  callsRight: number;
  callsWrong: number;
  creative: boolean;
  points: number;
};
export type RoundRecord = {
  round: number;
  mode: GameMode;
  eventName: string | null;
  completedNames: string[];
  failedNames: string[];
  caughtNames: string[];
  results: PlayerRoundResult[];
};
export type DealOptions = {
  packs: PackId[];
  difficulty: DifficultySetting;
  customMissions: string[];
  doubleAgent: boolean;
  // Chosen avatars by playerKey; players without one get a default.
  avatars?: Record<string, string>;
};
export type DealtRound = {
  players: Player[];
  event: ChaosEvent | null;
  bountyName: string | null;
  swapPair: [string, string] | null;
};

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS_FOR_DOUBLE_AGENT = 4;
export const MAX_CUSTOM_MISSIONS = 20;

export const DIFFICULTY_POINTS: Record<Difficulty, number> = { easy: 500, medium: 1000, hard: 2000 };
export const DOUBLE_AGENT_POINTS = 1000;
export const CALLOUT_REWARD = 500;
export const CALLOUT_PENALTY = 250;
export const CREATIVE_BONUS = 500;
// Hints (and the Swap chaos event) open up halfway through the round.
export const HALFWAY_FRACTION = 0.5;

export const DIFFICULTY_OPTIONS: { id: DifficultySetting; label: string }[] = [
  { id: 'mixed', label: 'MIX' },
  { id: 'easy', label: 'EASY' },
  { id: 'medium', label: 'MEDIUM' },
  { id: 'hard', label: 'HARD' },
];

export const PACK_OPTIONS: { id: PackId; title: string; emoji: string }[] = [
  { id: 'everyday', title: 'EVERYDAY', emoji: '✌️' },
  { id: 'house-party', title: 'HOUSE PARTY', emoji: '🪩' },
  { id: 'dinner', title: 'DINNER', emoji: '🍝' },
  { id: 'road-trip', title: 'ROAD TRIP', emoji: '🚗' },
  { id: 'office', title: 'OFFICE · SFW', emoji: '💼' },
];
export const DEFAULT_PACKS: PackId[] = ['everyday', 'house-party'];

type MissionRow = [Difficulty, MissionKind, string];

const PACK_MISSIONS: Record<PackId, MissionRow[]> = {
  everyday: [
    ['easy', 'say', 'Get {t} to say “pizza.”'],
    ['easy', 'say', 'Get {t} to say “what?”'],
    ['easy', 'say', 'Get {t} to say “bro.”'],
    ['easy', 'say', 'Get {t} to say your name.'],
    ['easy', 'say', 'Get {t} to say “literally.”'],
    ['easy', 'say', 'Get {t} to say a number bigger than 100.'],
    ['easy', 'do', 'Get {t} to high-five you.'],
    ['easy', 'do', 'Get {t} to give you a fist bump.'],
    ['easy', 'do', 'Get {t} to look at the ceiling.'],
    ['easy', 'do', 'Make {t} look at their phone.'],
    ['easy', 'do', 'Get {t} to drink some water.'],
    ['easy', 'do', 'Convince {t} to stand up.'],
    ['easy', 'react', 'Make {t} laugh.'],
    ['easy', 'react', 'Make {t} roll their eyes.'],
    ['medium', 'say', 'Get {t} to ask you “why?”'],
    ['medium', 'say', 'Get {t} to repeat something you said.'],
    ['medium', 'say', 'Get {t} to compliment your shoes.'],
    ['medium', 'say', 'Get {t} to tell you what time it is.'],
    ['medium', 'say', 'Get {t} to name their favorite movie.'],
    ['medium', 'do', 'Get {t} to take a selfie with you.'],
    ['medium', 'do', 'Get {t} to sing a few words.'],
    ['medium', 'do', 'Get {t} to hum a song.'],
    ['hard', 'say', 'Get {t} to tell a story about their childhood.'],
    ['hard', 'say', 'Get {t} to agree with something obviously wrong.'],
    ['hard', 'say', 'Get {t} to say “I’m proud of you.”'],
    ['hard', 'do', 'Get {t} to do an impression of someone.'],
    ['hard', 'do', 'Get {t} to swap seats with you.'],
  ],
  'house-party': [
    ['easy', 'say', 'Get {t} to say “let’s go!”'],
    ['easy', 'say', 'Get {t} to say “vibe.”'],
    ['easy', 'do', 'Get {t} to grab a snack.'],
    ['easy', 'do', 'Get {t} to clink drinks with you.'],
    ['easy', 'do', 'Make {t} clap.'],
    ['medium', 'say', 'Get {t} to ask what song is playing.'],
    ['medium', 'say', 'Get {t} to tell you who the best dancer here is.'],
    ['medium', 'do', 'Get {t} to dance for a few seconds.'],
    ['medium', 'do', 'Get {t} to take a group photo.'],
    ['medium', 'do', 'Get {t} to introduce you to someone.'],
    ['medium', 'react', 'Make {t} shout “no way!”'],
    ['hard', 'say', 'Get {t} to say “this is my song.”'],
    ['hard', 'do', 'Get {t} to do a dance move you name.'],
    ['hard', 'do', 'Get {t} to sing the chorus of any song.'],
    ['hard', 'do', 'Get {t} to play air guitar.'],
    ['hard', 'do', 'Get {t} to lip-sync a line from a song.'],
  ],
  dinner: [
    ['easy', 'say', 'Get {t} to say “delicious.”'],
    ['easy', 'say', 'Get {t} to tell you their favorite food.'],
    ['easy', 'say', 'Get {t} to talk about dessert.'],
    ['easy', 'do', 'Get {t} to pass you the salt (or any condiment).'],
    ['easy', 'do', 'Make {t} wipe their mouth with a napkin.'],
    ['medium', 'say', 'Get {t} to say “I’m full.”'],
    ['medium', 'say', 'Get {t} to recommend a restaurant.'],
    ['medium', 'say', 'Get {t} to rate the food out of 10.'],
    ['medium', 'say', 'Get {t} to describe the worst meal they’ve ever had.'],
    ['medium', 'do', 'Get {t} to offer you some of their food.'],
    ['medium', 'do', 'Get {t} to try something off your plate.'],
    ['medium', 'do', 'Get {t} to refill your glass.'],
    ['hard', 'say', 'Get {t} to say “chef’s kiss.”'],
    ['hard', 'say', 'Get {t} to say “bon appétit.”'],
    ['hard', 'say', 'Get {t} to use a fancy food word like “umami.”'],
    ['hard', 'do', 'Get {t} to make a toast.'],
  ],
  'road-trip': [
    ['easy', 'say', 'Get {t} to say “look!”'],
    ['easy', 'say', 'Get {t} to name a city.'],
    ['easy', 'say', 'Get {t} to tell you where they’d go on vacation.'],
    ['easy', 'do', 'Get {t} to point at something outside.'],
    ['easy', 'do', 'Get {t} to check the map or the arrival time.'],
    ['medium', 'say', 'Get {t} to read a sign out loud.'],
    ['medium', 'say', 'Get {t} to suggest a snack stop.'],
    ['medium', 'say', 'Get {t} to say “road trip!”'],
    ['medium', 'do', 'Get {t} to pick the next song.'],
    ['medium', 'do', 'Get {t} to sing along to the music.'],
    ['hard', 'say', 'Get {t} to say “are we there yet?”'],
    ['hard', 'say', 'Get {t} to count something out loud.'],
    ['hard', 'do', 'Get {t} to start a car game.'],
    ['hard', 'react', 'Make {t} yawn.'],
  ],
  office: [
    ['easy', 'say', 'Get {t} to ask you about your weekend.'],
    ['easy', 'say', 'Get {t} to say “sounds good.”'],
    ['easy', 'say', 'Get {t} to talk about lunch.'],
    ['easy', 'do', 'Get {t} to check their calendar.'],
    ['easy', 'do', 'Get {t} to give you a thumbs-up.'],
    ['easy', 'do', 'Get {t} to lend you a pen.'],
    ['medium', 'say', 'Get {t} to say “quick question.”'],
    ['medium', 'do', 'Get {t} to offer you a coffee.'],
    ['medium', 'do', 'Get {t} to stretch.'],
    ['hard', 'say', 'Get {t} to say “synergy.”'],
    ['hard', 'say', 'Get {t} to say “circle back.”'],
    ['hard', 'say', 'Get {t} to say “per my last email.”'],
    ['hard', 'say', 'Get {t} to say “let’s take this offline.”'],
    ['hard', 'say', 'Get {t} to use a sports metaphor.'],
  ],
};

export const MISSION_TEMPLATES: MissionTemplate[] = (Object.keys(PACK_MISSIONS) as PackId[]).flatMap((pack) =>
  PACK_MISSIONS[pack].map(([difficulty, kind, text], index) => ({
    id: `${pack}-${index + 1}`,
    pack,
    difficulty,
    kind,
    text,
  })),
);

export const PLAYER_AVATARS = ['😎', '🦊', '🐸', '🐼', '🐙', '🐥', '🦄', '🦖', '🐝', '🐧'];

export const CHAOS_EVENTS: ChaosEvent[] = [
  {
    id: 'double-down',
    name: 'DOUBLE DOWN',
    instruction: 'Every completed mission is worth double this round.',
    detail: 'Only the points change. Your secret mission stays the same.',
  },
  {
    id: 'one-word',
    name: 'ONE-WORD ONLY',
    instruction: 'For the first 30 seconds, every spoken answer must be one word.',
    detail: 'After 30 seconds, talk normally. Your secret mission stays the same.',
    activeSeconds: 30,
    activeText: 'One-word answers only',
    afterText: 'The one-word rule is over. Talk normally.',
  },
  {
    id: 'silent-start',
    name: 'SILENT START',
    instruction: 'No talking for the first 15 seconds. Gestures are fair game.',
    detail: 'After 15 seconds, conversation is back. Your mission stays the same.',
    activeSeconds: 15,
    activeText: 'No talking. Gestures are fair game',
    afterText: 'Silent start is over. Conversation is back.',
  },
  {
    id: 'whisper',
    name: 'WHISPER ONLY',
    instruction: 'For the first 60 seconds, everyone can only whisper.',
    detail: 'After a minute, normal volume is back. Your mission stays the same.',
    activeSeconds: 60,
    activeText: 'Whispers only',
    afterText: 'Whisper rule is over. Volume is back.',
  },
  {
    id: 'accent',
    name: 'ACCENT ROUND',
    instruction: 'For the first 60 seconds, everyone talks in an accent of their choice.',
    detail: 'Commit to it. After a minute you can talk normally.',
    activeSeconds: 60,
    activeText: 'Accents on',
    afterText: 'Accents are optional now. (Keep going if you dare.)',
  },
  {
    id: 'swap',
    name: 'SWAP',
    instruction: 'Halfway through, two players secretly trade missions.',
    detail: 'The phone tells the two swappers when it happens. Everyone else: watch closely.',
  },
  {
    id: 'bounty',
    name: 'BOUNTY',
    instruction: 'One player’s mission is worth triple. Everyone knows who.',
    detail: 'Keep an eye on the bounty, and use call-outs to stop them.',
  },
  {
    id: 'reverse',
    name: 'REVERSE',
    instruction: 'Missions are flipped: tempt your target toward it, but they must NOT do it.',
    detail: 'Bring it up at least twice. You win if your target resists all round.',
  },
];

export const MODE_OPTIONS: { id: GameMode; title: string; description: string; emoji: string }[] = [
  { id: 'classic', title: 'CLASSIC', description: 'Silly missions. 3, 5, or 10 minutes.', emoji: '🎯' },
  { id: 'chaos', title: 'CHAOS', description: 'A surprise rule changes every round.', emoji: '🌀' },
  { id: 'sudden-death', title: 'SUDDEN DEATH', description: '60 seconds. Points × 1.5. Make it count.', emoji: '⏱️' },
];

const HINTS: Record<MissionKind | 'double-agent', string[]> = {
  say: [
    'Ask a question where the only good answer is your word.',
    'Tell a story with a blank in it and let them fill it in.',
    'Pretend you forgot the word and make them say it for you.',
    'Start a quick “name a…” game where your word fits perfectly.',
  ],
  do: [
    'Do it first yourself. People copy without thinking.',
    'Make it a favor: “Can you quickly…?” works more than you’d think.',
    'Turn it into a dare or a tiny bet.',
    'Blame it on something else: a photo, a test, a “weird thing I read.”',
  ],
  react: [
    'Timing beats effort. Wait for a quiet moment.',
    'Get someone else to help without telling them why.',
    'Tell a story about something that happened “today.”',
  ],
  'double-agent': [
    'Interrupt at the right moment. Change the subject.',
    'Get your target talking about something completely different.',
    'Act like you’re helping them. Then steer them wrong.',
  ],
};

const REVERSE_NOTE = '🔄 REVERSED: tempt them toward it at least twice. You win only if they DON’T do it.';

export function randomItem<T>(items: readonly T[], random: () => number = Math.random): T {
  return items[Math.floor(random() * items.length)];
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function playerKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function sameName(left: string, right: string): boolean {
  return playerKey(left) === playerKey(right);
}

export function checkPlayerNames(names: string[]) {
  const validNames = names.map((name) => name.trim()).filter(Boolean);
  const hasDuplicateNames = new Set(validNames.map(playerKey)).size !== validNames.length;
  const canStart =
    validNames.length >= MIN_PLAYERS && validNames.length <= MAX_PLAYERS && !hasDuplicateNames;
  return { validNames, hasDuplicateNames, canStart };
}

export function renderMission(text: string, target: string): string {
  return text.split('{t}').join(target);
}

// House missions use `@` for the target. Without one, the target goes in front.
export function renderCustomMission(text: string, target: string): string {
  const clean = text.trim();
  return clean.includes('@') ? clean.split('@').join(target) : `${target}: ${clean}`;
}

export function cleanCustomMission(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function doubleAgentMission(target: string): string {
  return `🕵️ DOUBLE AGENT: secretly stop ${target} from completing their mission. Don’t get caught.`;
}

// A random arrangement where nobody targets themselves, so every player is
// hunted by exactly one other player.
function derangement(count: number, random: () => number): number[] {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const order = shuffle([...Array(count).keys()], random);
    if (order.every((target, index) => target !== index)) return order;
  }
  // Fallback that is always valid: everyone targets the next player.
  return [...Array(count).keys()].map((index) => (index + 1) % count);
}

// Missions at the chosen difficulty from the chosen packs come first; `extra`
// tops up the deal when a small pack can't cover every player.
function missionPool(options: DealOptions): { primary: MissionTemplate[]; extra: MissionTemplate[] } {
  const packs = options.packs.length ? options.packs : DEFAULT_PACKS;
  const inPacks = MISSION_TEMPLATES.filter((template) => packs.includes(template.pack));
  const primary =
    options.difficulty === 'mixed' ? inPacks : inPacks.filter((template) => template.difficulty === options.difficulty);
  const extra = [
    ...inPacks.filter((template) => !primary.includes(template)),
    ...MISSION_TEMPLATES.filter((template) => !inPacks.includes(template)),
  ];
  return { primary, extra };
}

export const DEFAULT_DEAL_OPTIONS: DealOptions = {
  packs: DEFAULT_PACKS,
  difficulty: 'mixed',
  customMissions: [],
  doubleAgent: false,
};

export function makeMissions(
  names: string[],
  options: DealOptions = DEFAULT_DEAL_OPTIONS,
  random: () => number = Math.random,
): Player[] {
  const targets = derangement(names.length, random);
  const doubleAgentIndex =
    options.doubleAgent && names.length >= MIN_PLAYERS_FOR_DOUBLE_AGENT ? Math.floor(random() * names.length) : -1;
  const agentCount = names.length - (doubleAgentIndex >= 0 ? 1 : 0);

  const { primary, extra } = missionPool(options);
  const ordered = [...shuffle(primary, random), ...shuffle(extra, random)];
  const customs = shuffle(
    options.customMissions.map(cleanCustomMission).filter(Boolean),
    random,
  ).slice(0, agentCount);
  type Slot = { custom: string } | { template: MissionTemplate };
  const slots: Slot[] = shuffle(
    [
      ...customs.map((custom) => ({ custom })),
      ...ordered.slice(0, agentCount - customs.length).map((template) => ({ template })),
    ],
    random,
  );

  let slotIndex = 0;
  return names.map((name, index) => {
    const target = names[targets[index]];
    const avatar = options.avatars?.[playerKey(name)] ?? PLAYER_AVATARS[index % PLAYER_AVATARS.length];
    if (index === doubleAgentIndex) {
      return {
        name,
        avatar,
        mission: doubleAgentMission(target),
        missionId: 'double-agent',
        target,
        difficulty: 'medium',
        kind: 'do',
        role: 'double-agent',
        completed: null,
      } satisfies Player;
    }
    const slot = slots[slotIndex];
    slotIndex += 1;
    if ('custom' in slot) {
      return {
        name,
        avatar,
        mission: renderCustomMission(slot.custom, target),
        missionId: `custom-${playerKey(slot.custom)}`,
        target,
        difficulty: 'medium',
        kind: 'do',
        role: 'agent',
        completed: null,
      } satisfies Player;
    }
    return {
      name,
      avatar,
      mission: renderMission(slot.template.text, target),
      missionId: slot.template.id,
      target,
      difficulty: slot.template.difficulty,
      kind: slot.template.kind,
      role: 'agent',
      completed: null,
    } satisfies Player;
  });
}

// Two regular agents who can trade missions without either ending up targeting themselves.
export function pickSwapPair(players: Player[], random: () => number = Math.random): [string, string] | null {
  const agents = players.filter((player) => player.role === 'agent');
  const pairs: [string, string][] = [];
  for (let left = 0; left < agents.length; left += 1) {
    for (let right = left + 1; right < agents.length; right += 1) {
      const a = agents[left];
      const b = agents[right];
      if (!sameName(a.target, b.name) && !sameName(b.target, a.name)) pairs.push([a.name, b.name]);
    }
  }
  return pairs.length ? randomItem(pairs, random) : null;
}

export function applySwap(players: Player[], pair: [string, string]): Player[] {
  const first = players.find((player) => sameName(player.name, pair[0]));
  const second = players.find((player) => sameName(player.name, pair[1]));
  if (!first || !second) return players;
  const missionOf = ({ mission, missionId, target, difficulty, kind }: Player) => ({
    mission,
    missionId,
    target,
    difficulty,
    kind,
  });
  return players.map((player) =>
    player === first ? { ...player, ...missionOf(second) } : player === second ? { ...player, ...missionOf(first) } : player,
  );
}

export function dealRound(
  names: string[],
  mode: GameMode,
  options: DealOptions = DEFAULT_DEAL_OPTIONS,
  random: () => number = Math.random,
): DealtRound {
  const players = makeMissions(names, options, random);
  if (mode !== 'chaos') return { players, event: null, bountyName: null, swapPair: null };
  const swapPair = pickSwapPair(players, random);
  const events = CHAOS_EVENTS.filter((event) => event.id !== 'swap' || swapPair);
  const event = randomItem(events, random);
  const agents = players.filter((player) => player.role === 'agent');
  return {
    players,
    event,
    bountyName: event.id === 'bounty' ? randomItem(agents, random).name : null,
    swapPair: event.id === 'swap' ? swapPair : null,
  };
}

export function hintFor(player: Player): string {
  const hints = HINTS[player.role === 'double-agent' ? 'double-agent' : player.kind];
  let hash = 0;
  for (const character of player.missionId + player.name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hints[hash % hints.length];
}

export function missionNote(player: Player, event: ChaosEvent | null): string | null {
  if (event?.id === 'reverse' && player.role === 'agent') return REVERSE_NOTE;
  return null;
}

export function canCallOut(callouts: Callout[], name: string): boolean {
  return !callouts.some((callout) => sameName(callout.accuser, name));
}

export function isCaught(callouts: Callout[], name: string): boolean {
  return callouts.some((callout) => callout.correct && sameName(callout.suspect, name));
}

// Four choices for "what were they trying to make you do?". The real mission is
// one of them only when the suspect really was targeting the accuser.
export function calloutOptions(
  players: Player[],
  accuser: string,
  suspect: string,
  random: () => number = Math.random,
): string[] {
  const suspectPlayer = players.find((player) => sameName(player.name, suspect));
  const real = suspectPlayer && sameName(suspectPlayer.target, accuser) ? suspectPlayer.mission : null;
  const takenMissions = new Set(players.map((player) => player.mission));
  const decoys = shuffle(
    MISSION_TEMPLATES.map((template) => renderMission(template.text, accuser)).filter(
      (text) => !takenMissions.has(text),
    ),
    random,
  );
  const options = decoys.slice(0, real ? 3 : 4);
  // With a double agent in play, their kind of mission is always among the choices,
  // so its presence gives nothing away.
  const doubleAgentText = doubleAgentMission(accuser);
  if (players.some((player) => player.role === 'double-agent') && real !== doubleAgentText) {
    options[0] = doubleAgentText;
  }
  if (real) options.push(real);
  return shuffle(options, random);
}

// Checks a call-out against the round. Returns null if it isn't allowed: the
// accuser already called someone out, the suspect is already caught, or a name
// doesn't belong to the round.
export function resolveCallout(
  players: Player[],
  callouts: Callout[],
  accuser: string,
  suspect: string,
  guess: string,
): Callout | null {
  const accuserPlayer = players.find((player) => sameName(player.name, accuser));
  const suspectPlayer = players.find((player) => sameName(player.name, suspect));
  if (!accuserPlayer || !suspectPlayer || accuserPlayer === suspectPlayer) return null;
  if (!canCallOut(callouts, accuser) || isCaught(callouts, suspect)) return null;
  const correct = sameName(suspectPlayer.target, accuser) && suspectPlayer.mission === guess;
  return { accuser: accuserPlayer.name, suspect: suspectPlayer.name, guess, correct };
}

// Fills in outcomes the group doesn't vote on: caught players fail, and a
// double agent succeeds exactly when their target's mission failed.
export function resolvePlayers(players: Player[], callouts: Callout[]): Player[] {
  const agents = players.map((player) =>
    isCaught(callouts, player.name) ? { ...player, completed: false } : player,
  );
  return agents.map((player) => {
    if (player.role !== 'double-agent' || player.completed === false) return player;
    const target = agents.find((other) => sameName(other.name, player.target));
    if (!target || target.completed === null) return { ...player, completed: null };
    return { ...player, completed: !target.completed };
  });
}

// True when the group decides this player's outcome by voting.
export function needsVote(player: Player, callouts: Callout[]): boolean {
  return player.role === 'agent' && !isCaught(callouts, player.name);
}

export function missionPoints(player: Player, outcome: Pick<RoundOutcome, 'mode' | 'event' | 'bountyName'>): number {
  const base = player.role === 'double-agent' ? DOUBLE_AGENT_POINTS : DIFFICULTY_POINTS[player.difficulty];
  let multiplier = 1;
  if (outcome.mode === 'sudden-death') multiplier *= 1.5;
  if (outcome.mode === 'chaos' && outcome.event?.id === 'double-down') multiplier *= 2;
  if (outcome.mode === 'chaos' && outcome.event?.id === 'bounty' && outcome.bountyName && sameName(outcome.bountyName, player.name)) {
    multiplier *= 3;
  }
  return Math.round(base * multiplier);
}

export function calloutPoints(callouts: Callout[], name: string): { right: number; wrong: number; points: number } {
  const own = callouts.filter((callout) => sameName(callout.accuser, name));
  const right = own.filter((callout) => callout.correct).length;
  const wrong = own.length - right;
  return { right, wrong, points: right * CALLOUT_REWARD - wrong * CALLOUT_PENALTY };
}

// Everything one player earned this round. `player` should already be resolved.
export function playerRoundPoints(player: Player, outcome: RoundOutcome) {
  const mission = player.completed ? missionPoints(player, outcome) : 0;
  const calls = calloutPoints(outcome.callouts, player.name);
  const creative =
    player.completed && outcome.creativeName && sameName(outcome.creativeName, player.name) ? CREATIVE_BONUS : 0;
  return { mission, callouts: calls.points, creative, total: mission + calls.points + creative };
}

export function emptyStats(): PlayerStats {
  return {
    score: 0,
    wins: 0,
    streak: 0,
    bestStreak: 0,
    chaosWins: 0,
    suddenDeathWins: 0,
    hardWins: 0,
    doubleAgentWins: 0,
    callsRight: 0,
    callsWrong: 0,
    timesCaught: 0,
    creative: 0,
  };
}

export function emptySessionStats(names: string[]): Record<string, PlayerStats> {
  return Object.fromEntries(names.map((name) => [playerKey(name), emptyStats()]));
}

// Returns new session stats with one scored round applied. Does not mutate `stats`.
export function scoreRound(
  stats: Record<string, PlayerStats>,
  players: Player[],
  outcome: RoundOutcome,
): Record<string, PlayerStats> {
  const updatedStats = { ...stats };
  for (const player of resolvePlayers(players, outcome.callouts)) {
    const key = playerKey(player.name);
    const previous = updatedStats[key] ?? emptyStats();
    const completed = player.completed === true;
    const streak = completed ? previous.streak + 1 : 0;
    const points = playerRoundPoints(player, outcome);
    const calls = calloutPoints(outcome.callouts, player.name);
    updatedStats[key] = {
      score: Math.max(0, previous.score + points.total),
      wins: previous.wins + (completed ? 1 : 0),
      streak,
      bestStreak: Math.max(previous.bestStreak, streak),
      chaosWins: previous.chaosWins + (completed && outcome.mode === 'chaos' ? 1 : 0),
      suddenDeathWins: previous.suddenDeathWins + (completed && outcome.mode === 'sudden-death' ? 1 : 0),
      hardWins: previous.hardWins + (completed && player.role === 'agent' && player.difficulty === 'hard' ? 1 : 0),
      doubleAgentWins: previous.doubleAgentWins + (completed && player.role === 'double-agent' ? 1 : 0),
      callsRight: previous.callsRight + calls.right,
      callsWrong: previous.callsWrong + calls.wrong,
      timesCaught: previous.timesCaught + (isCaught(outcome.callouts, player.name) ? 1 : 0),
      creative: previous.creative + (points.creative > 0 ? 1 : 0),
    };
  }
  return updatedStats;
}

export function makeRoundRecord(round: number, players: Player[], outcome: RoundOutcome): RoundRecord {
  const resolved = resolvePlayers(players, outcome.callouts);
  const results = resolved.map((player) => {
    const calls = calloutPoints(outcome.callouts, player.name);
    const points = playerRoundPoints(player, outcome);
    return {
      name: player.name,
      avatar: player.avatar,
      mission: player.mission,
      difficulty: player.difficulty,
      role: player.role,
      completed: player.completed === true,
      caught: isCaught(outcome.callouts, player.name),
      callsRight: calls.right,
      callsWrong: calls.wrong,
      creative: points.creative > 0,
      points: points.total,
    };
  });
  return {
    round,
    mode: outcome.mode,
    eventName: outcome.event?.name ?? null,
    completedNames: results.filter((result) => result.completed).map((result) => result.name),
    failedNames: results.filter((result) => !result.completed).map((result) => result.name),
    caughtNames: results.filter((result) => result.caught).map((result) => result.name),
    results,
  };
}

export function playerTitle(stats: PlayerStats, sessionLeader: boolean): string | null {
  if (!sessionLeader || stats.wins + stats.callsRight === 0) return null;
  if (stats.bestStreak >= 3) return 'PLOT ARMOR CHAMPION';
  if (stats.doubleAgentWins > 0) return 'MASTER OF DISGUISE';
  if (stats.callsRight >= 2) return 'HAWK EYE';
  if (stats.chaosWins >= 2) return 'CHAOS COORDINATOR';
  if (stats.suddenDeathWins > 0) return 'CERTIFIED LUCKY';
  return 'PROFESSIONAL MENACE';
}

export function roundDurationSeconds(mode: GameMode, minutes: number): number {
  return mode === 'sudden-death' ? 60 : minutes * 60;
}

// Derived from a wall-clock deadline so the countdown stays correct after the
// app has been backgrounded or the JS timers were paused.
export function secondsRemaining(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function isPastHalfway(elapsedSeconds: number, durationSeconds: number): boolean {
  return durationSeconds > 0 && elapsedSeconds >= durationSeconds * HALFWAY_FRACTION;
}

// Seconds left on a start-of-round chaos rule, or 0 once it's over.
export function chaosRuleSecondsLeft(event: ChaosEvent | null, elapsedSeconds: number): number {
  if (!event?.activeSeconds) return 0;
  return Math.max(0, event.activeSeconds - elapsedSeconds);
}

// ---- Lifetime progress (kept on the device across sessions) ----

export type LifetimeStats = {
  name: string;
  avatar: string | null;
  rounds: number;
  missions: number;
  hardMissions: number;
  points: number;
  timesCaught: number;
  callsRight: number;
  streak: number;
  bestStreak: number;
  chaosWins: number;
  doubleAgentWins: number;
  creative: number;
  missionsOfTheNight: number;
};
export type Lifetime = Record<string, LifetimeStats>;

export type Badge = {
  id: string;
  name: string;
  // Earning a badge unlocks this avatar.
  avatar: string;
  description: string;
  earned: (stats: LifetimeStats) => boolean;
};

export const BADGES: Badge[] = [
  { id: 'first-blood', name: 'FIRST BLOOD', avatar: '🎯', description: 'Complete your first mission.', earned: (s) => s.missions >= 1 },
  { id: 'smooth-operator', name: 'SMOOTH OPERATOR', avatar: '🥷', description: 'Complete 10 missions.', earned: (s) => s.missions >= 10 },
  { id: 'hawk-eye', name: 'HAWK EYE', avatar: '🦅', description: 'Win 3 call-outs.', earned: (s) => s.callsRight >= 3 },
  { id: 'plot-armor', name: 'PLOT ARMOR', avatar: '🛡️', description: 'Get a 3-mission streak.', earned: (s) => s.bestStreak >= 3 },
  { id: 'double-trouble', name: 'DOUBLE TROUBLE', avatar: '🃏', description: 'Win as the double agent.', earned: (s) => s.doubleAgentWins >= 1 },
  { id: 'high-roller', name: 'HIGH ROLLER', avatar: '💎', description: 'Complete 3 hard missions.', earned: (s) => s.hardMissions >= 3 },
  { id: 'chaos-gremlin', name: 'CHAOS GREMLIN', avatar: '🌪️', description: 'Win 5 Chaos rounds.', earned: (s) => s.chaosWins >= 5 },
  { id: 'artist', name: 'THE ARTIST', avatar: '🎨', description: 'Win “most creative” twice.', earned: (s) => s.creative >= 2 },
  { id: 'legend', name: 'LEGEND OF THE NIGHT', avatar: '👑', description: 'Win Mission of the Night.', earned: (s) => s.missionsOfTheNight >= 1 },
  { id: 'regular', name: 'THE REGULAR', avatar: '🛋️', description: 'Play 25 rounds.', earned: (s) => s.rounds >= 25 },
];

export function emptyLifetimeStats(name: string): LifetimeStats {
  return {
    name,
    avatar: null,
    rounds: 0,
    missions: 0,
    hardMissions: 0,
    points: 0,
    timesCaught: 0,
    callsRight: 0,
    streak: 0,
    bestStreak: 0,
    chaosWins: 0,
    doubleAgentWins: 0,
    creative: 0,
    missionsOfTheNight: 0,
  };
}

export function earnedBadges(stats: LifetimeStats | undefined): Badge[] {
  return stats ? BADGES.filter((badge) => badge.earned(stats)) : [];
}

export function unlockedAvatars(stats: LifetimeStats | undefined): string[] {
  return [...PLAYER_AVATARS, ...earnedBadges(stats).map((badge) => badge.avatar)];
}

// Adds one round to lifetime stats. With `onlyName`, only that player is
// updated (a guest phone records just its own player).
export function applyRoundToLifetime(lifetime: Lifetime, record: RoundRecord, onlyName?: string): Lifetime {
  const next = { ...lifetime };
  for (const result of record.results) {
    if (onlyName && !sameName(onlyName, result.name)) continue;
    const key = playerKey(result.name);
    const previous = next[key] ?? emptyLifetimeStats(result.name);
    const streak = result.completed ? previous.streak + 1 : 0;
    next[key] = {
      ...previous,
      name: result.name,
      rounds: previous.rounds + 1,
      missions: previous.missions + (result.completed ? 1 : 0),
      hardMissions:
        previous.hardMissions + (result.completed && result.role === 'agent' && result.difficulty === 'hard' ? 1 : 0),
      points: previous.points + Math.max(0, result.points),
      timesCaught: previous.timesCaught + (result.caught ? 1 : 0),
      callsRight: previous.callsRight + result.callsRight,
      streak,
      bestStreak: Math.max(previous.bestStreak, streak),
      chaosWins: previous.chaosWins + (result.completed && record.mode === 'chaos' ? 1 : 0),
      doubleAgentWins: previous.doubleAgentWins + (result.completed && result.role === 'double-agent' ? 1 : 0),
      creative: previous.creative + (result.creative ? 1 : 0),
    };
  }
  return next;
}

export function crownMissionOfTheNight(lifetime: Lifetime, name: string): Lifetime {
  const key = playerKey(name);
  const previous = lifetime[key] ?? emptyLifetimeStats(name);
  return { ...lifetime, [key]: { ...previous, missionsOfTheNight: previous.missionsOfTheNight + 1 } };
}

export function setLifetimeAvatar(lifetime: Lifetime, name: string, avatar: string): Lifetime {
  const key = playerKey(name);
  const previous = lifetime[key] ?? emptyLifetimeStats(name.trim());
  if (previous.avatar === avatar) return lifetime;
  return { ...lifetime, [key]: { ...previous, avatar } };
}

// Badges that `after` has and `before` didn't, per player.
export function newBadges(before: Lifetime, after: Lifetime): { name: string; badge: Badge }[] {
  return Object.entries(after).flatMap(([key, stats]) => {
    const had = new Set(earnedBadges(before[key]).map((badge) => badge.id));
    return earnedBadges(stats)
      .filter((badge) => !had.has(badge.id))
      .map((badge) => ({ name: stats.name, badge }));
  });
}

export function makeShareMessage(
  players: Player[],
  winners: Player[],
  mode: GameMode = 'classic',
  event: ChaosEvent | null = null,
  callouts: Callout[] = [],
): string {
  const allMissionsScored = players.every((player) => player.completed !== null);
  const headline = !allMissionsScored
    ? 'We played LOWKEY — here’s how the missions went!'
    : winners.length
    ? `${winners.map((player) => player.name).join(' & ')} won LOWKEY!`
    : 'We played LOWKEY — nobody completed a mission!';
  const missions = players
    .map((player) => {
      const status = isCaught(callouts, player.name)
        ? 'BUSTED'
        : player.completed === null
          ? 'unscored'
          : player.completed
            ? 'complete'
            : 'failed';
      return `${player.name}: ${player.mission} — ${status}`;
    })
    .join('\n');
  return `${headline}\nMode: ${MODE_OPTIONS.find((option) => option.id === mode)?.title ?? 'CLASSIC'}${event ? ` · ${event.name}` : ''}\n\n${missions}\n\n#LOWKEYGAME`;
}
