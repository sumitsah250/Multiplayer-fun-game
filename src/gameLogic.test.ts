/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BADGES,
  CALLOUT_PENALTY,
  CALLOUT_REWARD,
  CHAOS_EVENTS,
  CREATIVE_BONUS,
  MAX_PLAYERS,
  MISSION_TEMPLATES,
  PACK_OPTIONS,
  applyRoundToLifetime,
  applySwap,
  calloutOptions,
  chaosRuleSecondsLeft,
  checkPlayerNames,
  addMission,
  crownMissionOfTheNight,
  displaySeconds,
  editMission,
  EMPTY_MISSION_EDITS,
  fromEditableText,
  inKickoff,
  missionLibrary,
  removeMission,
  restorePack,
  roundDeadline,
  toEditableText,
  dealRound,
  emptySessionStats,
  emptyStats,
  hintFor,
  isPastHalfway,
  makeMissions,
  makeRoundRecord,
  makeShareMessage,
  missionPoints,
  newBadges,
  pickSwapPair,
  playerKey,
  playerTitle,
  renderCustomMission,
  resolveCallout,
  resolvePlayers,
  roundDurationSeconds,
  scoreRound,
  secondsRemaining,
  unlockedAvatars,
} from './gameLogic.ts';
import { BRAND } from './brand.ts';
import type { ChaosEvent, DealOptions, Lifetime, Player, PlayerStats, RoundOutcome } from './gameLogic.ts';

const doubleDown = CHAOS_EVENTS.find((event) => event.id === 'double-down') as ChaosEvent;
const oneWord = CHAOS_EVENTS.find((event) => event.id === 'one-word') as ChaosEvent;
const bounty = CHAOS_EVENTS.find((event) => event.id === 'bounty') as ChaosEvent;

// Names chosen so none is a substring of another.
const TEN_NAMES = ['Ana', 'Ben', 'Cleo', 'Dev', 'Esi', 'Finn', 'Gus', 'Hira', 'Ivo', 'Jun'];

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function player(name: string, completed: boolean | null, extra: Partial<Player> = {}): Player {
  return {
    name,
    avatar: '😎',
    mission: `Mission for ${name}`,
    missionId: `id-${name}`,
    target: '',
    difficulty: 'medium',
    kind: 'say',
    role: 'agent',
    completed,
    ...extra,
  };
}

function outcome(extra: Partial<RoundOutcome> = {}): RoundOutcome {
  return { mode: 'classic', event: null, bountyName: null, callouts: [], creativeName: null, ...extra };
}

const options = (extra: Partial<DealOptions> = {}): DealOptions => ({
  packs: ['everyday'],
  difficulty: 'mixed',
  customMissions: [],
  doubleAgent: false,
  ...extra,
});

describe('checkPlayerNames', () => {
  it('needs at least three non-blank names', () => {
    assert.equal(checkPlayerNames(['Ana', 'Ben', '']).canStart, false);
    assert.equal(checkPlayerNames(['Ana', 'Ben', '   ']).canStart, false);
    assert.deepEqual(checkPlayerNames([' Ana ', 'Ben', 'Cleo']), {
      validNames: ['Ana', 'Ben', 'Cleo'],
      hasDuplicateNames: false,
      canStart: true,
    });
  });

  it('rejects duplicates regardless of case and spacing', () => {
    const result = checkPlayerNames(['Ana', ' ana', 'Ben']);
    assert.equal(result.hasDuplicateNames, true);
    assert.equal(result.canStart, false);
  });

  it('allows ten players but not eleven', () => {
    assert.equal(checkPlayerNames(TEN_NAMES).canStart, true);
    assert.equal(checkPlayerNames([...TEN_NAMES, 'Kai']).canStart, false);
  });
});

describe('mission library', () => {
  it('has 200+ missions with unique ids and enough per pack for a full group', () => {
    assert.ok(MISSION_TEMPLATES.length >= 200, `${MISSION_TEMPLATES.length} missions`);
    assert.equal(new Set(MISSION_TEMPLATES.map((template) => template.id)).size, MISSION_TEMPLATES.length);
    assert.equal(new Set(MISSION_TEMPLATES.map((template) => template.text)).size, MISSION_TEMPLATES.length);
    for (const pack of PACK_OPTIONS) {
      const count = MISSION_TEMPLATES.filter((template) => template.pack === pack.id).length;
      assert.ok(count >= MAX_PLAYERS, `${pack.id} has ${count}`);
    }
    for (const template of MISSION_TEMPLATES) assert.ok(template.text.includes('{t}'), template.id);
  });
});

