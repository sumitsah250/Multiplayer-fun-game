import { StatusBar } from 'expo-status-bar';
import * as Sharing from 'expo-sharing';
import { useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Alert,
  AppState,
  BackHandler,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import {
  BADGES,
  CREATIVE_BONUS,
  DIFFICULTY_OPTIONS,
  MAX_CUSTOM_MISSIONS,
  MIN_PLAYERS_FOR_DOUBLE_AGENT,
  MODE_OPTIONS,
  PACK_OPTIONS,
  PLAYER_AVATARS,
  applyRoundToLifetime,
  applySwap,
  chaosRuleSecondsLeft,
  checkPlayerNames,
  cleanCustomMission,
  crownMissionOfTheNight,
  dealRound,
  earnedBadges,
  emptySessionStats,
  isCaught,
  isPastHalfway,
  makeRoundRecord,
  makeShareMessage,
  missionNote,
  needsVote,
  newBadges,
  playerKey,
  playerRoundPoints,
  playerTitle,
  randomItem,
  resolveCallout,
  resolvePlayers,
  roundDurationSeconds,
  scoreRound,
  secondsRemaining,
  setLifetimeAvatar,
  unlockedAvatars,
} from './src/gameLogic';
import type {
  Badge,
  Callout,
  ChaosEvent,
  DifficultySetting,
  GameMode,
  Lifetime,
  PackId,
  Player,
  PlayerStats,
  RoundOutcome,
  RoundRecord,
} from './src/gameLogic';
import { AvatarPicker, CallOutPanel, ChaosEventCard, DifficultyTag, Leaderboard, MissionBody, PeekPanel } from './src/gameUi';
import { haptic, hapticPattern, setHapticsEnabled } from './src/haptics';
import { BustedOverlay, Entrance, HoldToReveal, Sheet, Stamp, SwipeVote, TONES, TimerRing, Toast } from './src/motion';
import type { BustEvent } from './src/motion';
import { COLORS, Eyebrow, KeepScreenAwake, PrimaryButton, ProtectMissions } from './src/ui';
import { GuestRoom } from './src/room/GuestRoom';
import { roomsConfigured } from './src/room/client';
import { everyoneReady, isReady, isValidRoomCode, makeMemberId, makeRoomCode, normalizeRoomCode } from './src/room/protocol';
import type { CalloutMessage, RoomPhase } from './src/room/protocol';
import { useHostRoom } from './src/room/useHostRoom';
import type { HostRoom, HostSnapshot } from './src/room/useHostRoom';
import {
  DEFAULT_SETUP,
  clearLifetime,
  loadLastRoom,
  loadLifetime,
  loadSetup,
  saveLastRoom,
  saveSetup,
  updateLifetime,
} from './src/storage';
import type { LastRoom } from './src/storage';

type Stage =
  | 'home'
  | 'setup'
  | 'deal'
  | 'ready'
  | 'playing'
  | 'reveal'
  | 'share'
  | 'summary'
  | 'room-start'
  | 'guest'
  | 'fame';
type SoundPlayer = ReturnType<typeof useAudioPlayer>;
type Reaction = { id: number; message: string };
type SheetState = { kind: 'callout' } | { kind: 'peek'; names: string[] | null; title?: string } | null;
type GuestJoin = { code: string; name: string; memberId: string; avatar: string };
type BadgeNotice = { name: string; badge: Badge };

const PERSONALITY = {
  revealWin: [
    'The confidence was crazy.',
    'Bro really thought they were safe 💀',
    'Absolutely zero survival instincts.',
    'Friendship under investigation.',
    'The group will remember this.',
    'That was suspiciously smooth.',
    'Someone explain what just happened.',
    'Main character moment.',
  ],
  revealMiss: [
    'Mission failed. Vibes immaculate.',
    'The plot armor was not enough.',
    'So close. Yet so loudly suspicious.',
    'The mission saw what you did there.',
    'A heroic attempt. A chaotic outcome.',
    'The group remains unconvinced.',
  ],
  revealTie: [
    'Everybody is suspicious. Nobody is safe.',
    'A tie? Friendship under investigation.',
    'The chaos has no clear winner.',
    'Group chat evidence is inconclusive.',
  ],
  suspense: [
    'Okay, everyone. Be honest.',
    'It is time to expose the vibes.',
    'Somebody has explaining to do.',
    'Nobody look innocent all at once.',
  ],
  nextRound: [
    'The group chat can wait. Run it back.',
    'New round. Fresh opportunities for suspicion.',
    'You all look way too confident. Again.',
    'A rematch? This friendship is brave.',
  ],
  reactions: {
    laugh: ['Absolutely not 💀', 'I saw that coming.', 'The acting was questionable.'],
    shocked: ['WAIT. That was the mission?', 'The plot thickens 👀', 'No way that was an accident.'],
    suspicious: ['I have questions.', 'That timing was suspicious.', 'Eyes on this one.'],
    celebrate: ['Main character energy ✨', 'Against all odds!', 'Okay, that was clean.'],
  },
};

function ConfettiPiece({
  left,
  delay,
  color,
  shape,
}: {
  left: `${number}%`;
  delay: number;
  color: string;
  shape: '✦' | '●' | '♥';
}) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 1500,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress]);

  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.confettiPiece,
        {
          left,
          color,
          opacity: progress.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0, 1, 0] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-22, 260] }) },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '300deg'] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.25, 1.2, 0.75] }) },
          ],
        },
      ]}
    >
      {shape}
    </Animated.Text>
  );
}

function Celebration({ reduceMotion }: { reduceMotion: boolean }) {
  if (reduceMotion) return null;
  const pieces = [
    { left: '5%', color: '#FF8B64', shape: '✦' },
    { left: '15%', color: '#93BE4B', shape: '●' },
    { left: '25%', color: '#987BFF', shape: '♥' },
    { left: '37%', color: '#FFBD4A', shape: '✦' },
    { left: '49%', color: '#FF8B64', shape: '●' },
    { left: '61%', color: '#93BE4B', shape: '♥' },
    { left: '73%', color: '#987BFF', shape: '✦' },
    { left: '85%', color: '#FFBD4A', shape: '●' },
    { left: '94%', color: '#FF8B64', shape: '♥' },
  ] as const;

  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {pieces.map((piece, index) => (
        <ConfettiPiece key={`${piece.left}-${piece.shape}`} {...piece} delay={index * 75} />
      ))}
    </View>
  );
}

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function sameName(left: string, right: string) {
  return playerKey(left) === playerKey(right);
}

