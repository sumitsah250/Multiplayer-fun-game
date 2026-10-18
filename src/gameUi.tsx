// Game pieces shared by the pass-the-phone game (App.tsx) and guest phones in
// a private room (src/room/GuestRoom.tsx).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  CALLOUT_PENALTY,
  CALLOUT_REWARD,
  calloutOptions,
  canCallOut,
  hintFor,
  isCaught,
  missionNote,
  missionPoints,
  playerKey,
} from './gameLogic';
import type { Callout, ChaosEvent, Player, RoundOutcome } from './gameLogic';
import { haptic } from './haptics';
import { ChaosSlot, CountUp, Entrance, HoldToReveal, PopOnChange, ROW_LAYOUT, StreakFlame } from './motion';
import { FONTS, RADIUS, THEME } from './theme';
import { Eyebrow, PrimaryButton } from './ui';

export function ChaosEventCard({
  event,
  spin,
  onSpun,
  bountyName,
}: {
  event: ChaosEvent;
  spin: boolean;
  onSpun?: () => void;
  bountyName: string | null;
}) {
  const [landed, setLanded] = useState(!spin);
  return (
    <View style={styles.chaosCard}>
      <Eyebrow>⚡ THIS ROUND’S CHAOS RULE</Eyebrow>
      <ChaosSlot
        name={event.name}
        onLanded={() => {
          setLanded(true);
          onSpun?.();
        }}
        spin={spin}
        textStyle={styles.chaosName}
      />
      {landed && (
        <Entrance>
          <Text style={styles.chaosRule}>{event.instruction}</Text>
          <Text style={styles.chaosDetail}>{event.detail}</Text>
          {event.id === 'bounty' && bountyName && (
            <Text style={styles.bounty}>🎯 BOUNTY: {bountyName}’s mission is worth triple.</Text>
          )}
        </Entrance>
      )}
    </View>
  );
}

export function DifficultyTag({ player, outcome }: { player: Player; outcome: Pick<RoundOutcome, 'mode' | 'event' | 'bountyName'> }) {
  const points = missionPoints(player, outcome).toLocaleString();
  if (player.role === 'double-agent') {
    return <Text style={[styles.tag, styles.tagAgent]}>🕵️ DOUBLE AGENT · {points}</Text>;
  }
  const tone = player.difficulty === 'easy' ? styles.tagEasy : player.difficulty === 'hard' ? styles.tagHard : styles.tagMedium;
  return (
    <Text style={[styles.tag, tone]}>
      {player.difficulty.toUpperCase()} · {points}
    </Text>
  );
}

// What a player sees on their own mission card (deal screen, peeks, guests).
export function MissionBody({
  player,
  event,
  hint,
  outcome,
}: {
  player: Player;
  event: ChaosEvent | null;
  hint: boolean;
  outcome: Pick<RoundOutcome, 'mode' | 'event' | 'bountyName'>;
}) {
  const note = missionNote(player, event);
  return (
    <View>
      <View style={styles.missionTop}>
        <Eyebrow>🤫  {player.name.toUpperCase()}’S SECRET MISSION</Eyebrow>
        <DifficultyTag outcome={outcome} player={player} />
      </View>
      <Text style={styles.missionText}>{player.mission}</Text>
      {note && <Text style={styles.missionNote}>{note}</Text>}
      {hint ? (
        <Text style={styles.hint}>💡 {hintFor(player)}</Text>
      ) : (
        <Text style={styles.missionHint}>Do it naturally. Don’t let them catch on.</Text>
      )}
    </View>
  );
}