describe('makeMissions', () => {
  it('never targets the player themselves, deals distinct missions, and hunts everyone once', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const players = makeMissions(TEN_NAMES, options({ packs: ['office'] }), seededRandom(seed));
      assert.deepEqual(players.map((entry) => entry.name), TEN_NAMES);
      assert.equal(new Set(players.map((entry) => entry.mission)).size, players.length);
      assert.equal(new Set(players.map((entry) => entry.target)).size, players.length);
      for (const entry of players) {
        assert.equal(entry.completed, null);
        assert.notEqual(entry.target, entry.name);
        assert.ok(!entry.mission.includes(entry.name), `${entry.name} got "${entry.mission}"`);
        const targets = TEN_NAMES.filter((name) => entry.mission.includes(name));
        assert.deepEqual(targets, [entry.target], `"${entry.mission}" should name exactly its target`);
      }
    }
  });

  it('works for the smallest group', () => {
    const players = makeMissions(['Ana', 'Ben', 'Cleo'], options(), seededRandom(7));
    assert.equal(players.length, 3);
    assert.equal(new Set(players.map((entry) => entry.avatar)).size, 3);
  });

  it('respects packs and difficulty when there are enough missions', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const players = makeMissions(['Ana', 'Ben', 'Cleo', 'Dev'], options({ packs: ['dinner'], difficulty: 'easy' }), seededRandom(seed));
      for (const entry of players) {
        const template = MISSION_TEMPLATES.find((item) => item.id === entry.missionId);
        assert.equal(template?.pack, 'dinner');
        assert.equal(entry.difficulty, 'easy');
      }
    }
  });

  it('tops up from other missions when a difficulty runs short', () => {
    const players = makeMissions(TEN_NAMES, options({ packs: ['office'], difficulty: 'medium' }), seededRandom(3));
    assert.equal(new Set(players.map((entry) => entry.mission)).size, 10);
  });

  it('deals house missions first and fills in the target', () => {
    const players = makeMissions(
      ['Ana', 'Ben', 'Cleo'],
      options({ customMissions: ['Get @ to moonwalk', '  Wave at the door  '] }),
      seededRandom(11),
    );
    const custom = players.filter((entry) => entry.missionId.startsWith('custom-'));
    assert.equal(custom.length, 2);
    for (const entry of custom) {
      assert.ok(entry.mission === `Get ${entry.target} to moonwalk` || entry.mission === `${entry.target}: Wave at the door`);
    }
    assert.equal(renderCustomMission('No target here', 'Ben'), 'Ben: No target here');
  });

  it('adds one double agent only with four or more players', () => {
    const three = makeMissions(['Ana', 'Ben', 'Cleo'], options({ doubleAgent: true }), seededRandom(2));
    assert.equal(three.filter((entry) => entry.role === 'double-agent').length, 0);
    for (let seed = 1; seed <= 50; seed += 1) {
      const players = makeMissions(TEN_NAMES.slice(0, 5), options({ doubleAgent: true }), seededRandom(seed));
      const agents = players.filter((entry) => entry.role === 'double-agent');
      assert.equal(agents.length, 1);
      assert.match(agents[0].mission, new RegExp(`stop ${agents[0].target} from`));
    }
  });

  it('uses chosen avatars', () => {
    const players = makeMissions(['Ana', 'Ben', 'Cleo'], options({ avatars: { ana: '👑' } }), seededRandom(5));
    assert.equal(players[0].avatar, '👑');
  });
});

describe('dealRound', () => {
  it('only deals chaos events in chaos mode, with a valid bounty or swap pair', () => {
    assert.equal(dealRound(['Ana', 'Ben', 'Cleo'], 'classic', options(), seededRandom(1)).event, null);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed += 1) {
      const round = dealRound(TEN_NAMES.slice(0, 5), 'chaos', options(), seededRandom(seed));
      assert.ok(round.event);
      seen.add(round.event.id);
      assert.equal(round.bountyName !== null, round.event.id === 'bounty');
      assert.equal(round.swapPair !== null, round.event.id === 'swap');
    }
    assert.equal(seen.size, CHAOS_EVENTS.length);
  });
});

