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
import { ChaosSlot, CountUp, Entrance, HoldToReveal, PopOnChange, ROW_LAYOUT, StreakFlame, TONES } from './motion';
import { COLORS, Eyebrow, PrimaryButton } from './ui';

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
  chaosCard: { width: '100%', backgroundColor: COLORS.green, borderRadius: 17, padding: 15, marginTop: 12 },
  chaosName: { color: COLORS.ink, fontSize: 18, fontWeight: '900', marginTop: 8, letterSpacing: 0.5 },
  chaosRule: { color: COLORS.ink, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 6 },
  chaosDetail: { color: '#536048', fontSize: 10, lineHeight: 14, marginTop: 6 },
  bounty: { color: COLORS.ink, fontSize: 12, fontWeight: '900', marginTop: 9 },
  tag: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  tagEasy: { backgroundColor: '#E6F4D2', color: TONES.greenInk },
  tagMedium: { backgroundColor: '#FCEFC9', color: '#8A6510' },
  tagHard: { backgroundColor: '#FBDDD5', color: '#A23E2B' },
  tagAgent: { backgroundColor: COLORS.ink, color: COLORS.green },
  missionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  missionText: { color: COLORS.ink, fontSize: 24, lineHeight: 30, fontWeight: '900', marginTop: 15 },
  missionNote: { color: COLORS.ink, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 10 },
  missionHint: { color: '#536048', fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 4 },
  hint: { color: COLORS.ink, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12, overflow: 'hidden', padding: 10, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 11 },
  sheetTitle: { color: COLORS.ink, fontSize: 26, lineHeight: 31, fontWeight: '900', letterSpacing: -0.8, marginTop: 8 },
  sheetCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, paddingHorizontal: 14, minHeight: 46, justifyContent: 'center' },
  chipText: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  option: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, padding: 15, marginBottom: 9 },
  optionText: { color: COLORS.ink, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  back: { alignItems: 'center', paddingVertical: 16 },
  backText: { color: COLORS.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  peekCard: { marginTop: 4 },
  avatarButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { fontSize: 22 },
  leaderRow: { paddingTop: 12 },
  leaderLine: { flexDirection: 'row', alignItems: 'center' },
  leaderRank: { color: COLORS.muted, width: 26, fontSize: 11, fontWeight: '900' },
  leaderFirst: { fontSize: 14 },
  leaderAvatar: { fontSize: 16, marginRight: 6 },
  leaderName: { color: COLORS.ink, flex: 1, fontSize: 12, fontWeight: '900' },
  leaderDetail: { color: COLORS.muted, fontSize: 9, fontWeight: '700', marginLeft: 26, marginTop: 4 },
});