// Pick whose mission to peek at (pass-the-phone), then hold to see it.
export function PeekPanel({
  players,
  fixedName,
  event,
  hintsOpen,
  outcome,
  title,
  onClose,
}: {
  players: Player[];
  fixedName?: string;
  event: ChaosEvent | null;
  hintsOpen: boolean;
  outcome: Pick<RoundOutcome, 'mode' | 'event' | 'bountyName'>;
  title?: string;
  onClose: () => void;
}) {
  const [name, setName] = useState<string | null>(fixedName ?? null);
  const chosen = name ? players.find((player) => playerKey(player.name) === playerKey(name)) : null;

  if (!chosen) {
    return (
      <View>
        <Eyebrow>{title ?? (hintsOpen ? '💡 HINTS ARE OPEN' : '🤫 PEEK AT A MISSION')}</Eyebrow>
        <Text style={styles.sheetTitle}>Whose phone moment is it?</Text>
        <Text style={styles.sheetCopy}>Tap your own name. Everyone else: look away.</Text>
        <View style={styles.chips}>
          {players.map((player) => (
            <Pressable
              accessibilityRole="button"
              key={player.name}
              onPress={() => {
                haptic('select');
                setName(player.name);
              }}
              style={styles.chip}
            >
              <Text style={styles.chipText}>
                {player.avatar} {player.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View>
      <Eyebrow>{title ?? 'ONLY YOU'}</Eyebrow>
      <Text style={styles.sheetTitle}>{chosen.name}, hold to look.</Text>
      {!hintsOpen && <Text style={styles.sheetCopy}>Hints open halfway through the round.</Text>}
      <HoldToReveal style={styles.peekCard}>
        <MissionBody event={event} hint={hintsOpen} outcome={outcome} player={chosen} />
      </HoldToReveal>
      <PrimaryButton label="DONE · PUT IT BACK" onPress={onClose} />
    </View>
  );
}

// "Call it out": accuse the player you think is targeting you.
export function CallOutPanel({
  players,
  callouts,
  fixedAccuser,
  onSubmit,
  onClose,
}: {
  players: Player[];
  callouts: Callout[];
  fixedAccuser?: string;
  onSubmit: (accuser: string, suspect: string, guess: string) => void;
  onClose: () => void;
}) {
  const [accuser, setAccuser] = useState<string | null>(fixedAccuser ?? null);
  const [suspect, setSuspect] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const rules = `Right: +${CALLOUT_REWARD} and their mission fails. Wrong: −${CALLOUT_PENALTY}. One call-out per round.`;

  if (!accuser) {
    const able = players.filter((player) => canCallOut(callouts, player.name));
    return (
      <View>
        <Eyebrow>🚨 CALL IT OUT</Eyebrow>
        <Text style={styles.sheetTitle}>Who’s calling it?</Text>
        <Text style={styles.sheetCopy}>{rules}</Text>
        <View style={styles.chips}>
          {able.map((player) => (
            <Pressable
              accessibilityRole="button"
              key={player.name}
              onPress={() => {
                haptic('select');
                setAccuser(player.name);
              }}
              style={styles.chip}
            >
              <Text style={styles.chipText}>
                {player.avatar} {player.name}
              </Text>
            </Pressable>
          ))}
        </View>
        {able.length === 0 && <Text style={styles.sheetCopy}>Everyone has used their call-out this round.</Text>}
      </View>
    );
  }

  if (!canCallOut(callouts, accuser)) {
    return (
      <View>
        <Eyebrow>🚨 CALL IT OUT</Eyebrow>
        <Text style={styles.sheetTitle}>You’ve used your call-out.</Text>
        <Text style={styles.sheetCopy}>One per round. Watch the others closely next time.</Text>
        <PrimaryButton label="BACK TO THE GAME" onPress={onClose} />
      </View>
    );
  }

  if (!suspect) {
    const suspects = players.filter(
      (player) => playerKey(player.name) !== playerKey(accuser) && !isCaught(callouts, player.name),
    );
    return (
      <View>
        <Eyebrow>🚨 {accuser.toUpperCase()} IS CALLING IT</Eyebrow>
        <Text style={styles.sheetTitle}>Who’s after you?</Text>
        <Text style={styles.sheetCopy}>{rules}</Text>
        <View style={styles.chips}>
          {suspects.map((player) => (
            <Pressable
              accessibilityRole="button"
              key={player.name}
              onPress={() => {
                haptic('select');
                setSuspect(player.name);
                setOptions(calloutOptions(players, accuser, player.name));
              }}
              style={styles.chip}
            >
              <Text style={styles.chipText}>
                {player.avatar} {player.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View>
      <Eyebrow>
        🚨 {accuser.toUpperCase()} → {suspect.toUpperCase()}
      </Eyebrow>
      <Text style={styles.sheetTitle}>What were they trying to make you do?</Text>
      <Text style={styles.sheetCopy}>Say it out loud first. Then pick it.</Text>
      {options.map((option, index) => (
        <Entrance index={index} key={option}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onSubmit(accuser, suspect, option);
              onClose();
            }}
            style={styles.option}
          >
            <Text style={styles.optionText}>{option}</Text>
          </Pressable>
        </Entrance>
      ))}
      <Pressable onPress={() => setSuspect(null)} style={styles.back}>
        <Text style={styles.backText}>←  PICK SOMEONE ELSE</Text>
      </Pressable>
    </View>
  );
}

export function AvatarPicker({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: string[];
  onChange: (avatar: string) => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityHint="Changes your avatar. Earn badges to unlock more."
      accessibilityLabel={`${label} avatar ${value}`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        const index = options.indexOf(value);
        haptic('select');
        onChange(options[(index + 1) % options.length]);
      }}
      style={styles.avatarButton}
    >
      <PopOnChange trigger={value}>
        <Text style={styles.avatarText}>{value}</Text>
      </PopOnChange>
    </Pressable>
  );
}

export type LeaderEntry = {
  name: string;
  avatar?: string;
  score: number;
  // Score before the latest round, so the number counts up into place.
  from?: number;
  streak: number;
  detail?: string;
};

export function Leaderboard({ entries }: { entries: LeaderEntry[] }) {
  return (
    <View>
      {entries.map((entry, index) => (
        <Animated.View key={playerKey(entry.name)} layout={ROW_LAYOUT} style={styles.leaderRow}>
          <View style={styles.leaderLine}>
            <Text style={[styles.leaderRank, index === 0 && entry.score > 0 && styles.leaderFirst]}>
              {index === 0 && entry.score > 0 ? '👑' : index + 1}
            </Text>
            {entry.avatar && <Text style={styles.leaderAvatar}>{entry.avatar}</Text>}
            <Text numberOfLines={1} style={styles.leaderName}>
              {entry.name}
            </Text>
            <StreakFlame streak={entry.streak} />
            <CountUp from={entry.from} suffix=" PTS" value={entry.score} />
          </View>
          {entry.detail && <Text style={styles.leaderDetail}>{entry.detail}</Text>}
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chaosCard: {
    width: '100%',
    backgroundColor: THEME.surfaceHi,
    borderRadius: RADIUS.lg,
    borderWidth: 3,
    borderColor: THEME.yellow,
    padding: 16,
    marginTop: 14,
  },
  chaosName: { color: THEME.yellow, fontFamily: FONTS.black, fontSize: 26, lineHeight: 32, marginTop: 4, letterSpacing: 0.5 },
  chaosRule: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 15, lineHeight: 20, marginTop: 4 },
  chaosDetail: { color: THEME.muted, fontFamily: FONTS.medium, fontSize: 13, lineHeight: 18, marginTop: 4 },
  bounty: { color: THEME.pink, fontFamily: FONTS.black, fontSize: 14, marginTop: 8 },
  tag: {
    overflow: 'hidden',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
    fontFamily: FONTS.black,
    fontSize: 10,
    letterSpacing: 0.6,
    color: THEME.onAccent,
  },
  tagEasy: { backgroundColor: THEME.lime },
  tagMedium: { backgroundColor: THEME.yellow },
  tagHard: { backgroundColor: THEME.pink },
  tagAgent: { backgroundColor: THEME.cyan },
  missionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  missionText: { color: THEME.text, fontFamily: FONTS.black, fontSize: 26, lineHeight: 31, marginTop: 12 },
  missionNote: { color: THEME.cyan, fontFamily: FONTS.bold, fontSize: 13, lineHeight: 18, marginTop: 8 },
  missionHint: { color: THEME.muted, fontFamily: FONTS.semi, fontSize: 13, lineHeight: 18, marginTop: 8, marginBottom: 2 },
  hint: {
    color: THEME.onAccent,
    backgroundColor: THEME.lime,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    padding: 10,
    fontFamily: FONTS.bold,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  sheetTitle: { color: THEME.text, fontFamily: FONTS.black, fontSize: 28, lineHeight: 32, marginTop: 6 },
  sheetCopy: { color: THEME.muted, fontFamily: FONTS.medium, fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: THEME.surface,
    borderWidth: 2,
    borderColor: THEME.lineStrong,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: 'center',
  },
  chipText: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 15 },
  option: {
    backgroundColor: THEME.surface,
    borderWidth: 2,
    borderColor: THEME.lineStrong,
    borderRadius: RADIUS.md,
    padding: 15,
    marginBottom: 9,
  },
  optionText: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 15, lineHeight: 21 },
  back: { alignItems: 'center', paddingVertical: 16 },
  backText: { color: THEME.muted, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 1 },
  peekCard: { marginTop: 4 },
  avatarButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: THEME.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: { fontSize: 23 },
  leaderRow: { paddingTop: 12 },
  leaderLine: { flexDirection: 'row', alignItems: 'center' },
  leaderRank: { color: THEME.dim, width: 28, fontFamily: FONTS.black, fontSize: 14 },
  leaderFirst: { fontSize: 16 },
  leaderAvatar: { fontSize: 18, marginRight: 6 },
  leaderName: { color: THEME.text, flex: 1, fontFamily: FONTS.black, fontSize: 15 },
  leaderDetail: { color: THEME.muted, fontFamily: FONTS.medium, fontSize: 11, lineHeight: 15, marginLeft: 28, marginTop: 2 },
});