describe('swap', () => {
  it('trades missions without anyone targeting themselves', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const players = makeMissions(TEN_NAMES.slice(0, 6), options(), seededRandom(seed));
      const pair = pickSwapPair(players, seededRandom(seed + 1));
      if (!pair) continue;
      const swapped = applySwap(players, pair);
      for (const entry of swapped) assert.notEqual(entry.target, entry.name);
      const before = players.find((entry) => entry.name === pair[0]);
      const after = swapped.find((entry) => entry.name === pair[1]);
      assert.equal(after?.mission, before?.mission);
    }
  });
});

describe('call-outs', () => {
  const round = [
    player('Ana', null, { target: 'Ben', mission: 'Get Ben to say “pizza.”' }),
    player('Ben', null, { target: 'Cleo', mission: 'Make Cleo laugh.' }),
    player('Cleo', null, { target: 'Ana', mission: 'Get Ana to high-five you.' }),
  ];

  it('is correct only when the suspect targets the accuser with that exact mission', () => {
    assert.equal(resolveCallout(round, [], 'Ben', 'Ana', 'Get Ben to say “pizza.”')?.correct, true);
    assert.equal(resolveCallout(round, [], 'Ben', 'Ana', 'Make Ben laugh.')?.correct, false);
    assert.equal(resolveCallout(round, [], 'Ben', 'Cleo', 'Get Ben to say “pizza.”')?.correct, false);
  });

  it('allows one call-out per player and never twice on a caught player', () => {
    const first = resolveCallout(round, [], 'Ben', 'Ana', 'Get Ben to say “pizza.”');
    assert.ok(first);
    assert.equal(resolveCallout(round, [first], 'ben', 'Cleo', 'x'), null);
    assert.equal(resolveCallout(round, [first], 'Cleo', 'Ana', 'x'), null);
    assert.equal(resolveCallout(round, [], 'Ana', 'Ana', 'x'), null);
    assert.equal(resolveCallout(round, [], 'Zed', 'Ana', 'x'), null);
  });

  it('offers four choices that include the real mission only for the real hunter', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const right = calloutOptions(round, 'Ben', 'Ana', seededRandom(seed));
      assert.equal(right.length, 4);
      assert.equal(new Set(right).size, 4);
      assert.ok(right.includes('Get Ben to say “pizza.”'));
      const wrong = calloutOptions(round, 'Ben', 'Cleo', seededRandom(seed));
      assert.equal(wrong.length, 4);
      for (const text of wrong) assert.ok(!round.some((entry) => entry.mission === text));
    }
  });

  it('fails a caught player and scores the accuser', () => {
    const callouts = [
      resolveCallout(round, [], 'Ben', 'Ana', 'Get Ben to say “pizza.”')!,
      resolveCallout(round, [], 'Cleo', 'Ben', 'nope')!,
    ];
    const voted = round.map((entry) => ({ ...entry, completed: true }));
    const stats = scoreRound(emptySessionStats(['Ana', 'Ben', 'Cleo']), voted, outcome({ callouts }));
    assert.equal(stats.ana.score, 0);
    assert.equal(stats.ana.timesCaught, 1);
    assert.equal(stats.ben.score, 1000 + CALLOUT_REWARD);
    assert.equal(stats.cleo.score, 1000 - CALLOUT_PENALTY);
    assert.equal(stats.cleo.callsWrong, 1);
  });

  it('never takes a score below zero', () => {
    const callouts = [resolveCallout(round, [], 'Cleo', 'Ben', 'nope')!];
    const stats = scoreRound(emptySessionStats(['Ana', 'Ben', 'Cleo']), round.map((entry) => ({ ...entry, completed: false })), outcome({ callouts }));
    assert.equal(stats.cleo.score, 0);
  });
});

describe('resolvePlayers', () => {
  it('scores a double agent on whether their target failed', () => {
    const base = [
      player('Ana', null, { target: 'Ben' }),
      player('Ben', null, { target: 'Cleo' }),
      player('Cleo', null, { target: 'Dev' }),
      player('Dev', null, { target: 'Ana', role: 'double-agent' }),
    ];
    assert.equal(resolvePlayers(base, []).find((entry) => entry.name === 'Dev')?.completed, null);
    const anaFailed = base.map((entry) => (entry.name === 'Ana' ? { ...entry, completed: false } : entry));
    assert.equal(resolvePlayers(anaFailed, []).find((entry) => entry.name === 'Dev')?.completed, true);
    const anaWon = base.map((entry) => (entry.name === 'Ana' ? { ...entry, completed: true } : entry));
    assert.equal(resolvePlayers(anaWon, []).find((entry) => entry.name === 'Dev')?.completed, false);
    const caught = [{ accuser: 'Ana', suspect: 'Dev', guess: 'x', correct: true }];
    assert.equal(resolvePlayers(anaFailed, caught).find((entry) => entry.name === 'Dev')?.completed, false);
  });
});