export default function App() {
  return (
    <GestureHandlerRootView style={[styles.root, Platform.OS === 'web' && styles.webRoot]}>
      {/* On the web (e.g. a laptop browser), keep the phone-sized layout in a centred column. */}
      <View style={[styles.root, Platform.OS === 'web' && styles.webColumn]}>
        <SafeAreaProvider>
          <Game />
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}

function Game() {
  const [stage, setStage] = useState<Stage>('home');
  const [names, setNames] = useState(['', '', '']);
  // Private room: set while this phone hosts a room (players use their own phones).
  const [room, setRoom] = useState<HostRoom | null>(null);
  const [guestJoin, setGuestJoin] = useState<GuestJoin | null>(null);
  const [lastRoom, setLastRoom] = useState<LastRoom | null>(null);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomAvatarPick, setRoomAvatarPick] = useState<string | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [duration, setDuration] = useState(5);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [missionVisible, setMissionVisible] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedMode, setSelectedMode] = useState<GameMode>('classic');
  const [roundMode, setRoundMode] = useState<GameMode>('classic');
  const [chaosEvent, setChaosEvent] = useState<ChaosEvent | null>(null);
  // Setup choices, remembered on the device.
  const [setupLoaded, setSetupLoaded] = useState(false);
  const [packs, setPacks] = useState<PackId[]>(DEFAULT_SETUP.packs);
  const [difficulty, setDifficulty] = useState<DifficultySetting>(DEFAULT_SETUP.difficulty);
  const [doubleAgent, setDoubleAgent] = useState(DEFAULT_SETUP.doubleAgent);
  const [customMissions, setCustomMissions] = useState<string[]>(DEFAULT_SETUP.customMissions);
  const [customDraft, setCustomDraft] = useState('');
  // Avatar picked on each setup row (by row, so picking before typing a name sticks).
  const [avatarPicks, setAvatarPicks] = useState<(string | undefined)[]>([]);
  // This round's extras.
  const [bountyName, setBountyName] = useState<string | null>(null);
  const [swapPair, setSwapPair] = useState<[string, string] | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const [creativeName, setCreativeName] = useState<string | null>(null);
  const [deniedNames, setDeniedNames] = useState<string[]>([]);
  const [slotSpunRound, setSlotSpunRound] = useState(0);
  // Scores: everything up to the last committed round, plus the current round
  // once every mission has an outcome (so a deny or re-vote just re-scores it).
  const [baseStats, setBaseStats] = useState<Record<string, PlayerStats>>({});
  const [baseHistory, setBaseHistory] = useState<RoundRecord[]>([]);
  const [committedRoundId, setCommittedRoundId] = useState(0);
  const [lifetime, setLifetime] = useState<Lifetime>({});
  const [lifetimeSavedRound, setLifetimeSavedRound] = useState(0);
  const [motn, setMotn] = useState<{ key: string; name: string } | null>(null);
  const [badgeNotices, setBadgeNotices] = useState<BadgeNotice[]>([]);
  const [roundId, setRoundId] = useState(0);
  const [revealReady, setRevealReady] = useState(false);
  const [commentary, setCommentary] = useState('');
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [bust, setBust] = useState<BustEvent | null>(null);
  const shareCardRef = useRef<View>(null);
  const [screenOpacity] = useState(() => new Animated.Value(1));
  const [screenOffset] = useState(() => new Animated.Value(0));
  const [heroFloat] = useState(() => new Animated.Value(0));
  const [livePulse] = useState(() => new Animated.Value(1));
  const tickedSecond = useRef<number | null>(null);
  const commentedRound = useRef(0);
  const reactionId = useRef(0);
  const bustKey = useRef(0);
  const shownCallouts = useRef(0);
  const soundEnabledRef = useRef(soundEnabled);
  const stageRef = useRef(stage);
  const playersRef = useRef(players);
  const roundIdRef = useRef(roundId);
  const sharingRef = useRef(false);
  const setupScrollRef = useRef<ScrollView>(null);
  const nameListY = useRef(0);
  const nameRowY = useRef<number[]>([]);
  const tapPlayer = useAudioPlayer(require('./assets/sounds/tap.wav'));
  const secretPlayer = useAudioPlayer(require('./assets/sounds/secret.wav'));
  const revealPlayer = useAudioPlayer(require('./assets/sounds/reveal.wav'));

  const playSound = useCallback((player: SoundPlayer) => {
    if (!soundEnabled) return;
    player.seekTo(0);
    player.play();
  }, [soundEnabled]);

  const playTap = useCallback(() => playSound(tapPlayer), [playSound, tapPlayer]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    stageRef.current = stage;
    playersRef.current = players;
    roundIdRef.current = roundId;
  }, [players, roundId, stage]);

  useEffect(() => {
    setHapticsEnabled(!reduceMotion);
  }, [reduceMotion]);

  // Load what this device remembers: lifetime stats, setup choices, last room.
  useEffect(() => {
    let active = true;
    void Promise.all([loadLifetime(), loadSetup(), loadLastRoom()]).then(([savedLifetime, setup, savedRoom]) => {
      if (!active) return;
      setLifetime(savedLifetime);
      setPacks(setup.packs);
      setDifficulty(setup.difficulty);
      setDoubleAgent(setup.doubleAgent);
      setCustomMissions(setup.customMissions);
      setLastRoom(savedRoom);
      setSetupLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (setupLoaded) saveSetup({ packs, difficulty, doubleAgent, customMissions });
  }, [customMissions, difficulty, doubleAgent, packs, setupLoaded]);

  // Hide a revealed mission as soon as the app leaves the foreground, so it is
  // not still showing when the phone comes back for the next player.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      setMissionVisible(false);
      setSheet((current) => (current?.kind === 'peek' ? null : current));
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    }).catch(() => {
      if (active) setReduceMotion(false);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  // Suspense beat before the reveal. Skipped when the reveal is already showing
  // (e.g. coming back from the share card) so the sound and haptic don't replay.
  useEffect(() => {
    if (stage !== 'reveal' || revealReady) return undefined;
    const timeout = setTimeout(() => {
      setRevealReady(true);
      if (soundEnabledRef.current) {
        revealPlayer.seekTo(0);
        revealPlayer.play();
      }
      hapticPattern(['heavy', 'success'], 140);
    }, reduceMotion ? 220 : 850);
    return () => clearTimeout(timeout);
  }, [reduceMotion, revealPlayer, revealReady, roundId, stage]);

  useEffect(() => {
    if (!reaction) return undefined;
    const timeout = setTimeout(() => setReaction(null), 2400);
    return () => clearTimeout(timeout);
  }, [reaction]);

  const outcome = useMemo<RoundOutcome>(
    () => ({ mode: roundMode, event: chaosEvent, bountyName, callouts, creativeName }),
    [bountyName, callouts, chaosEvent, creativeName, roundMode],
  );
  const resolvedPlayers = useMemo(() => resolvePlayers(players, callouts), [callouts, players]);
  const allMissionsVoted = resolvedPlayers.length > 0 && resolvedPlayers.every((player) => player.completed !== null);
  const inResults = stage === 'reveal' || stage === 'share' || stage === 'summary';
  const includeCurrent = inResults && revealReady && roundId > 0 && committedRoundId !== roundId && allMissionsVoted;
  const sessionStats = useMemo(
    () => (includeCurrent ? scoreRound(baseStats, players, outcome) : baseStats),
    [baseStats, includeCurrent, outcome, players],
  );
  const roundHistory = useMemo(
    () => (includeCurrent ? [...baseHistory, makeRoundRecord(baseHistory.length + 1, players, outcome)] : baseHistory),
    [baseHistory, includeCurrent, outcome, players],
  );
  const roundsPlayed = roundHistory.length;
  const currentRecord = includeCurrent ? roundHistory[roundHistory.length - 1] : null;
  // Once the round is saved to lifetime stats (wrap-up, rematch), its votes are final.
  const votesLocked = lifetimeSavedRound === roundId;

  useEffect(() => {
    if (stage !== 'reveal' || !revealReady || !allMissionsVoted) return;
    if (commentedRound.current === roundId) return;
    commentedRound.current = roundId;
    const completedCount = resolvedPlayers.filter((player) => player.completed).length;
    setCommentary(
      completedCount === 0
        ? randomItem(PERSONALITY.revealMiss)
        : completedCount > 1
          ? randomItem(PERSONALITY.revealTie)
          : randomItem(PERSONALITY.revealWin),
    );
  }, [allMissionsVoted, resolvedPlayers, revealReady, roundId, stage]);

  useEffect(() => {
    if (stage !== 'playing' || endsAt === null) return undefined;

    const updateCountdown = () => {
      const remaining = secondsRemaining(endsAt, Date.now());
      setSecondsLeft((previous) => (previous === remaining ? previous : remaining));
      if (remaining === 0) {
        setEndsAt(null);
        setRevealReady(false);
        setCommentary(randomItem(PERSONALITY.suspense));
        setSheet(null);
        setStage('reveal');
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 500);
    return () => clearInterval(interval);
  }, [endsAt, stage]);

  useEffect(() => {
    if (reduceMotion) {
      screenOpacity.setValue(1);
      screenOffset.setValue(0);
      return undefined;
    }
    screenOpacity.setValue(0);
    screenOffset.setValue(14);
    const transition = Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(screenOffset, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    transition.start();
    return () => transition.stop();
  }, [reduceMotion, screenOffset, screenOpacity, stage]);

  useEffect(() => {
    if (stage !== 'home' || reduceMotion) return undefined;
    const floatAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(heroFloat, {
          toValue: -9,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(heroFloat, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    floatAnimation.start();
    return () => floatAnimation.stop();
  }, [heroFloat, reduceMotion, stage]);

  useEffect(() => {
    if (stage !== 'playing' || reduceMotion) return undefined;
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, {
          toValue: 0.35,
          duration: 550,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(livePulse, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [livePulse, reduceMotion, stage]);

  useEffect(() => {
    if (stage === 'deal' && missionVisible) {
      playSound(secretPlayer);
      hapticPattern(['tick', 'success'], 90);
    }
  }, [missionVisible, playSound, secretPlayer, stage]);

  // Final ten seconds: a tick sound and a heartbeat, in step with the ring's pulse.
  useEffect(() => {
    if (stage !== 'playing' || secondsLeft > 10 || secondsLeft <= 0) return;
    if (tickedSecond.current === secondsLeft) return;
    tickedSecond.current = secondsLeft;
    playTap();
    hapticPattern(secondsLeft <= 3 ? ['heavy', 'heavy'] : ['heavy', 'tick'], 120);
  }, [playTap, secondsLeft, stage]);

  const gameDurationSeconds = roundDurationSeconds(roundMode, duration);
  const elapsedSeconds = Math.max(0, gameDurationSeconds - secondsLeft);
  const pastHalfway = stage === 'playing' && isPastHalfway(elapsedSeconds, gameDurationSeconds);

  // Swap chaos rule: halfway through, the two chosen players trade missions.
  useEffect(() => {
    if (!pastHalfway || !swapPair || swapped) return;
    setSwapped(true);
    setPlayers((current) => applySwap(current, swapPair));
    hapticPattern(['heavy', 'tick', 'heavy'], 120);
  }, [pastHalfway, swapPair, swapped]);

  // A new call-out lands: everyone sees BUSTED (or the wrong call).
  useEffect(() => {
    if (callouts.length <= shownCallouts.current) {
      shownCallouts.current = callouts.length;
      return;
    }
    shownCallouts.current = callouts.length;
    const latest = callouts[callouts.length - 1];
    const suspect = playersRef.current.find((player) => sameName(player.name, latest.suspect));
    bustKey.current += 1;
    setBust({
      key: bustKey.current,
      correct: latest.correct,
      accuser: latest.accuser,
      suspect: latest.suspect,
      mission: suspect?.mission ?? '',
    });
  }, [callouts]);

  const registerCallout = useCallback((accuser: string, suspect: string, guess: string) => {
    if (stageRef.current !== 'playing') return;
    setCallouts((current) => {
      const callout = resolveCallout(playersRef.current, current, accuser, suspect, guess);
      return callout ? [...current, callout] : current;
    });
  }, []);

  const onGuestCallout = useCallback((message: CalloutMessage) => {
    if (message.roundId !== roundIdRef.current) return;
    registerCallout(message.accuser, message.suspect, message.guess);
  }, [registerCallout]);

  const lifetimeKey = playerKey(roomNameInput);
  const roomAvatar = roomAvatarPick ?? lifetime[lifetimeKey]?.avatar ?? PLAYER_AVATARS[0];

  const roomPhase: RoomPhase =
    stage === 'deal' || stage === 'ready'
      ? 'missions'
      : stage === 'playing'
        ? 'playing'
        : stage === 'reveal' || stage === 'share' || stage === 'summary'
          ? 'reveal'
          : 'lobby';
  const roomSnapshot = useMemo<HostSnapshot | null>(() => {
    if (!room) return null;
    const scores = Object.entries(sessionStats)
      .map(([key, stats]) => ({
        name: players.find((player) => playerKey(player.name) === key)?.name ?? key,
        score: stats.score,
        streak: stats.streak,
      }))
      .sort((left, right) => right.score - left.score);
    return {
      phase: roomPhase,
      roundId,
      mode: roundMode,
      durationSeconds: roundDurationSeconds(roundMode, duration),
      chaosEventId: chaosEvent?.id ?? null,
      players: roomPhase === 'lobby' ? [] : resolvedPlayers,
      hostReady,
      endsAt: roomPhase === 'playing' ? endsAt : null,
      revealReady,
      roundsPlayed,
      scores: roundsPlayed > 0 ? scores : [],
      callouts,
      bountyName,
      swapPair,
      swapped,
      creativeName,
      deniedNames,
    };
  }, [bountyName, callouts, chaosEvent, creativeName, deniedNames, duration, endsAt, hostReady, players, resolvedPlayers, revealReady, room, roomPhase, roundId, roundMode, roundsPlayed, sessionStats, swapPair, swapped]);
  const hostRoom = useHostRoom(room, roomSnapshot, onGuestCallout);
  // Two hosts drew the same code: the newer one quietly switches to a fresh code.
  useEffect(() => {
    if (!hostRoom.codeTaken) return;
    setRoom((current) => (current ? { ...current, code: makeRoomCode() } : current));
  }, [hostRoom.codeTaken]);
  const roomMemberNames = useMemo(() => hostRoom.members.map((member) => member.name), [hostRoom.members]);
  const setupNames = room ? roomMemberNames : names;
  const { validNames, hasDuplicateNames, canStart } = useMemo(() => checkPlayerNames(setupNames), [setupNames]);
  const currentPlayer = players[currentPlayerIndex];
  const completedPlayers = resolvedPlayers.filter((player) => player.completed);
  const winners = completedPlayers;
  const sessionEntries = Object.entries(sessionStats)
    .map(([key, stats]) => {
      const player = players.find((entry) => playerKey(entry.name) === key);
      return {
        key,
        name: player?.name ?? key,
        avatar: player?.avatar,
        stats,
        before: includeCurrent ? (baseStats[key]?.score ?? 0) : stats.score,
      };
    })
    .sort((left, right) => right.stats.score - left.stats.score || right.stats.wins - left.stats.wins);
  const sessionHighScore = Math.max(0, ...sessionEntries.map(({ stats }) => stats.score));
  const sessionLeaders = sessionEntries.filter(({ stats }) => stats.score === sessionHighScore && stats.wins + stats.callsRight > 0);
  const roundIsTie = allMissionsVoted && completedPlayers.length > 1;
  const ruleSecondsLeft = chaosRuleSecondsLeft(chaosEvent, elapsedSeconds);
  const hostPlayer = room ? resolvedPlayers.find((player) => sameName(player.name, room.hostName)) : undefined;
  const hasDoubleAgent = players.some((player) => player.role === 'double-agent');
  const doubleAgentAllowed = validNames.length >= MIN_PLAYERS_FOR_DOUBLE_AGENT;

  const avatarFor = (name: string, index: number) => {
    return avatarPicks[index] ?? lifetime[playerKey(name)]?.avatar ?? PLAYER_AVATARS[index % PLAYER_AVATARS.length];
  };

  const showBadges = (before: Lifetime, after: Lifetime) => {
    setLifetime(after);
    const earned = newBadges(before, after);
    if (earned.length) setBadgeNotices((queue) => [...queue, ...earned]);
  };

  const saveRoundToLifetime = () => {
    if (!currentRecord || lifetimeSavedRound === roundId) return;
    setLifetimeSavedRound(roundId);
    const record = currentRecord;
    void updateLifetime((current) => applyRoundToLifetime(current, record)).then(({ before, after }) => showBadges(before, after));
  };

  const beginRound = (roundPlayers: string[], mode: GameMode, avatars: Record<string, string>) => {
    const dealt = dealRound(roundPlayers, mode, {
      packs,
      difficulty,
      customMissions,
      doubleAgent: doubleAgent && roundPlayers.length >= MIN_PLAYERS_FOR_DOUBLE_AGENT,
      avatars,
    });
    setRoundMode(mode);
    setChaosEvent(dealt.event);
    setBountyName(dealt.bountyName);
    setSwapPair(dealt.swapPair);
    setSwapped(false);
    setCallouts([]);
    setCreativeName(null);
    setDeniedNames([]);
    setRoundId((previous) => previous + 1);
    Keyboard.dismiss();
    setPlayers(dealt.players);
    setCurrentPlayerIndex(0);
    setMissionVisible(false);
    setRevealReady(false);
    setEndsAt(null);
    setSecondsLeft(0);
    setCommentary(randomItem(PERSONALITY.nextRound));
    setReaction(null);
    setHostReady(false);
    setSheet(null);
    setBust(null);
    setStage('deal');
  };

  // Folds the finished round into the session before the next one starts.
  const commitRound = () => {
    if (!includeCurrent) return;
    saveRoundToLifetime();
    setBaseStats(sessionStats);
    setBaseHistory(roundHistory);
    setCommittedRoundId(roundId);
  };

  const roomAvatars = () => {
    const avatars: Record<string, string> = {};
    for (const member of hostRoom.members) {
      if (member.avatar) avatars[playerKey(member.name)] = member.avatar;
    }
    if (room) avatars[playerKey(room.hostName)] = room.avatar;
    return avatars;
  };

  const startDealing = () => {
    saveRoundToLifetime();
    setBaseStats(emptySessionStats(validNames));
    setBaseHistory([]);
    setMotn(null);
    if (room) {
      beginRound(validNames, selectedMode, roomAvatars());
      return;
    }
    const avatars = Object.fromEntries(
      names.flatMap((name, index) => (name.trim() ? [[playerKey(name), avatarFor(name, index)]] : [])),
    );
    void updateLifetime((current) =>
      validNames.reduce((next, name) => setLifetimeAvatar(next, name, avatars[playerKey(name)]), current),
    ).then(({ after }) => setLifetime(after));
    beginRound(validNames, selectedMode, avatars);
  };

  const rematch = () => {
    if (!room) {
      commitRound();
      beginRound(
        players.map((player) => player.name),
        roundMode,
        Object.fromEntries(players.map((player) => [playerKey(player.name), player.avatar])),
      );
      return;
    }
    // In a room, deal to whoever is connected now (people may have joined or left).
    const current = checkPlayerNames(roomMemberNames);
    if (!current.canStart) {
      Alert.alert(
        'Not enough players',
        current.hasDuplicateNames
          ? 'Two people in the room share a name. Ask one of them to rejoin with a different name.'
          : 'A room needs 3–10 people connected to deal a round.',
      );
      return;
    }
    commitRound();
    beginRound(current.validNames, roundMode, roomAvatars());
  };

  const finishDealing = () => {
    if (room) {
      setHostReady(true);
      return;
    }
    if (currentPlayerIndex === players.length - 1) {
      setStage('ready');
    } else {
      setCurrentPlayerIndex((index) => index + 1);
      setMissionVisible(false);
    }
  };

  const startTimer = () => {
    const deadline = Date.now() + gameDurationSeconds * 1000;
    tickedSecond.current = null;
    setEndsAt(deadline);
    setSecondsLeft(gameDurationSeconds);
    setStage('playing');
    hapticPattern(['heavy', 'success'], 120);
  };

  const showReveal = useCallback(() => {
    // The confirm dialog can still be open when the timer runs out on its own.
    if (stageRef.current !== 'playing') return;
    setEndsAt(null);
    setRevealReady(false);
    setCommentary(randomItem(PERSONALITY.suspense));
    setSheet(null);
    setStage('reveal');
  }, []);

  const finishEarly = useCallback(() => {
    Alert.alert('End the game?', 'The missions will be revealed to everyone.', [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'Reveal missions', style: 'destructive', onPress: showReveal },
    ]);
  }, [showReveal]);

  const closeRoom = useCallback(() => {
    Alert.alert('Close the room?', 'Everyone in the room will be disconnected.', [
      { text: 'Keep it open', style: 'cancel' },
      {
        text: 'Close room',
        style: 'destructive',
        onPress: () => {
          setRoom(null);
          setStage('home');
        },
      },
    ]);
  }, []);

  const openSheet = (next: NonNullable<SheetState>) => {
    setSheetKey((key) => key + 1);
    setSheet(next);
  };

  // Android back: close overlays first, step back where that is safe, and never
  // drop a round in progress.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (bust) {
        setBust(null);
        return true;
      }
      if (sheet) {
        setSheet(null);
        return true;
      }
      switch (stage) {
        case 'home':
          return false;
        case 'guest':
          // The guest screen handles back itself (it never drops you out of a room).
          return false;
        case 'room-start':
        case 'fame':
          setStage('home');
          return true;
        case 'setup':
          if (room) closeRoom();
          else setStage('home');
          return true;
        case 'share':
        case 'summary':
          setStage('reveal');
          return true;
        case 'playing':
          finishEarly();
          return true;
        default:
          return true;
      }
    });
    return () => subscription.remove();
  }, [bust, closeRoom, finishEarly, room, sheet, stage]);

  const setMissionOutcome = (name: string, completed: boolean) => {
    if (votesLocked) return;
    setPlayers((currentPlayers) =>
      currentPlayers.map((player) => (sameName(player.name, name) ? { ...player, completed } : player)),
    );
    haptic(completed ? 'success' : 'error');
  };

  // The target disputes a "they did it" vote: the mission goes back to a re-vote, once.
  const denyMission = (player: Player) => {
    if (votesLocked || deniedNames.some((name) => sameName(name, player.name))) return;
    setDeniedNames((current) => [...current, player.name]);
    setPlayers((currentPlayers) =>
      currentPlayers.map((entry) => (sameName(entry.name, player.name) ? { ...entry, completed: null } : entry)),
    );
    if (creativeName && sameName(creativeName, player.name)) setCreativeName(null);
    haptic('warning');
  };

  const sendReaction = (kind: keyof typeof PERSONALITY.reactions, playerName: string) => {
    reactionId.current += 1;
    setReaction({
      id: reactionId.current,
      message: `${playerName}: “${randomItem(PERSONALITY.reactions[kind])}”`,
    });
    haptic('tap');
  };

  const shareMessage = makeShareMessage(resolvedPlayers, winners, roundMode, chaosEvent, callouts);

  const shareResults = async () => {
    // A double tap would otherwise open the image sheet and then the text fallback.
    if (sharingRef.current) return;
    sharingRef.current = true;
    try {
      if (!shareCardRef.current) throw new Error('The share card is not ready yet.');
      const imageUri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your LOWKEY reveal',
          UTI: 'public.png',
        });
      } else {
        await Share.share({ message: shareMessage });
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('Image sharing is unavailable; sharing the text reveal instead.', error);
      }
      try {
        await Share.share({ message: shareMessage });
      } catch (shareError) {
        const message = shareError instanceof Error ? shareError.message : 'Please try sharing again.';
        Alert.alert('Could not share the reveal', message);
      }
    } finally {
      sharingRef.current = false;
    }
  };

  // Android doesn't scroll a focused field above the keyboard on its own here, so
  // move the row to the top of the visible area, which the keyboard never covers.
  const scrollNameIntoView = (index: number) => {
    const rowY = nameRowY.current[index] ?? 0;
    setupScrollRef.current?.scrollTo({
      y: Math.max(0, nameListY.current + rowY - 16),
      animated: !reduceMotion,
    });
  };

  const roomName = roomNameInput.trim();
  const roomCode = normalizeRoomCode(roomCodeInput);

  const createRoom = () => {
    Keyboard.dismiss();
    void updateLifetime((current) => setLifetimeAvatar(current, roomName, roomAvatar)).then(({ after }) => setLifetime(after));
    setRoom({ code: makeRoomCode(), hostId: makeMemberId(), hostName: roomName, joinedAt: Date.now(), avatar: roomAvatar });
    setStage('setup');
  };

  const enterGuestRoom = (join: GuestJoin) => {
    Keyboard.dismiss();
    saveLastRoom({ ...join, savedAt: Date.now() });
    setGuestJoin(join);
    setStage('guest');
  };

  const joinRoom = () => {
    void updateLifetime((current) => setLifetimeAvatar(current, roomName, roomAvatar)).then(({ after }) => setLifetime(after));
    // Same code and name as the saved seat: keep the same identity so the room
    // treats this as the same phone coming back.
    const sameSeat = lastRoom && lastRoom.code === roomCode && sameName(lastRoom.name, roomName);
    enterGuestRoom({
      code: roomCode,
      name: roomName,
      memberId: sameSeat ? lastRoom.memberId : makeMemberId(),
      avatar: roomAvatar,
    });
  };

  const startFreshSession = () => {
    saveRoundToLifetime();
    setNames(players.map((player) => player.name));
    setAvatarPicks(players.map((player) => player.avatar));
    setSelectedMode(roundMode);
    setStage('setup');
  };

  const wrapSession = () => {
    saveRoundToLifetime();
    setStage('summary');
  };

  const crownMission = (candidate: { key: string; name: string }) => {
    if (motn) return;
    setMotn(candidate);
    hapticPattern(['heavy', 'success'], 140);
    void updateLifetime((current) => crownMissionOfTheNight(current, candidate.name)).then(({ before, after }) =>
      showBadges(before, after),
    );
  };

  const addCustomMission = () => {
    const mission = cleanCustomMission(customDraft);
    if (!mission || customMissions.length >= MAX_CUSTOM_MISSIONS) return;
    if (customMissions.some((existing) => existing.toLocaleLowerCase() === mission.toLocaleLowerCase())) {
      setCustomDraft('');
      return;
    }
    setCustomMissions((current) => [...current, mission]);
    setCustomDraft('');
    haptic('success');
  };

  const togglePack = (pack: PackId) => {
    setPacks((current) => {
      if (current.includes(pack)) return current.length === 1 ? current : current.filter((id) => id !== pack);
      return [...current, pack];
    });
  };

  const chaosStatus = (event: ChaosEvent) => {
    if (event.activeSeconds) {
      return ruleSecondsLeft > 0 ? `${event.activeText} for ${ruleSecondsLeft}s more!` : event.afterText ?? '';
    }
    switch (event.id) {
      case 'double-down':
        return 'Completed missions are worth double.';
      case 'bounty':
        return `🎯 ${bountyName ?? 'The bounty'}’s mission is worth triple. Stop them.`;
      case 'swap':
        if (!swapped) return `Two players swap missions at halfway (${formatClock(Math.ceil(gameDurationSeconds / 2))} left).`;
        return room ? '🔀 Two players just traded missions.' : `🔀 ${swapPair?.join(' & ')} traded missions!`;
      case 'reverse':
        return 'Tempt, don’t complete. Your target must resist all round.';
      default:
        return event.instruction;
    }
  };

  const sessionLeaderboard = (withDetail: boolean) =>
    sessionEntries.map(({ name, avatar, stats, before }) => {
      const title = playerTitle(stats, sessionLeaders.some((leader) => leader.name === name));
      return {
        name,
        avatar,
        score: stats.score,
        from: before,
        streak: stats.streak,
        detail: withDetail
          ? `${stats.wins} ${stats.wins === 1 ? 'mission' : 'missions'} · ${stats.callsRight} call-outs won · best streak ${stats.bestStreak}${title ? ` · ${title}` : ''}`
          : undefined,
      };
    });

  const fameEntries = Object.values(lifetime)
    .filter((stats) => stats.rounds > 0)
    .sort((left, right) => right.points - left.points);
  const motnCandidates = roundHistory.flatMap((round) =>
    round.results
      .filter((result) => result.completed && result.role === 'agent')
      .map((result) => ({ key: `${round.round}-${playerKey(result.name)}`, name: result.name, avatar: result.avatar, mission: result.mission, round: round.round })),
  );
  const swapNames = swapPair && swapped ? swapPair : null;
  const iAmSwapped = Boolean(swapNames && (!room || swapNames.some((name) => sameName(name, room.hostName))));
  const activeNotice = badgeNotices[0];

  const missionOutcome = { mode: roundMode, event: chaosEvent, bountyName };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      {stage === 'playing' && <KeepScreenAwake />}
      {stage === 'deal' && <ProtectMissions />}
      {sheet && <ProtectMissions tag="mission-sheet" />}
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>L</Text>
          </View>
          <Text style={styles.brandName}>LOWKEY</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          accessibilityState={{ selected: soundEnabled }}
          onPress={() => {
            if (soundEnabled) {
              // Stop anything still playing so muting takes effect immediately.
              for (const player of [tapPlayer, secretPlayer, revealPlayer]) player.pause();
            } else {
              tapPlayer.seekTo(0);
              tapPlayer.play();
            }
            setSoundEnabled(!soundEnabled);
          }}
          style={styles.soundToggle}
        >
          <Text style={styles.soundToggleText}>{soundEnabled ? '♫' : '♪̸'}</Text>
        </Pressable>
        <Text style={styles.topTag}>DO IT. DON’T GET CAUGHT.</Text>
      </View>

      <Animated.View
        style={[
          styles.screen,
          { opacity: screenOpacity, transform: [{ translateY: screenOffset }] },
        ]}
      >
      {stage === 'home' && (
        <ScrollView contentContainerStyle={styles.homeContent}>
          <View style={styles.hero}>
            <View style={styles.heroSticker}>
              <Text style={styles.stickerText}>👀 KEEP A STRAIGHT FACE</Text>
            </View>
            <Text style={styles.heroTitle}>Do it.{'\n'}Don’t get caught.</Text>
            <Text style={styles.heroCopy}>
              Secret missions. Your real friends. One very suspicious hangout.
            </Text>
            <Animated.View style={[styles.heroDoodle, { transform: [{ translateY: heroFloat }] }]}>
              <Text style={styles.doodleText}>🤫</Text>
              <View style={styles.doodleBubble}>
                <Text style={styles.bubbleText}>“Just say pizza…”</Text>
              </View>
            </Animated.View>
          </View>

          <PrimaryButton label="LET’S PLAY  →" onPressIn={playTap} onPress={() => setStage('setup')} />
          <PrimaryButton
            label="PRIVATE ROOM · EVERYONE’S PHONE"
            onPressIn={playTap}
            onPress={() => setStage('room-start')}
            secondary
          />
          <PrimaryButton label="🏅  HALL OF FAME" onPressIn={playTap} onPress={() => setStage('fame')} secondary />
          <View style={styles.howCard}>
            <Eyebrow>THE WHOLE GAME</Eyebrow>
            <View style={styles.stepRow}>
              <Text style={styles.stepNumber}>01</Text>
              <Text style={styles.stepText}>Get a secret mission. Keep it secret.</Text>
            </View>
            <View style={styles.stepRow}>
              <Text style={styles.stepNumber}>02</Text>
              <Text style={styles.stepText}>Pull it off. Think someone’s after you? Call it out.</Text>
            </View>
            <View style={[styles.stepRow, styles.lastStep]}>
              <Text style={styles.stepNumber}>03</Text>
              <Text style={styles.stepText}>Reveal everything. Swipe to vote. Accuse your friends.</Text>
            </View>
          </View>
          <Text style={styles.homeNote}>3–10 PLAYERS · ONE PHONE OR A PRIVATE ROOM · NO ACCOUNTS</Text>
        </ScrollView>
      )}

      {stage === 'fame' && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <Eyebrow>ON THIS PHONE</Eyebrow>
          <Text style={styles.pageTitle}>Hall of Fame.</Text>
          <Text style={styles.pageCopy}>Lifetime stats and badges. Each badge unlocks a new avatar.</Text>
          {fameEntries.length === 0 && (
            <View style={styles.roomCard}>
              <Text style={styles.roomCardCopy}>Nobody’s here yet. Finish a round and the legends start forming.</Text>
            </View>
          )}
          {fameEntries.map((stats, index) => {
            const earned = new Set(earnedBadges(stats).map((badge) => badge.id));
            return (
              <Entrance index={index} key={playerKey(stats.name)} style={styles.fameCard}>
                <View style={styles.fameTop}>
                  <Text style={styles.fameAvatar}>{stats.avatar ?? PLAYER_AVATARS[0]}</Text>
                  <View style={styles.modeCopy}>
                    <Text style={styles.fameName}>{stats.name}</Text>
                    <Text style={styles.fameStats}>
                      {stats.points.toLocaleString()} pts · {stats.rounds} rounds · {stats.missions} missions ·{' '}
                      {stats.callsRight} call-outs · best streak {stats.bestStreak}
                    </Text>
                  </View>
                </View>
                <View style={styles.badgeGrid}>
                  {BADGES.map((badge) => (
                    <View
                      accessibilityLabel={`${badge.name}: ${earned.has(badge.id) ? 'earned' : badge.description}`}
                      key={badge.id}
                      style={[styles.badge, !earned.has(badge.id) && styles.badgeLocked]}
                    >
                      <Text style={styles.badgeEmoji}>{earned.has(badge.id) ? badge.avatar : '🔒'}</Text>
                      <Text style={styles.badgeName}>{badge.name}</Text>
                      {!earned.has(badge.id) && <Text style={styles.badgeHint}>{badge.description}</Text>}
                    </View>
                  ))}
                </View>
              </Entrance>
            );
          })}
          {fameEntries.length > 0 && (
            <Pressable
              onPress={() =>
                Alert.alert('Clear the Hall of Fame?', 'All lifetime stats and badges on this phone will be deleted.', [
                  { text: 'Keep them', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      void clearLifetime().then(() => setLifetime({}));
                    },
                  },
                ])
              }
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>CLEAR HALL OF FAME</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setStage('home')} style={styles.backLink}>
            <Text style={styles.backLinkText}>←  BACK</Text>
          </Pressable>
        </ScrollView>
      )}

      {stage === 'room-start' && (
        <KeyboardAvoidingView behavior="padding" style={styles.screen}>
          <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
            <Eyebrow>PRIVATE ROOM</Eyebrow>
            <Text style={styles.pageTitle}>Everyone on their own phone.</Text>
            <Text style={styles.pageCopy}>
              One person hosts and shares a room code. Each player’s mission shows up privately on their own
              phone, and the host runs the timer and the vote.
            </Text>
            {!roomsConfigured ? (
              <View style={styles.roomCard}>
                <Eyebrow>NOT SET UP YET</Eyebrow>
                <Text style={styles.roomCardCopy}>
                  Private rooms need a Supabase project. Add EXPO_PUBLIC_SUPABASE_URL and
                  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local (see the README), then restart the app.
                </Text>
              </View>
            ) : (
              <>
                {lastRoom && (
                  <View style={styles.roomCard}>
                    <Eyebrow>DROPPED OUT?</Eyebrow>
                    <Text style={styles.roomCardCopy}>
                      Jump back into room {lastRoom.code} as {lastRoom.name}. Your mission and seat are still there.
                    </Text>
                    <PrimaryButton
                      label={`REJOIN ${lastRoom.code}  →`}
                      onPressIn={playTap}
                      onPress={() =>
                        enterGuestRoom({
                          code: lastRoom.code,
                          name: lastRoom.name,
                          memberId: lastRoom.memberId,
                          avatar: lastRoom.avatar || PLAYER_AVATARS[0],
                        })
                      }
                    />
                  </View>
                )}
                <View style={[styles.nameInputRow, styles.roomInput]}>
                  <AvatarPicker
                    label="Your"
                    onChange={setRoomAvatarPick}
                    options={unlockedAvatars(lifetime[lifetimeKey])}
                    value={roomAvatar}
                  />
                  <TextInput
                    accessibilityLabel="Your name"
                    autoCapitalize="words"
                    maxLength={24}
                    onChangeText={(value) => {
                      setRoomNameInput(value);
                      setRoomAvatarPick(null);
                    }}
                    placeholder="Your name"
                    placeholderTextColor="#A0A59E"
                    returnKeyType="done"
                    style={styles.nameInput}
                    value={roomNameInput}
                  />
                </View>
                <PrimaryButton
                  label="HOST A ROOM  →"
                  disabled={!roomName}
                  onPressIn={playTap}
                  onPress={createRoom}
                />
                <View style={styles.roomDivider}>
                  <Text style={styles.roomDividerText}>OR JOIN A FRIEND’S ROOM</Text>
                </View>
                <View style={styles.nameInputRow}>
                  <TextInput
                    accessibilityLabel="Room code"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={6}
                    onChangeText={(value) => setRoomCodeInput(normalizeRoomCode(value))}
                    placeholder="Room code"
                    placeholderTextColor="#A0A59E"
                    returnKeyType="join"
                    style={[styles.nameInput, roomCodeInput ? styles.codeInput : null]}
                    value={roomCodeInput}
                  />
                </View>
                <PrimaryButton
                  label="JOIN ROOM"
                  disabled={!roomName || !isValidRoomCode(roomCode)}
                  onPressIn={playTap}
                  onPress={joinRoom}
                  secondary
                />
                {!roomName && <Text style={styles.voteHint}>Enter your name to host or join.</Text>}
              </>
            )}
            <Pressable onPress={() => setStage('home')} style={styles.backLink}>
              <Text style={styles.backLinkText}>←  BACK</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {stage === 'guest' && guestJoin && (
        <GuestRoom
          avatar={guestJoin.avatar}
          code={guestJoin.code}
          memberId={guestJoin.memberId}
          name={guestJoin.name}
          onExit={(keepSeat) => {
            if (!keepSeat) saveLastRoom(null);
            void loadLastRoom().then(setLastRoom);
            void loadLifetime().then(setLifetime);
            setGuestJoin(null);
            setStage('room-start');
          }}
        />
      )}

      {stage === 'setup' && (
        // Android draws edge-to-edge, so the window no longer resizes for the
        // keyboard; padding keeps the lower name fields scrollable above it.
        <KeyboardAvoidingView behavior="padding" style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.pageContent}
          keyboardShouldPersistTaps="handled"
          ref={setupScrollRef}
        >
          <Eyebrow>{room ? 'PRIVATE ROOM · YOU’RE THE HOST' : 'FIRST, GATHER YOUR CREW'}</Eyebrow>
          <Text style={styles.pageTitle}>Who’s in?</Text>
          <Text style={styles.pageCopy}>
            {room
              ? 'Friends open LOWKEY, tap Private room, and join with this code. 3–10 people, you included.'
              : 'Add 3–10 people. Tap an avatar to change it. Pass one phone around to deal missions.'}
          </Text>

          {room && (
            <View style={styles.roomCard}>
              <View style={styles.roomCardTop}>
                <Eyebrow>ROOM CODE</Eyebrow>
                <Text style={[styles.roomStatus, hostRoom.status !== 'live' && styles.roomStatusBad]}>
                  {hostRoom.status === 'live' ? '● LIVE' : hostRoom.status === 'offline' ? 'RECONNECTING…' : 'CONNECTING…'}
                </Text>
              </View>
              <Text accessibilityLabel={`Room code ${room.code.split('').join(' ')}`} style={styles.roomCode}>
                {room.code}
              </Text>
              <Eyebrow>IN THE ROOM · {hostRoom.members.length}</Eyebrow>
              {hostRoom.members.map((member, index) => (
                <Entrance index={index} key={member.id}>
                  <Text style={styles.roomMember}>
                    {member.role === 'host' ? room.avatar : member.avatar ?? '😎'}  {member.name}
                    {member.role === 'host' ? '  · HOST (YOU)' : ''}
                  </Text>
                </Entrance>
              ))}
            </View>
          )}

          {!room && (
          <>
          <View
            onLayout={(event) => {
              nameListY.current = event.nativeEvent.layout.y;
            }}
            style={styles.nameList}
          >
            {names.map((name, index) => (
              <View
                key={`player-${index}`}
                onLayout={(event) => {
                  nameRowY.current[index] = event.nativeEvent.layout.y;
                }}
                style={styles.nameInputRow}
              >
                <AvatarPicker
                  label={name.trim() || `Player ${index + 1}`}
                  onChange={(avatar) =>
                    setAvatarPicks((current) => {
                      const next = [...current];
                      next[index] = avatar;
                      return next;
                    })
                  }
                  options={unlockedAvatars(lifetime[playerKey(name)])}
                  value={avatarFor(name, index)}
                />
                <TextInput
                  accessibilityLabel={`Player ${index + 1} name`}
                  autoCapitalize="words"
                  maxLength={24}
                  onFocus={() => scrollNameIntoView(index)}
                  onChangeText={(value) =>
                    setNames((currentNames) =>
                      currentNames.map((currentName, currentIndex) =>
                        currentIndex === index ? value : currentName,
                      ),
                    )
                  }
                  placeholder={`Player ${index + 1}`}
                  placeholderTextColor="#A0A59E"
                  returnKeyType="done"
                  style={styles.nameInput}
                  value={name}
                />
                {names.length > 3 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove player ${index + 1}`}
                    hitSlop={10}
                    onPress={() => {
                      setNames((currentNames) => currentNames.filter((_, i) => i !== index));
                      setAvatarPicks((current) => current.filter((_, i) => i !== index));
                    }}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>×</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
          {names.length < 10 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setNames((currentNames) => [...currentNames, ''])}
              style={styles.addPlayer}
            >
              <Text style={styles.addPlayerText}>＋  ADD A PLAYER</Text>
            </Pressable>
          )}
          </>
          )}
          {hasDuplicateNames && <Text style={styles.validationText}>Each player needs a different name.</Text>}
          {validNames.length < 3 && (
            <Text style={styles.validationText}>
              {room ? 'Waiting for at least 3 people in the room.' : 'Add at least 3 names to start a game.'}
            </Text>
          )}
          {validNames.length > 10 && (
            <Text style={styles.validationText}>A room can have up to 10 players.</Text>
          )}

          <View style={styles.modeBlock}>
            <Eyebrow>PICK YOUR KIND OF TROUBLE</Eyebrow>
            <View style={styles.modeList}>
              {MODE_OPTIONS.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedMode === option.id }}
                  key={option.id}
                  onPressIn={playTap}
                  onPress={() => {
                    haptic('select');
                    setSelectedMode(option.id);
                  }}
                  style={[styles.modeOption, selectedMode === option.id && styles.modeSelected]}
                >
                  <Text style={styles.modeEmoji}>{option.emoji}</Text>
                  <View style={styles.modeCopy}>
                    <Text style={styles.modeTitle}>{option.title}</Text>
                    <Text style={styles.modeDescription}>{option.description}</Text>
                  </View>
                  <Text style={styles.modeCheck}>{selectedMode === option.id ? '●' : '○'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {selectedMode !== 'sudden-death' && (
            <View style={styles.durationBlock}>
              <Eyebrow>HOW LONG IS THE CHAOS?</Eyebrow>
              <View style={styles.durationOptions}>
                {[3, 5, 10].map((minutes) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: duration === minutes }}
                    key={minutes}
                    onPressIn={playTap}
                    onPress={() => {
                      haptic('select');
                      setDuration(minutes);
                    }}
                    style={[styles.durationOption, duration === minutes && styles.durationSelected]}
                  >
                    <Text style={[styles.durationNumber, duration === minutes && styles.durationNumberSelected]}>
                      {minutes}
                    </Text>
                    <Text style={[styles.durationUnit, duration === minutes && styles.durationNumberSelected]}>
                      MIN
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.optionBlock}>
            <Eyebrow>MISSION PACKS</Eyebrow>
            <View style={styles.chipRow}>
              {PACK_OPTIONS.map((pack) => {
                const selected = packs.includes(pack.id);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    key={pack.id}
                    onPress={() => {
                      haptic('select');
                      togglePack(pack.id);
                    }}
                    style={[styles.setupChip, selected && styles.setupChipSelected]}
                  >
                    <Text style={styles.setupChipText}>
                      {pack.emoji} {pack.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.optionBlock}>
            <Eyebrow>DIFFICULTY · EASY 500 · MEDIUM 1,000 · HARD 2,000</Eyebrow>
            <View style={styles.segment}>
              {DIFFICULTY_OPTIONS.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: difficulty === option.id }}
                  key={option.id}
                  onPress={() => {
                    haptic('select');
                    setDifficulty(option.id);
                  }}
                  style={[styles.segmentOption, difficulty === option.id && styles.segmentSelected]}
                >
                  <Text style={styles.segmentText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: doubleAgent && doubleAgentAllowed, disabled: !doubleAgentAllowed }}
            disabled={!doubleAgentAllowed}
            onPress={() => {
              haptic('select');
              setDoubleAgent((current) => !current);
            }}
            style={[styles.modeOption, styles.optionBlock, doubleAgent && doubleAgentAllowed && styles.modeSelected]}
          >
            <Text style={styles.modeEmoji}>🕵️</Text>
            <View style={styles.modeCopy}>
              <Text style={styles.modeTitle}>DOUBLE AGENT</Text>
              <Text style={styles.modeDescription}>
                {doubleAgentAllowed
                  ? 'One player secretly sabotages someone else’s mission instead.'
                  : `Needs ${MIN_PLAYERS_FOR_DOUBLE_AGENT}+ players.`}
              </Text>
            </View>
            <Text style={styles.modeCheck}>{doubleAgent && doubleAgentAllowed ? '●' : '○'}</Text>
          </Pressable>

          <View style={styles.optionBlock}>
            <Eyebrow>HOUSE MISSIONS · {customMissions.length}/{MAX_CUSTOM_MISSIONS}</Eyebrow>
            <Text style={styles.modeDescription}>Write your own. Use @ for the target, e.g. “Get @ to moonwalk.”</Text>
            <View style={[styles.nameInputRow, styles.customRow]}>
              <TextInput
                accessibilityLabel="New house mission"
                maxLength={120}
                onChangeText={setCustomDraft}
                onSubmitEditing={addCustomMission}
                placeholder="Get @ to…"
                placeholderTextColor="#A0A59E"
                returnKeyType="done"
                style={styles.nameInput}
                value={customDraft}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!customDraft.trim() || customMissions.length >= MAX_CUSTOM_MISSIONS}
                onPress={addCustomMission}
                style={styles.customAdd}
              >
                <Text style={styles.addPlayerText}>ADD</Text>
              </Pressable>
            </View>
            {customMissions.map((mission, index) => (
              <Entrance index={0} key={mission} style={styles.customItem}>
                <Text style={styles.customText}>{mission}</Text>
                <Pressable
                  accessibilityLabel={`Remove house mission ${index + 1}`}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setCustomMissions((current) => current.filter((entry) => entry !== mission))}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </Entrance>
            ))}
          </View>

          <PrimaryButton
            label="DEAL THE MISSIONS  →"
            disabled={!canStart}
            onPressIn={playTap}
            onPress={startDealing}
          />
          <Pressable onPress={() => (room ? closeRoom() : setStage('home'))} style={styles.backLink}>
            <Text style={styles.backLinkText}>{room ? 'CLOSE THE ROOM' : '←  BACK'}</Text>
          </Pressable>
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      {stage === 'deal' && room && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <Eyebrow>MISSIONS SENT · ROOM {room.code}</Eyebrow>
          <Text style={styles.pageTitle}>Check your phones.</Text>
          <Text style={styles.pageCopy}>
            Everyone’s mission is on their own phone. Start when everyone has checked theirs.
          </Text>
          {chaosEvent && (
            <ChaosEventCard
              bountyName={bountyName}
              event={chaosEvent}
              key={`chaos-${roundId}`}
              onSpun={() => setSlotSpunRound(roundId)}
              spin={slotSpunRound !== roundId}
            />
          )}
          {hasDoubleAgent && <Text style={styles.agentNotice}>🕵️ One of you is a double agent.</Text>}
          {hostPlayer && (
            <>
              <HoldToReveal onReveal={() => setMissionVisible(true)} style={styles.dealCard}>
                <MissionBody event={chaosEvent} hint={false} outcome={missionOutcome} player={hostPlayer} />
              </HoldToReveal>
              {hostReady ? (
                <Text style={styles.readyNote}>✓ You’re ready. Hold the card any time to look again.</Text>
              ) : (
                <PrimaryButton
                  label={missionVisible ? 'GOT IT  ✓' : 'HOLD THE CARD FIRST'}
                  disabled={!missionVisible}
                  onPressIn={playTap}
                  onPress={finishDealing}
                />
              )}
            </>
          )}
          <View style={styles.roomCard}>
            <Eyebrow>
              READY · {players.filter((player) => isReady(hostRoom.readyNames, player.name)).length} OF {players.length}
            </Eyebrow>
            {players.map((player) => {
              const connected = roomMemberNames.some((name) => playerKey(name) === playerKey(player.name));
              return (
                <Text key={player.name} style={styles.roomMember}>
                  {isReady(hostRoom.readyNames, player.name) ? '✓' : '…'}  {player.avatar} {player.name}
                  {connected ? '' : '  · DISCONNECTED'}
                </Text>
              );
            })}
          </View>
          <PrimaryButton
            label="START THE CHAOS  →"
            disabled={!everyoneReady(players, hostRoom.readyNames)}
            onPressIn={playTap}
            onPress={startTimer}
          />
          {!everyoneReady(players, hostRoom.readyNames) && (
            <Pressable onPressIn={playTap} onPress={startTimer} style={styles.backLink}>
              <Text style={styles.backLinkText}>START WITHOUT WAITING</Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      {stage === 'deal' && !room && currentPlayer && (
        <View style={styles.screen}>
          <View style={styles.progressHeader}>
            <Eyebrow>PRIVATE MISSION · {currentPlayerIndex + 1} OF {players.length}</Eyebrow>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${((currentPlayerIndex + 1) / players.length) * 100}%` },
                ]}
              />
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.centerPage}>
          <Entrance key={`handoff-${roundId}-${currentPlayerIndex}`} style={styles.phoneHandoff}>
            <Text style={styles.handoffEmoji}>{currentPlayer.avatar}</Text>
            <Text style={styles.handoffTitle}>Pass the phone to</Text>
            <Text style={styles.handoffName}>{currentPlayer.name}</Text>
            <Text style={styles.pageCopy}>Make sure nobody else can see the screen.</Text>
            <Text style={styles.privateNudge}>
              {currentPlayerIndex === 0
                ? 'The other players are definitely not looking. Probably.'
                : ([
                    'No peeking. We know who you are 👀',
                    'Next suspect, step up.',
                    'Your secret is safe with this phone.',
                  ][currentPlayerIndex % 3])}
            </Text>
          </Entrance>
          <HoldToReveal
            key={`card-${roundId}-${currentPlayerIndex}`}
            onReveal={() => setMissionVisible(true)}
            style={styles.dealCard}
          >
            <MissionBody event={chaosEvent} hint={false} outcome={missionOutcome} player={currentPlayer} />
          </HoldToReveal>
          <PrimaryButton
            label={missionVisible ? 'GOT IT · PASS IT ON  →' : 'HOLD THE CARD TO SEE IT'}
            disabled={!missionVisible}
            onPressIn={playTap}
            onPress={finishDealing}
          />
          </ScrollView>
        </View>
      )}

      {stage === 'ready' && (
        <ScrollView contentContainerStyle={styles.centerPage}>
          <Text style={styles.bigEmoji}>🔐</Text>
          <Eyebrow>ALL MISSIONS ARE SEALED</Eyebrow>
          <Text style={styles.pageTitle}>Phone back in the middle.</Text>
          <Text style={styles.pageCopy}>
            Everyone has their mission. No peeking, no telling. You’ve got{' '}
            {roundMode === 'sudden-death' ? '60 seconds' : `${duration} minutes`}.
          </Text>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>
              {MODE_OPTIONS.find((option) => option.id === roundMode)?.emoji}{' '}
              {roundMode === 'sudden-death' ? 'SUDDEN DEATH' : roundMode.toUpperCase()}
            </Text>
          </View>
          {chaosEvent && (
            <ChaosEventCard
              bountyName={bountyName}
              event={chaosEvent}
              key={`chaos-${roundId}`}
              onSpun={() => setSlotSpunRound(roundId)}
              spin={slotSpunRound !== roundId}
            />
          )}
          {hasDoubleAgent && <Text style={styles.agentNotice}>🕵️ One of you is a double agent.</Text>}
          <View style={styles.readyPlayerList}>
            {players.map((player) => (
              <Text key={player.name} style={styles.readyPlayer}>
                {player.avatar} {player.name}
              </Text>
            ))}
          </View>
          <Text style={styles.voteHint}>Think someone’s working on you? Hit “Call it out” during the round.</Text>
          <PrimaryButton label="START THE CHAOS  →" onPressIn={playTap} onPress={startTimer} />
        </ScrollView>
      )}

      {stage === 'playing' && (
        <ScrollView contentContainerStyle={styles.centerPage}>
          <View style={styles.livePill}>
            <Animated.View style={[styles.liveDot, { opacity: livePulse }]} />
            <Text style={styles.liveText}>MISSIONS IN PROGRESS</Text>
          </View>
          <TimerRing secondsLeft={secondsLeft} totalSeconds={gameDurationSeconds}>
            <Text style={styles.timerLabel}>TIME LEFT</Text>
            <Text style={[styles.timer, secondsLeft <= 30 && styles.timerUrgent]}>{formatClock(secondsLeft)}</Text>
          </TimerRing>
          {roundMode === 'sudden-death' && (
            <Text style={styles.suddenDeathLabel}>ONE SHOT. NO SECOND CHANCES.</Text>
          )}
          <Text style={styles.playingHeadline}>Act natural.</Text>
          {chaosEvent && (
            <View style={[styles.activeEvent, secondsLeft <= 10 && styles.activeEventUrgent]}>
              <Text style={styles.activeEventTitle}>
                ⚡ {chaosEvent.name}
                {ruleSecondsLeft > 0 && ' · ACTIVE'}
              </Text>
              <Text style={styles.activeEventText}>{chaosStatus(chaosEvent)}</Text>
            </View>
          )}
          {swapNames && iAmSwapped && (
            <Entrance style={styles.swapCard}>
              <Eyebrow>🔀 SWAP!</Eyebrow>
              <Text style={styles.swapText}>
                {room ? 'You traded missions with someone.' : `${swapNames.join(' & ')}: you traded missions.`} Peek at
                your new one.
              </Text>
              <PrimaryButton
                label="SEE MY NEW MISSION"
                onPressIn={playTap}
                onPress={() =>
                  openSheet({
                    kind: 'peek',
                    names: room ? [room.hostName] : swapNames,
                    title: '🔀 YOUR NEW MISSION',
                  })
                }
              />
            </Entrance>
          )}
          {callouts.length > 0 && (
            <View style={styles.calloutLog}>
              {callouts.map((callout, index) => (
                <Entrance index={0} key={`${callout.accuser}-${index}`}>
                  <Text style={styles.calloutLine}>
                    {callout.correct
                      ? `🚨 ${callout.accuser} busted ${callout.suspect}`
                      : `❌ ${callout.accuser}’s call on ${callout.suspect} missed`}
                  </Text>
                </Entrance>
              ))}
            </View>
          )}
          <View style={styles.playButtons}>
            <PrimaryButton label="🚨  CALL IT OUT" onPressIn={playTap} onPress={() => openSheet({ kind: 'callout' })} />
            <PrimaryButton
              label={pastHalfway ? '💡  HINT / PEEK MY MISSION' : '🤫  PEEK MY MISSION'}
              onPressIn={playTap}
              onPress={() => openSheet({ kind: 'peek', names: room ? [room.hostName] : null })}
              secondary
            />
          </View>
          <View style={styles.playingTip}>
            <Text style={styles.tipMark}>✳</Text>
            <Text style={styles.tipText}>
              {secondsLeft <= 10
                ? 'Final seconds. This is absolutely fine. Act normal.'
                : pastHalfway
                  ? 'Hints are open. Stuck? Peek for one.'
                  : 'If they ask why, don’t tell them why.'}
            </Text>
          </View>
          <PrimaryButton label="END GAME & REVEAL" onPressIn={playTap} onPress={finishEarly} secondary />
        </ScrollView>
      )}

      {stage === 'reveal' && (
        !revealReady ? (
          <View style={styles.suspenseScreen}>
            <Text style={styles.suspenseSiren}>🚨</Text>
            <Eyebrow>MISSION REVEAL</Eyebrow>
            <Text style={styles.suspenseTitle}>Everybody act innocent.</Text>
            <Text style={styles.suspenseCopy}>{commentary}</Text>
            <View style={styles.suspenseLights}>
              <View style={[styles.suspenseLight, styles.suspenseLightOne]} />
              <View style={[styles.suspenseLight, styles.suspenseLightTwo]} />
              <View style={[styles.suspenseLight, styles.suspenseLightThree]} />
            </View>
          </View>
        ) : (
          <GestureScrollView contentContainerStyle={styles.pageContent}>
            <Entrance style={[styles.revealBanner, roundIsTie && styles.tieBanner]}>
              {/* Stay neutral until the group has voted on every mission. */}
              <Text style={styles.revealEmoji}>
                {!allMissionsVoted ? '🗳️' : roundIsTie ? '🤝' : completedPlayers.length ? '🎉' : '🫠'}
              </Text>
              <Eyebrow>{roundIsTie ? 'EVERYBODY GOT CAUGHT' : 'THE SECRET’S OUT'}</Eyebrow>
              <Text style={styles.pageTitle}>
                {!allMissionsVoted
                  ? 'Time to vote.'
                  : roundIsTie
                    ? 'Too many menaces.'
                    : completedPlayers.length
                      ? 'Mission complete!'
                      : 'Mission failed!'}
              </Text>
              <Text style={styles.comedyLine}>{commentary}</Text>
              <Text style={styles.pageCopy}>
                {!allMissionsVoted
                  ? 'Read each mission out loud. Swipe right if they pulled it off, left if not.'
                  : completedPlayers.length
                    ? `${completedPlayers.map((player) => player.name).join(' & ')} pulled it off.`
                    : 'Nobody completed their mission. The chaos was still worth it.'}
              </Text>
              {chaosEvent && (
                <Text style={styles.revealEventNote}>
                  ⚡ {chaosEvent.name} ·{' '}
                  {chaosEvent.id === 'double-down'
                    ? 'double points for each success'
                    : chaosEvent.id === 'bounty'
                      ? `${bountyName} was worth triple`
                      : 'Chaos rule survived'}
                </Text>
              )}
            </Entrance>
            {reaction && <Text accessibilityLiveRegion="polite" style={styles.reactionToast}>{reaction.message}</Text>}
            {votesLocked && <Text style={styles.voteHint}>Results are locked in for this round.</Text>}
            {resolvedPlayers.map((player, index) => {
              const caughtBy = callouts.find((callout) => callout.correct && sameName(callout.suspect, player.name));
              const votable = needsVote(player, callouts) && !votesLocked;
              const points = playerRoundPoints(player, outcome);
              const denied = deniedNames.some((name) => sameName(name, player.name));
              return (
                <Entrance index={index} key={`${roundId}-${player.name}`}>
                  <SwipeVote
                    enabled={votable && player.completed === null}
                    onVote={(completed) => setMissionOutcome(player.name, completed)}
                    style={styles.resultCard}
                  >
                    <View style={styles.resultTopLine}>
                      <View style={styles.playerIdentity}>
                        <Text style={styles.resultAvatar}>{player.avatar}</Text>
                        <Text style={styles.resultPlayer}>{player.name}</Text>
                      </View>
                      <DifficultyTag outcome={missionOutcome} player={player} />
                    </View>
                    <Text style={styles.resultMission}>{player.mission}</Text>
                    {missionNote(player, chaosEvent) && (
                      <Text style={styles.resultNote}>{missionNote(player, chaosEvent)}</Text>
                    )}
                    {caughtBy ? (
                      <View style={styles.resultOutcomeRow}>
                        <Stamp color={TONES.red} text="BUSTED" />
                        <Text style={styles.missedText}>CAUGHT BY {caughtBy.accuser.toUpperCase()}</Text>
                      </View>
                    ) : player.completed === null ? (
                      player.role === 'double-agent' ? (
                        <Text style={styles.autoNote}>Decided by the vote on {player.target}’s mission.</Text>
                      ) : (
                        <>
                          <View style={styles.outcomeButtons}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${player.name} did it`}
                              disabled={!votable}
                              onPressIn={playTap}
                              onPress={() => setMissionOutcome(player.name, true)}
                              style={[styles.outcomeButton, styles.successButton]}
                            >
                              <Text style={styles.outcomeText}>✓  THEY DID IT</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${player.name} did not do it`}
                              disabled={!votable}
                              onPressIn={playTap}
                              onPress={() => setMissionOutcome(player.name, false)}
                              style={[styles.outcomeButton, styles.missedButton]}
                            >
                              <Text style={styles.outcomeText}>✕  NOPE</Text>
                            </Pressable>
                          </View>
                          <Text style={styles.swipeHint}>
                            {denied ? `⚖️ ${player.target} disputed it. Vote again.` : '← SWIPE OR TAP →'}
                          </Text>
                        </>
                      )
                    ) : (
                      <>
                        <View style={styles.resultOutcomeRow}>
                          <Stamp
                            color={player.completed ? TONES.greenInk : TONES.red}
                            text={player.completed ? 'NAILED IT' : 'NOPE'}
                          />
                          <Text style={styles.winPoints}>
                            {points.total > 0 ? `+${points.total.toLocaleString()} PTS` : points.total < 0 ? `${points.total} PTS` : '0 PTS'}
                          </Text>
                        </View>
                        {creativeName && sameName(creativeName, player.name) && (
                          <Text style={styles.creativeTag}>🎨 MOST CREATIVE · +{CREATIVE_BONUS}</Text>
                        )}
                        {player.completed && player.role === 'agent' && !denied && !votesLocked && (
                          <Pressable accessibilityRole="button" onPress={() => denyMission(player)} style={styles.denyButton}>
                            <Text style={styles.denyText}>⚖️  {player.target.toUpperCase()} DENIES IT</Text>
                          </Pressable>
                        )}
                      </>
                    )}
                    {points.callouts !== 0 && (
                      <Text style={styles.calloutPoints}>
                        🚨 Call-out {points.callouts > 0 ? `+${points.callouts}` : points.callouts}
                      </Text>
                    )}
                    <View style={styles.reactionRow}>
                      <Text style={styles.reactionPrompt}>REACT</Text>
                      {([
                        ['laugh', '😂'],
                        ['shocked', '😱'],
                        ['suspicious', '👀'],
                        ['celebrate', '🎉'],
                      ] as const).map(([kind, emoji]) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${kind} reaction for ${player.name}`}
                          key={kind}
                          onPressIn={playTap}
                          onPress={() => sendReaction(kind, player.name)}
                          style={styles.reactionButton}
                        >
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </SwipeVote>
                </Entrance>
              );
            })}
            {allMissionsVoted && !votesLocked && completedPlayers.some((player) => player.role === 'agent') && (
              <Entrance style={styles.creativeBlock}>
                <Eyebrow>🎨 MOST CREATIVE COMPLETION? · +{CREATIVE_BONUS}</Eyebrow>
                <View style={styles.chipRow}>
                  {completedPlayers
                    .filter((player) => player.role === 'agent')
                    .map((player) => {
                      const selected = Boolean(creativeName && sameName(creativeName, player.name));
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          key={player.name}
                          onPress={() => {
                            haptic(selected ? 'select' : 'success');
                            setCreativeName(selected ? null : player.name);
                          }}
                          style={[styles.setupChip, selected && styles.setupChipSelected]}
                        >
                          <Text style={styles.setupChipText}>
                            {player.avatar} {player.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              </Entrance>
            )}
            {roundsPlayed > 0 && (
              <View style={styles.miniLeaderboard}>
                <Eyebrow>SESSION SCORE · {roundsPlayed} {roundsPlayed === 1 ? 'ROUND' : 'ROUNDS'}</Eyebrow>
                <Leaderboard entries={sessionLeaderboard(false)} />
              </View>
            )}
            <PrimaryButton label="MAKE A SHARE CARD  ↗" onPressIn={playTap} onPress={() => setStage('share')} />
            {/* A rematch or wrap-up before every vote is in would drop this round from the scores. */}
            {!allMissionsVoted && (
              <Text style={styles.voteHint}>Vote on every mission to rematch or wrap the session.</Text>
            )}
            <PrimaryButton
              label="REMATCH · RUN IT BACK"
              disabled={!allMissionsVoted}
              onPressIn={playTap}
              onPress={rematch}
              secondary
            />
            {roundsPlayed > 0 && allMissionsVoted && (
              <Pressable
                accessibilityRole="button"
                onPressIn={playTap}
                onPress={wrapSession}
                style={styles.backLink}
              >
                <Text style={styles.backLinkText}>WRAP THE SESSION</Text>
              </Pressable>
            )}
            <Pressable onPressIn={playTap} onPress={startFreshSession} style={styles.backLink}>
              <Text style={styles.backLinkText}>CHANGE PLAYERS OR MODE</Text>
            </Pressable>
          </GestureScrollView>
        )
      )}

      {stage === 'summary' && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <Text style={styles.summaryEmoji}>🏆</Text>
          <Eyebrow>SESSION WRAPPED · {roundsPlayed} {roundsPlayed === 1 ? 'ROUND' : 'ROUNDS'}</Eyebrow>
          <Text style={styles.pageTitle}>The group chat has evidence.</Text>
          <Text style={styles.pageCopy}>Real points, real missions, absolutely questionable behavior.</Text>
          <View style={styles.summaryHighlight}>
            <Eyebrow>SESSION HIGHLIGHT</Eyebrow>
            <Text style={styles.summaryHighlightTitle}>
              {roundHistory[roundHistory.length - 1]?.eventName
                ? `${roundHistory[roundHistory.length - 1]?.eventName} changed the vibes`
                : roundHistory[roundHistory.length - 1]?.completedNames.length
                  ? `${roundHistory[roundHistory.length - 1]?.completedNames.join(' & ')} pulled it off`
                  : 'Nobody completed a mission. Iconic.'}
            </Text>
            <Text style={styles.summaryHighlightCopy}>
              {roundHistory[roundHistory.length - 1]
                ? `Round ${roundHistory[roundHistory.length - 1].round} · ${MODE_OPTIONS.find((mode) => mode.id === roundHistory[roundHistory.length - 1].mode)?.title}`
                : 'Play a round to start a session history.'}
            </Text>
          </View>
          <View style={styles.miniLeaderboard}>
            <Text style={styles.scoreSummaryTitle}>FINAL SCOREBOARD</Text>
            <Leaderboard entries={sessionLeaderboard(true)} />
          </View>
          {motnCandidates.length > 0 && (
            <View style={styles.summaryHistory}>
              <Text style={styles.scoreSummaryTitle}>👑 MISSION OF THE NIGHT</Text>
              <Text style={styles.scoreSummaryCopy}>
                {motn ? 'The group has spoken.' : 'Which completed mission was the best? Tap to crown it.'}
              </Text>
              {motnCandidates.map((candidate, index) => {
                const crowned = motn?.key === candidate.key;
                return (
                  <Entrance index={index} key={candidate.key}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: crowned, disabled: Boolean(motn) }}
                      disabled={Boolean(motn)}
                      onPress={() => crownMission(candidate)}
                      style={[styles.motnRow, crowned && styles.motnCrowned, motn && !crowned && styles.motnFaded]}
                    >
                      <Text style={styles.historyRound}>
                        {candidate.avatar} {candidate.name.toUpperCase()} · ROUND {candidate.round}
                      </Text>
                      <Text style={styles.historyDetail}>{candidate.mission}</Text>
                      {crowned && <Stamp color={COLORS.ink} text="👑 MISSION OF THE NIGHT" />}
                    </Pressable>
                  </Entrance>
                );
              })}
            </View>
          )}
          <View style={styles.summaryHistory}>
            <Text style={styles.scoreSummaryTitle}>ROUND RECAP</Text>
            {[...roundHistory].reverse().map((round) => (
              <View key={round.round} style={styles.historyRow}>
                <Text style={styles.historyRound}>#{round.round} · {MODE_OPTIONS.find((mode) => mode.id === round.mode)?.title}</Text>
                <Text style={styles.historyDetail}>
                  {round.eventName ? `${round.eventName} · ` : ''}
                  {round.completedNames.length
                    ? `✓ ${round.completedNames.join(', ')}`
                    : 'No missions completed'}
                  {round.failedNames.length ? ` · ✕ ${round.failedNames.join(', ')}` : ''}
                  {round.caughtNames.length ? ` · 🚨 ${round.caughtNames.join(', ')} busted` : ''}
                </Text>
              </View>
            ))}
          </View>
          <PrimaryButton label="REMATCH · SAME GROUP" onPressIn={playTap} onPress={rematch} />
          <PrimaryButton label="MAKE A SHARE CARD  ↗" onPressIn={playTap} onPress={() => setStage('share')} secondary />
          <Pressable onPressIn={playTap} onPress={startFreshSession} style={styles.backLink}>
            <Text style={styles.backLinkText}>START A NEW SESSION</Text>
          </Pressable>
        </ScrollView>
      )}

      {stage === 'share' && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <Eyebrow>THE GROUP CHAT NEEDS TO SEE THIS</Eyebrow>
          <Text style={styles.pageTitle}>Make it a moment.</Text>
          <Text style={styles.pageCopy}>Share this vertical reveal card to your socials or group chat.</Text>
          <View ref={shareCardRef} collapsable={false} style={styles.shareCard}>
            <View style={styles.shareCardTop}>
              <Text style={styles.shareLogo}>LOWKEY</Text>
              <Text style={styles.shareTag}>DO IT. DON’T GET CAUGHT.</Text>
            </View>
            <View style={styles.shareContent}>
              <Text style={styles.shareSiren}>🚨</Text>
              <Text style={styles.shareHeading}>WE PLAYED{'\n'}LOWKEY</Text>
              <Text style={styles.shareSmallLabel}>
                {MODE_OPTIONS.find((mode) => mode.id === roundMode)?.title} · THE MISSION REVEAL
                {chaosEvent ? ` · ${chaosEvent.name}` : ''}
              </Text>
              {resolvedPlayers.slice(0, 4).map((player) => (
                <View key={player.name} style={styles.shareMission}>
                  <Text style={styles.sharePlayer}>{player.avatar} {player.name.toUpperCase()}</Text>
                  <Text style={styles.shareMissionText}>{player.mission}</Text>
                  <Text style={[styles.shareOutcome, player.completed ? styles.shareWin : styles.shareLoss]}>
                    {isCaught(callouts, player.name)
                      ? 'BUSTED  🚨'
                      : player.completed === null
                        ? 'THEY TRIED'
                        : player.completed
                          ? 'MISSION COMPLETE  ✦'
                          : 'MISSION FAILED'}
                  </Text>
                </View>
              ))}
              {players.length > 4 && <Text style={styles.morePlayers}>+ {players.length - 4} MORE MISSIONS</Text>}
            </View>
            <View style={styles.shareCardBottom}>
              <Text style={styles.shareFooter}>WHO WAS THE MOST SUSPICIOUS?</Text>
              <Text style={styles.shareHashtag}>#LOWKEYGAME</Text>
            </View>
          </View>
          <PrimaryButton label="SHARE REVEAL CARD  ↗" onPressIn={playTap} onPress={shareResults} />
          <PrimaryButton label="BACK TO REVEAL" onPressIn={playTap} onPress={() => setStage('reveal')} secondary />
          <Pressable
            onPress={() => Share.share({ message: shareMessage })}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>SHARE AS TEXT INSTEAD</Text>
          </Pressable>
        </ScrollView>
      )}
      </Animated.View>
      {stage === 'reveal' && revealReady && completedPlayers.length > 0 && (
        <Celebration reduceMotion={reduceMotion} />
      )}
      <Sheet onClose={() => setSheet(null)} visible={stage === 'playing' && sheet !== null}>
        {sheet?.kind === 'callout' && (
          <CallOutPanel
            callouts={callouts}
            fixedAccuser={room?.hostName}
            key={sheetKey}
            onClose={() => setSheet(null)}
            onSubmit={registerCallout}
            players={resolvedPlayers}
          />
        )}
        {sheet?.kind === 'peek' && (
          <PeekPanel
            event={chaosEvent}
            fixedName={sheet.names?.length === 1 ? sheet.names[0] : undefined}
            hintsOpen={pastHalfway}
            key={sheetKey}
            onClose={() => setSheet(null)}
            outcome={missionOutcome}
            players={sheet.names ? resolvedPlayers.filter((player) => sheet.names?.some((name) => sameName(name, player.name))) : resolvedPlayers}
            title={sheet.title}
          />
        )}
      </Sheet>
      <BustedOverlay event={bust} onDone={() => setBust(null)} />
      {activeNotice && (
        <Toast key={`${activeNotice.name}-${activeNotice.badge.id}`} onDone={() => setBadgeNotices((queue) => queue.slice(1))}>
          <Text style={styles.toastTitle}>
            {activeNotice.badge.avatar}  {activeNotice.name} unlocked {activeNotice.badge.name}
          </Text>
          <Text style={styles.toastCopy}>New avatar unlocked. {activeNotice.badge.description}</Text>
        </Toast>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webRoot: { backgroundColor: '#E2E0D5' },
  webColumn: { width: '100%', maxWidth: 520, alignSelf: 'center', overflow: 'hidden' },
  app: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 14,
  },
  topBar: {
    height: 56,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  screen: { flex: 1 },
  soundToggle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    marginRight: 10,
  },
  soundToggleText: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  confettiLayer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  confettiPiece: {
    position: 'absolute',
    top: 50,
    fontSize: 23,
    fontWeight: '900',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  brandMarkText: { color: COLORS.ink, fontSize: 19, fontWeight: '900' },
  brandName: { color: COLORS.ink, fontSize: 16, fontWeight: '900', letterSpacing: 1.6 },
  topTag: { flexShrink: 1, color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  homeContent: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 30 },
  hero: {
    minHeight: 310,
    borderRadius: 26,
    backgroundColor: COLORS.green,
    padding: 25,
    // Leaves room for the mascot and speech bubble so they never cover the copy.
    paddingBottom: 120,
    marginBottom: 18,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  heroSticker: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.ink,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 19,
    transform: [{ rotate: '-2deg' }],
  },
  stickerText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  heroTitle: { color: COLORS.ink, fontSize: 45, fontWeight: '900', lineHeight: 48, letterSpacing: -2 },
  heroCopy: { color: '#3C4937', fontSize: 14, lineHeight: 20, marginTop: 12, maxWidth: 245 },
  heroDoodle: { position: 'absolute', right: 20, bottom: 24, alignItems: 'center' },
  doodleText: { fontSize: 51, transform: [{ rotate: '10deg' }] },
  doodleBubble: {
    position: 'absolute',
    right: 42,
    bottom: 52,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    transform: [{ rotate: '-6deg' }],
  },
  bubbleText: { fontSize: 9, fontWeight: '800', color: COLORS.ink },
  howCard: { marginTop: 24, backgroundColor: COLORS.card, borderRadius: 21, padding: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  lastStep: { borderBottomWidth: 0, paddingBottom: 1 },
  stepNumber: { color: '#9BC94C', width: 38, fontSize: 12, fontWeight: '900' },
  stepText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: '700' },
  homeNote: { textAlign: 'center', color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 20 },
  pageContent: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 34 },
  pageTitle: { color: COLORS.ink, fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1.1, marginTop: 8 },
  pageCopy: { color: COLORS.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  nameList: { marginTop: 24, gap: 9 },
  nameInputRow: {
    height: 57,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 16,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameIndex: { width: 33, color: '#A0A59E', fontSize: 10, fontWeight: '900' },
  nameInput: { flex: 1, height: '100%', color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  removeButton: { width: 30, height: 40, alignItems: 'flex-end', justifyContent: 'center' },
  removeButtonText: { color: COLORS.muted, fontSize: 25, fontWeight: '300' },
  addPlayer: { alignSelf: 'flex-start', paddingVertical: 14, paddingRight: 12 },
  addPlayerText: { color: COLORS.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  validationText: { color: '#BA4938', fontSize: 12, fontWeight: '700', marginTop: 4 },
  durationBlock: { marginTop: 20, marginBottom: 17 },
  durationOptions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modeBlock: { marginTop: 24 },
  modeList: { gap: 9, marginTop: 12 },
  modeOption: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.line,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modeSelected: { borderColor: COLORS.ink, backgroundColor: '#F0F5E5' },
  modeEmoji: { fontSize: 25 },
  modeCopy: { flex: 1 },
  modeTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  modeDescription: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  modeCheck: { color: COLORS.ink, fontSize: 17, fontWeight: '900' },
  durationOption: {
    width: 76,
    height: 65,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  durationSelected: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  durationNumber: { color: COLORS.ink, fontSize: 22, fontWeight: '900' },
  durationNumberSelected: { color: COLORS.ink },
  durationUnit: { color: COLORS.muted, fontSize: 8, fontWeight: '900', marginTop: 5 },
  backLink: { alignItems: 'center', paddingVertical: 18 },
  backLinkText: { color: COLORS.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  centerPage: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 24, justifyContent: 'center', alignItems: 'center' },
  progressHeader: { paddingHorizontal: 24, paddingTop: 22 },
  progressTrack: { height: 5, backgroundColor: '#E4E3D9', borderRadius: 5, marginTop: 11 },
  progressFill: { height: 5, backgroundColor: '#9BC94C', borderRadius: 5 },
  phoneHandoff: { alignItems: 'center', marginBottom: 25 },
  privateNudge: { color: '#78816F', fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  handoffEmoji: { fontSize: 43, marginBottom: 13 },
  handoffTitle: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },
  handoffName: { color: COLORS.ink, fontSize: 38, fontWeight: '900', letterSpacing: -1, marginTop: 3, textAlign: 'center' },
  missionCard: {
    width: '100%',
    backgroundColor: COLORS.green,
    padding: 21,
    borderRadius: 21,
    marginBottom: 10,
  },
  missionText: { color: COLORS.ink, fontSize: 24, lineHeight: 30, fontWeight: '900', marginTop: 17 },
  missionHint: { color: '#536048', fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 13 },
  bigEmoji: { fontSize: 57, marginBottom: 21 },
  readyPlayerList: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 25,
  },
  readyPlayer: {
    color: COLORS.ink,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 9,
    fontSize: 11,
    fontWeight: '800',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E9E8DF',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 20,
    marginBottom: 22,
  },
  liveDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: '#75B831', marginRight: 7 },
  liveText: { color: COLORS.ink, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  modeBadge: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 15, paddingVertical: 9, marginTop: 20 },
  modeBadgeText: { color: COLORS.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  chaosEventCard: { width: '100%', backgroundColor: COLORS.green, borderRadius: 17, padding: 15, marginTop: 12 },
  chaosEventName: { color: COLORS.ink, fontSize: 16, fontWeight: '900', marginTop: 8 },
  chaosEventRule: { color: COLORS.ink, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 6 },
  chaosEventDetail: { color: '#536048', fontSize: 10, lineHeight: 14, marginTop: 6 },
  timerLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  timer: { color: COLORS.ink, fontSize: 58, fontWeight: '900', letterSpacing: -2.5, marginTop: 1, fontVariant: ['tabular-nums'] },
  timerUrgent: { color: '#CF553F' },
  suddenDeathLabel: { color: '#BA4938', fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 4 },
  playingHeadline: { color: COLORS.ink, fontSize: 26, fontWeight: '900', marginTop: 15 },
  playingTip: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 15,
    marginTop: 30,
    marginBottom: 24,
    alignItems: 'center',
  },
  activeEvent: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 14, marginTop: 17 },
  activeEventUrgent: { backgroundColor: '#FBE8DF' },
  activeEventTitle: { color: COLORS.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  activeEventText: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  tipMark: { color: '#85AD39', fontSize: 18, marginRight: 10 },
  tipText: { color: COLORS.ink, fontSize: 12, fontWeight: '700', flex: 1 },
  revealBanner: {
    backgroundColor: COLORS.green,
    borderRadius: 23,
    padding: 21,
    marginBottom: 18,
  },
  tieBanner: { backgroundColor: '#E8DFFF' },
  revealEmoji: { fontSize: 30, marginBottom: 11 },
  comedyLine: { color: COLORS.ink, fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 13 },
  revealEventNote: { color: '#536048', fontSize: 10, fontWeight: '900', marginTop: 14 },
  suspenseScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  suspenseSiren: { fontSize: 60, marginBottom: 24 },
  suspenseTitle: { color: COLORS.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  suspenseCopy: { color: COLORS.muted, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  suspenseLights: { flexDirection: 'row', gap: 10, marginTop: 32 },
  suspenseLight: { width: 10, height: 10, borderRadius: 10, backgroundColor: COLORS.orange },
  suspenseLightOne: { opacity: 0.45 },
  suspenseLightTwo: { opacity: 0.7 },
  suspenseLightThree: { opacity: 1 },
  reactionToast: {
    color: COLORS.ink,
    backgroundColor: '#FFFFFF',
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 12,
  },
  scoreSummary: { marginBottom: 11 },
  roomCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 17, marginTop: 18, marginBottom: 6 },
  roomCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomCardCopy: { color: COLORS.ink, fontSize: 13, lineHeight: 19, marginTop: 8 },
  roomCode: { color: COLORS.ink, fontSize: 56, fontWeight: '900', letterSpacing: 10, marginVertical: 8 },
  roomStatus: { color: '#527D22', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  roomStatusBad: { color: '#BA4938' },
  roomMember: { color: COLORS.ink, fontSize: 14, fontWeight: '800', paddingTop: 10 },
  roomInput: { marginTop: 22, marginBottom: 4 },
  roomDivider: { alignItems: 'center', marginTop: 24, marginBottom: 12 },
  roomDividerText: { color: COLORS.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  codeInput: { letterSpacing: 6, fontSize: 20 },
  voteHint: { color: COLORS.muted, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  scoreSummaryTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  scoreSummaryCopy: { color: COLORS.muted, fontSize: 11, marginTop: 5 },
  resultCard: { backgroundColor: COLORS.card, borderRadius: 17, padding: 17, marginBottom: 10 },
  resultTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, marginRight: 8 },
  resultAvatar: { fontSize: 23 },
  resultPlayer: { flexShrink: 1, color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  resultPoints: { color: COLORS.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  resultMission: { color: COLORS.ink, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 13 },
  resultOutcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  winPoints: { color: '#527D22', fontSize: 10, fontWeight: '900' },
  outcomeButtons: { flexDirection: 'row', gap: 8 },
  outcomeButton: { flex: 1, borderRadius: 11, minHeight: 39, alignItems: 'center', justifyContent: 'center' },
  successButton: { backgroundColor: COLORS.green },
  missedButton: { backgroundColor: '#F3E5DE' },
  outcomeText: { color: COLORS.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  outcomeResult: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  successText: { color: '#527D22' },
  missedText: { color: '#BC5745' },
  reactionRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 13, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.line },
  reactionPrompt: { color: COLORS.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  reactionButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#F7F4EC', alignItems: 'center', justifyContent: 'center' },
  reactionEmoji: { fontSize: 17 },
  miniLeaderboard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 17, marginTop: 12, marginBottom: 12 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 13 },
  leaderRank: { color: COLORS.muted, width: 26, fontSize: 11, fontWeight: '900' },
  leaderName: { color: COLORS.ink, flex: 1, fontSize: 12, fontWeight: '900' },
  leaderStreak: { color: '#A96828', fontSize: 10, fontWeight: '800', marginRight: 8 },
  leaderPoints: { color: COLORS.ink, fontSize: 10, fontWeight: '900' },
  summaryEmoji: { fontSize: 50, marginBottom: 8 },
  summaryHighlight: { backgroundColor: COLORS.green, borderRadius: 20, padding: 19, marginTop: 23, marginBottom: 15 },
  summaryHighlightTitle: { color: COLORS.ink, fontSize: 19, lineHeight: 25, fontWeight: '900', marginTop: 10 },
  summaryHighlightCopy: { color: '#536048', fontSize: 10, fontWeight: '800', marginTop: 8 },
  summaryPlayer: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingVertical: 12 },
  summaryPlayerLine: { flexDirection: 'row', alignItems: 'center' },
  summaryStats: { color: COLORS.muted, fontSize: 9, fontWeight: '700', marginLeft: 26, marginTop: 5 },
  summaryHistory: { backgroundColor: COLORS.card, borderRadius: 18, padding: 17, marginTop: 4, marginBottom: 13 },
  historyRow: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingVertical: 11 },
  historyRound: { color: COLORS.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  historyDetail: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  shareCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    minHeight: 550,
    aspectRatio: 9 / 16,
    backgroundColor: COLORS.ink,
    borderRadius: 21,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    marginVertical: 22,
  },
  shareCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shareLogo: { color: COLORS.green, fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  shareTag: { color: '#B9C0B8', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  shareContent: { flex: 1, justifyContent: 'center', paddingVertical: 16 },
  shareSiren: { fontSize: 31, marginBottom: 7 },
  shareHeading: { color: '#FFFFFF', fontSize: 34, lineHeight: 35, fontWeight: '900', letterSpacing: -1 },
  shareSmallLabel: { color: COLORS.green, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 12, marginBottom: 11 },
  shareMission: { borderTopWidth: 1, borderTopColor: '#38423C', paddingVertical: 9 },
  sharePlayer: { color: '#C6F36A', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  shareMissionText: { color: '#FFFFFF', fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 3 },
  shareOutcome: { fontSize: 7, fontWeight: '900', letterSpacing: 0.5, marginTop: 4 },
  shareWin: { color: COLORS.green },
  shareLoss: { color: '#FFA187' },
  morePlayers: { color: '#B9C0B8', fontSize: 8, fontWeight: '900', marginTop: 5 },
  shareCardBottom: { borderTopWidth: 1, borderTopColor: '#38423C', paddingTop: 12 },
  shareFooter: { color: '#D8DED8', fontSize: 7, fontWeight: '800', letterSpacing: 0.8 },
  shareHashtag: { color: COLORS.green, fontSize: 9, fontWeight: '900', marginTop: 4 },
  dealCard: { minHeight: 190 },
  readyNote: { color: '#527D22', fontSize: 12, fontWeight: '800', textAlign: 'center', marginVertical: 8 },
  agentNotice: { color: COLORS.ink, fontSize: 12, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  swapCard: { width: '100%', backgroundColor: '#E8DFFF', borderRadius: 17, padding: 15, marginTop: 12 },
  swapText: { color: COLORS.ink, fontSize: 13, lineHeight: 19, fontWeight: '800', marginTop: 6, marginBottom: 4 },
  calloutLog: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 14, marginTop: 12, gap: 6 },
  calloutLine: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  playButtons: { width: '100%', marginTop: 18 },
  resultNote: { color: COLORS.ink, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: -6, marginBottom: 12 },
  autoNote: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  swipeHint: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 9 },
  creativeTag: { color: '#6B4FD1', fontSize: 10, fontWeight: '900', marginTop: 10 },
  denyButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6 },
  denyText: { color: '#A96828', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  calloutPoints: { color: COLORS.ink, fontSize: 10, fontWeight: '900', marginTop: 10 },
  creativeBlock: { backgroundColor: '#E8DFFF', borderRadius: 18, padding: 17, marginTop: 4, marginBottom: 4 },
  optionBlock: { marginTop: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  setupChip: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' },
  setupChipSelected: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  setupChipText: { color: COLORS.ink, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  segment: { flexDirection: 'row', backgroundColor: '#E9E8DF', borderRadius: 14, padding: 4, marginTop: 11 },
  segmentOption: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: COLORS.card },
  segmentText: { color: COLORS.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  customRow: { marginTop: 10 },
  customAdd: { paddingHorizontal: 8, height: 40, justifyContent: 'center' },
  customItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 13, paddingLeft: 14, paddingRight: 8, marginTop: 7 },
  customText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: '700', paddingVertical: 11 },
  fameCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 17, marginTop: 14 },
  fameTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fameAvatar: { fontSize: 34 },
  fameName: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  fameStats: { color: COLORS.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 3 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  badge: { width: '31%', flexGrow: 1, backgroundColor: '#F0F5E5', borderRadius: 13, padding: 9, alignItems: 'center' },
  badgeLocked: { backgroundColor: COLORS.background },
  badgeEmoji: { fontSize: 20 },
  badgeName: { color: COLORS.ink, fontSize: 7, fontWeight: '900', letterSpacing: 0.5, marginTop: 4, textAlign: 'center' },
  badgeHint: { color: COLORS.muted, fontSize: 7, lineHeight: 10, marginTop: 3, textAlign: 'center' },
  motnRow: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingVertical: 11, gap: 6 },
  motnCrowned: { backgroundColor: '#F0F5E5', borderRadius: 12, paddingHorizontal: 10, borderTopWidth: 0, marginVertical: 4 },
  motnFaded: { opacity: 0.45 },
  toastTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  toastCopy: { color: '#B9C0B8', fontSize: 11, fontWeight: '700', marginTop: 3 },
});