describe('missionPoints', () => {
  it('scales by difficulty and mode', () => {
    assert.equal(missionPoints(player('Ana', true, { difficulty: 'easy' }), outcome()), 500);
    assert.equal(missionPoints(player('Ana', true), outcome()), 1000);
    assert.equal(missionPoints(player('Ana', true, { difficulty: 'hard' }), outcome()), 2000);
    assert.equal(missionPoints(player('Ana', true), outcome({ mode: 'chaos', event: oneWord })), 1000);
    assert.equal(missionPoints(player('Ana', true), outcome({ mode: 'chaos', event: doubleDown })), 2000);
    assert.equal(missionPoints(player('Ana', true), outcome({ mode: 'sudden-death' })), 1500);
    assert.equal(missionPoints(player('Ana', true), outcome({ mode: 'chaos', event: bounty, bountyName: 'ana' })), 3000);
    assert.equal(missionPoints(player('Ben', true), outcome({ mode: 'chaos', event: bounty, bountyName: 'Ana' })), 1000);
  });
});

describe('scoreRound', () => {
  it('adds points, wins and streaks once per round', () => {
    const start = emptySessionStats(['Ana', 'Ben', 'Cleo']);
    const round = [player('Ana', true), player('Ben', false), player('Cleo', true)];
    const after = scoreRound(start, round, outcome());
    assert.deepEqual(after.ana, { ...emptyStats(), score: 1000, wins: 1, streak: 1, bestStreak: 1 });
    assert.equal(after.ben.score, 0);
    assert.equal(after.ben.streak, 0);
    assert.equal(after.cleo.score, 1000);
  });

  it('does not mutate the previous stats', () => {
    const start = emptySessionStats(['Ana', 'Ben', 'Cleo']);
    const snapshot = structuredClone(start);
    scoreRound(start, [player('Ana', true), player('Ben', true), player('Cleo', true)], outcome());
    assert.deepEqual(start, snapshot);
  });

  it('resets a streak on failure but keeps the best streak', () => {
    let stats: Record<string, PlayerStats> = emptySessionStats(['Ana', 'Ben', 'Cleo']);
    const others = [player('Ben', false), player('Cleo', false)];
    for (const completed of [true, true, true, false, true]) {
      stats = scoreRound(stats, [player('Ana', completed), ...others], outcome());
    }
    assert.equal(stats.ana.score, 4000);
    assert.equal(stats.ana.wins, 4);
    assert.equal(stats.ana.streak, 1);
    assert.equal(stats.ana.bestStreak, 3);
  });

  it('counts mode-specific wins, the creative bonus and hard wins', () => {
    let stats = emptySessionStats(['Ana', 'Ben', 'Cleo']);
    const round = [player('Ana', true, { difficulty: 'hard' }), player('Ben', null), player('Cleo', false)];
    stats = scoreRound(stats, round, outcome({ mode: 'chaos', event: doubleDown, creativeName: 'Ana' }));
    stats = scoreRound(stats, round, outcome({ mode: 'sudden-death', creativeName: 'Cleo' }));
    assert.equal(stats.ana.score, 4000 + CREATIVE_BONUS + 3000);
    assert.equal(stats.ana.chaosWins, 1);
    assert.equal(stats.ana.suddenDeathWins, 1);
    assert.equal(stats.ana.hardWins, 2);
    assert.equal(stats.ana.creative, 1);
    // An unscored mission counts as not completed, and only a completed mission can be "most creative".
    assert.equal(stats.ben.score, 0);
    assert.equal(stats.cleo.score, 0);
  });

  it('matches players to stats case-insensitively', () => {
    const stats = scoreRound(emptySessionStats(['Ana']), [player('ANA ', true)], outcome());
    assert.deepEqual(Object.keys(stats), ['ana']);
    assert.equal(stats.ana.score, 1000);
  });
});

describe('makeRoundRecord', () => {
  it('lists who completed, failed and got caught', () => {
    const callouts = [{ accuser: 'Ben', suspect: 'Cleo', guess: 'x', correct: true }];
    const record = makeRoundRecord(
      2,
      [player('Ana', true), player('Ben', false), player('Cleo', true)],
      outcome({ mode: 'chaos', event: doubleDown, callouts }),
    );
    assert.equal(record.round, 2);
    assert.equal(record.eventName, 'DOUBLE DOWN');
    assert.deepEqual(record.completedNames, ['Ana']);
    assert.deepEqual(record.failedNames, ['Ben', 'Cleo']);
    assert.deepEqual(record.caughtNames, ['Cleo']);
    assert.equal(record.results.find((result) => result.name === 'Ben')?.points, CALLOUT_REWARD);
  });
});

describe('playerTitle', () => {
  const base: PlayerStats = { ...emptyStats(), score: 1000, wins: 1, streak: 1, bestStreak: 1 };

  it('only titles a session leader with at least one win', () => {
    assert.equal(playerTitle(base, false), null);
    assert.equal(playerTitle({ ...base, wins: 0 }, true), null);
    assert.equal(playerTitle(base, true), 'PROFESSIONAL MENACE');
  });

  it('picks the title from events that actually happened', () => {
    assert.equal(playerTitle({ ...base, bestStreak: 3 }, true), 'PLOT ARMOR CHAMPION');
    assert.equal(playerTitle({ ...base, callsRight: 2 }, true), 'HAWK EYE');
    assert.equal(playerTitle({ ...base, chaosWins: 2 }, true), 'CHAOS COORDINATOR');
    assert.equal(playerTitle({ ...base, suddenDeathWins: 1 }, true), 'CERTIFIED LUCKY');
  });
});

describe('timer', () => {
  it('uses 60 seconds for sudden death and the chosen minutes otherwise', () => {
    assert.equal(roundDurationSeconds('sudden-death', 10), 60);
    assert.equal(roundDurationSeconds('classic', 3), 180);
    assert.equal(roundDurationSeconds('chaos', 10), 600);
  });

  it('counts down from the wall-clock deadline', () => {
    const endsAt = 1_000_000;
    assert.equal(secondsRemaining(endsAt, endsAt - 300_000), 300);
    assert.equal(secondsRemaining(endsAt, endsAt - 1), 1);
    assert.equal(secondsRemaining(endsAt, endsAt), 0);
  });

  it('reaches zero if the deadline passed while the app was in the background', () => {
    assert.equal(secondsRemaining(1_000_000, 1_000_000 + 90_000), 0);
  });

  it('opens hints halfway and times start-of-round rules', () => {
    assert.equal(isPastHalfway(89, 180), false);
    assert.equal(isPastHalfway(90, 180), true);
    assert.equal(chaosRuleSecondsLeft(oneWord, 10), 20);
    assert.equal(chaosRuleSecondsLeft(oneWord, 45), 0);
    assert.equal(chaosRuleSecondsLeft(doubleDown, 0), 0);
  });

  it('gives every player a hint', () => {
    for (const template of MISSION_TEMPLATES.slice(0, 20)) {
      assert.ok(hintFor(player('Ana', null, { missionId: template.id, kind: template.kind })).length > 10);
    }
    assert.ok(hintFor(player('Ana', null, { role: 'double-agent' })).length > 10);
  });
});

describe('lifetime progress', () => {
  it('accumulates rounds and unlocks badges and avatars', () => {
    let lifetime: Lifetime = {};
    for (let round = 1; round <= 3; round += 1) {
      const record = makeRoundRecord(round, [player('Ana', true, { difficulty: 'hard' }), player('Ben', false)], outcome());
      const next = applyRoundToLifetime(lifetime, record);
      if (round === 1) assert.deepEqual(newBadges(lifetime, next).map((entry) => entry.badge.id), ['first-blood']);
      lifetime = next;
    }
    const ana = lifetime.ana;
    assert.equal(ana.rounds, 3);
    assert.equal(ana.missions, 3);
    assert.equal(ana.bestStreak, 3);
    const avatars = unlockedAvatars(ana);
    for (const id of ['first-blood', 'plot-armor', 'high-roller']) {
      assert.ok(avatars.includes(BADGES.find((badge) => badge.id === id)!.avatar), id);
    }
  });

  it('can record only one player (a guest phone)', () => {
    const record = makeRoundRecord(1, [player('Ana', true), player('Ben', true)], outcome());
    assert.deepEqual(Object.keys(applyRoundToLifetime({}, record, 'ben')), ['ben']);
  });

  it('crowns the mission of the night', () => {
    const lifetime = crownMissionOfTheNight({}, 'Ana');
    assert.equal(lifetime[playerKey('Ana')].missionsOfTheNight, 1);
    assert.ok(unlockedAvatars(lifetime.ana).includes('👑'));
  });
});

describe('makeShareMessage', () => {
  it('does not claim a winner before every mission is scored', () => {
    const players = [player('Ana', true), player('Ben', null), player('Cleo', false)];
    const message = makeShareMessage(players, [players[0]], 'classic', null);
    assert.ok(message.startsWith(`We played ${BRAND.name} — here’s how the missions went!`));
    assert.match(message, /Ben: Mission for Ben — unscored/);
  });

  it('names the winners, the chaos rule and anyone busted', () => {
    const players = [player('Ana', true), player('Ben', true), player('Cleo', false)];
    const callouts = [{ accuser: 'Ana', suspect: 'Cleo', guess: 'x', correct: true }];
    const message = makeShareMessage(players, players.slice(0, 2), 'chaos', doubleDown, callouts);
    assert.ok(message.startsWith(`Ana & Ben won ${BRAND.name}!`));
    assert.match(message, /Mode: CHAOS · DOUBLE DOWN/);
    assert.match(message, /Cleo: Mission for Cleo — BUSTED/);
    assert.ok(message.endsWith(`${BRAND.hashtag}\n${BRAND.credit}`));
  });

  it('handles a round where nobody completed a mission', () => {
    const players = [player('Ana', false), player('Ben', false), player('Cleo', false)];
    assert.match(makeShareMessage(players, [], 'sudden-death', null), /nobody completed a mission!\nMode: SUDDEN DEATH/);
  });
});

describe('kickoff', () => {
  it('starts the clock after the 3-2-1 and shows the full time until then', () => {
    const now = 1_000_000;
    const endsAt = roundDeadline(now, 60);
    assert.equal(inKickoff(endsAt, now, 60), true);
    assert.equal(displaySeconds(endsAt, now, 60), 60);
    assert.equal(inKickoff(endsAt, now + 3500, 60), false);
    assert.equal(displaySeconds(endsAt, now + 3500 + 10_000, 60), 50);
  });
});

describe('mission library', () => {
  const first = MISSION_TEMPLATES.find((template) => template.pack === 'dinner')!;

  it('round-trips the @ target marker', () => {
    assert.equal(toEditableText('Get {t} to dance.'), 'Get @ to dance.');
    assert.equal(fromEditableText('  Get @ to   dance. '), 'Get {t} to dance.');
    assert.equal(fromEditableText('Wave at the door'), '{t}: Wave at the door');
    assert.equal(fromEditableText('   '), null);
  });

  it('edits, deletes, adds and restores missions', () => {
    let edits = editMission(EMPTY_MISSION_EDITS, first, 'Get @ to sing.', 'hard');
    let library = missionLibrary(edits);
    assert.equal(library.find((template) => template.id === first.id)?.text, 'Get {t} to sing.');
    assert.equal(library.find((template) => template.id === first.id)?.difficulty, 'hard');

    edits = addMission(edits, 'dinner', 'Get @ to order dessert', 'easy', 'mine-1');
    edits = editMission(edits, missionLibrary(edits).find((template) => template.id === 'mine-1')!, 'Get @ to order two desserts', 'medium');
    library = missionLibrary(edits);
    assert.equal(library.find((template) => template.id === 'mine-1')?.text, 'Get {t} to order two desserts');

    edits = removeMission(edits, first.id);
    edits = removeMission(edits, 'mine-1');
    library = missionLibrary(edits);
    assert.ok(!library.some((template) => template.id === first.id || template.id === 'mine-1'));

    edits = restorePack(edits, 'dinner');
    assert.deepEqual(edits, EMPTY_MISSION_EDITS);
    assert.equal(missionLibrary(edits).length, MISSION_TEMPLATES.length);
  });

  it('deals from the edited library, and still deals when a pack was emptied', () => {
    const dinner = MISSION_TEMPLATES.filter((template) => template.pack === 'dinner');
    let edits = EMPTY_MISSION_EDITS;
    for (const template of dinner) edits = removeMission(edits, template.id);
    edits = addMission(edits, 'dinner', 'Get @ to say spaghetti', 'easy', 'mine-2');
    const players = makeMissions(TEN_NAMES, options({ packs: ['dinner'], library: missionLibrary(edits) }), seededRandom(4));
    assert.equal(players.length, 10);
    assert.equal(new Set(players.map((entry) => entry.mission)).size, 10);
    assert.ok(players.some((entry) => entry.missionId === 'mine-2'));
    assert.ok(!players.some((entry) => dinner.some((template) => template.id === entry.missionId)));
  });
});
