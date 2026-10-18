import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
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
  MIN_PLAYERS_FOR_DOUBLE_AGENT,
  MODE_OPTIONS,
  PACK_OPTIONS,
  PLAYER_AVATARS,
  applyRoundToLifetime,
  applySwap,
  chaosRuleSecondsLeft,
  checkPlayerNames,
  crownMissionOfTheNight,
  displaySeconds,
  missionLibrary,
  roundDeadline,
  EMPTY_MISSION_EDITS,
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
  MissionEdits,
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
import { BRAND } from './src/brand';
import { DialogHost, confirmAction, showMessage } from './src/dialogs';
import { Intro } from './src/Intro';
import { MissionLibrary } from './src/MissionLibrary';
import { ShareOptions } from './src/ShareSheet';
import { CLAY, FONTS, RADIUS, THEME, TONE_COLORS, TONE_CYCLE } from './src/theme';
import { AvatarPicker, CallOutPanel, ChaosEventCard, DifficultyTag, Leaderboard, MissionBody, PeekPanel } from './src/gameUi';
import { haptic, hapticPattern, setHapticsEnabled } from './src/haptics';
import { SoundProvider, useSound } from './src/sounds';
import {
  Bob,
  BustedOverlay,
  Entrance,
  Kickoff,
  HoldToReveal,
  PopIn,
  PopOnChange,
  RotatingText,
  Sheet,
  Stamp,
  SuspenseLights,
  SwipeVote,
  TONES,
  TimerRing,
  Toast,
  Wobble,
} from './src/motion';
import type { BustEvent } from './src/motion';
import { COLORS, Eyebrow, Icon, IconButton, KeepScreenAwake, PartyTile, PrimaryButton, ProtectMissions } from './src/ui';
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
  loadMissionEdits,
  loadSetup,
  saveLastRoom,
  saveMissionEdits,
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
  | 'fame'
  | 'missions';
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

// The home speech bubble cycles through a few sample missions.
const HOME_TEASERS = [
  '“Just say pizza…”',
  '“Get a high-five…”',
  '“Make them laugh.”',
  '“Say yaar. Just once.”',
  '“Make them blush.”',
  '“Chai, anyone?”',
];
const PLAYING_TIPS = [
  'If they ask why, don’t tell them why.',
  'Act natural. Natural people don’t say “act natural.”',
  'Think someone’s working on you? Call it out.',
  'Smile less. Smiling is suspicious.',
];
const HALFWAY_TIPS = [
  'Hints are open. Stuck? Peek for one.',
  'Halfway there. Time to get bold.',
  'Someone is definitely onto you. Probably.',
];

// Web only: turns a captured data URI into a File the browser can share.
async function pictureFile(dataUri: string) {
  const blob = await (await fetch(dataUri)).blob();
  return { dataUri, file: new File([blob], 'party-spy-results.png', { type: 'image/png' }) };
}

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function sameName(left: string, right: string) {
  return playerKey(left) === playerKey(right);
}

// Keep the system splash screen up until the fonts are ready; the animated
// intro then takes over from the same logo.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const [introDone, setIntroDone] = useState(false);
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hide();
  }, [fontsLoaded]);
  return (
    <GestureHandlerRootView style={[styles.root, styles.rootBackground]}>
      <LinearGradient colors={[THEME.bgTop, THEME.bg, THEME.bgDeep]} style={StyleSheet.absoluteFill} />
      {/* On the web (e.g. a laptop browser), keep the phone-sized layout in a centred column. */}
      <View style={[styles.root, Platform.OS === 'web' && styles.webColumn]}>
        {fontsLoaded && (
          <SafeAreaProvider>
            <SoundProvider>
              <Game />
            </SoundProvider>
          </SafeAreaProvider>
        )}
      </View>
      {fontsLoaded && !introDone && <Intro onDone={() => setIntroDone(true)} />}
      {fontsLoaded && <DialogHost />}
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
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, play } = useSound();
  const [selectedMode, setSelectedMode] = useState<GameMode>('classic');
  const [roundMode, setRoundMode] = useState<GameMode>('classic');
  const [chaosEvent, setChaosEvent] = useState<ChaosEvent | null>(null);
  // Setup choices, remembered on the device.
  const [setupLoaded, setSetupLoaded] = useState(false);
  const [packs, setPacks] = useState<PackId[]>(DEFAULT_SETUP.packs);
  const [difficulty, setDifficulty] = useState<DifficultySetting>(DEFAULT_SETUP.difficulty);
  const [doubleAgent, setDoubleAgent] = useState(DEFAULT_SETUP.doubleAgent);
  const [customMissions, setCustomMissions] = useState<string[]>(DEFAULT_SETUP.customMissions);
  const [missionEdits, setMissionEdits] = useState<MissionEdits>(EMPTY_MISSION_EDITS);
  // Where "Done" in the mission library goes back to.
  const [libraryReturn, setLibraryReturn] = useState<Stage>('home');
  const [kickoffRound, setKickoffRound] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const webPicture = useRef<{ dataUri: string; file: File } | null>(null);
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
  const [livePulse] = useState(() => new Animated.Value(1));
  const tickedSecond = useRef<number | null>(null);
  const durationRef = useRef(300);
  const commentedRound = useRef(0);
  const reactionId = useRef(0);
  const bustKey = useRef(0);
  const shownCallouts = useRef(0);
  const stageRef = useRef(stage);
  const playersRef = useRef(players);
  const roundIdRef = useRef(roundId);
  const setupScrollRef = useRef<ScrollView>(null);
  const nameListY = useRef(0);
  const nameRowY = useRef<number[]>([]);

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
    void Promise.all([loadLifetime(), loadSetup(), loadLastRoom(), loadMissionEdits()]).then(([savedLifetime, setup, savedRoom, edits]) => {
      if (!active) return;
      setLifetime(savedLifetime);
      setMissionEdits(edits);
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

  useEffect(() => {
    if (setupLoaded) saveMissionEdits(missionEdits);
  }, [missionEdits, setupLoaded]);

  const library = useMemo(() => missionLibrary(missionEdits), [missionEdits]);

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
      play('reveal');
      hapticPattern(['heavy', 'success'], 140);
    }, reduceMotion ? 220 : 850);
    return () => clearTimeout(timeout);
  }, [play, reduceMotion, revealReady, roundId, stage]);

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
      const now = Date.now();
      const shown = displaySeconds(endsAt, now, durationRef.current);
      setSecondsLeft((previous) => (previous === shown ? previous : shown));
      if (secondsRemaining(endsAt, now) === 0) {
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
      play('secret');
      hapticPattern(['tick', 'success'], 90);
    }
  }, [missionVisible, play, stage]);

  // Final ten seconds: a tick sound and a heartbeat, in step with the ring's pulse.
  useEffect(() => {
    if (stage !== 'playing' || secondsLeft > 5 || secondsLeft <= 0) return;
    if (tickedSecond.current === secondsLeft) return;
    tickedSecond.current = secondsLeft;
    play('tick');
    hapticPattern(secondsLeft <= 3 ? ['heavy', 'heavy'] : ['heavy', 'tick'], 120);
  }, [play, secondsLeft, stage]);

  const gameDurationSeconds = roundDurationSeconds(roundMode, duration);
  useEffect(() => {
    durationRef.current = gameDurationSeconds;
  }, [gameDurationSeconds]);
  const elapsedSeconds = Math.max(0, gameDurationSeconds - secondsLeft);
  const pastHalfway = stage === 'playing' && isPastHalfway(elapsedSeconds, gameDurationSeconds);

  // Swap chaos rule: halfway through, the two chosen players trade missions.
  useEffect(() => {
    if (!pastHalfway || !swapPair || swapped) return;
    setSwapped(true);
    setPlayers((current) => applySwap(current, swapPair));
    play('swap');
    hapticPattern(['heavy', 'tick', 'heavy'], 120);
  }, [pastHalfway, play, swapPair, swapped]);

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
    if (earned.length) {
      play('badge');
      setBadgeNotices((queue) => [...queue, ...earned]);
    }
  };

  const saveRoundToLifetime = () => {
    if (!currentRecord || lifetimeSavedRound === roundId) return;
    setLifetimeSavedRound(roundId);
    const record = currentRecord;
    void updateLifetime((current) => applyRoundToLifetime(current, record)).then(({ before, after }) => showBadges(before, after));
  };

  const beginRound = (roundPlayers: string[], mode: GameMode, avatars: Record<string, string>) => {
    const dealt = dealRound(roundPlayers, mode, {
      library,
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
      showMessage(
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

  // The deadline includes the "3, 2, 1… let's start the chaos!" kickoff.
  const startTimer = () => {
    tickedSecond.current = null;
    durationRef.current = gameDurationSeconds;
    setEndsAt(roundDeadline(Date.now(), gameDurationSeconds));
    setSecondsLeft(gameDurationSeconds);
    setKickoffRound(roundId);
    setStage('playing');
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
    confirmAction({
      title: 'End the game?',
      message: 'The missions will be revealed to everyone.',
      cancelText: 'Keep playing',
      confirmText: 'Reveal missions',
      onConfirm: showReveal,
    });
  }, [showReveal]);

  const closeRoom = useCallback(() => {
    confirmAction({
      title: 'Close the room?',
      message: 'Everyone in the room will be disconnected.',
      cancelText: 'Keep it open',
      confirmText: 'Close room',
      onConfirm: () => {
        setRoom(null);
        setStage('home');
      },
    });
  }, []);

  const openSheet = (next: NonNullable<SheetState>) => {
    setSheetKey((key) => key + 1);
    setSheet(next);
  };

  // Back, for the header button and Android's back button alike: close overlays
  // first, then step back one screen. Anything that would lose progress asks.
  const goBack = (): boolean => {
    if (bust) {
      setBust(null);
      return true;
    }
    if (sheet) {
      setSheet(null);
      return true;
    }
    if (shareOpen) {
      setShareOpen(false);
      return true;
    }
    switch (stage) {
      case 'home':
        return false;
      case 'guest':
        confirmAction({
          title: 'Leave the room?',
          message: 'You can jump back in from the Private room screen while the game is still on.',
          cancelText: 'Stay',
          confirmText: 'Leave',
          onConfirm: () => {
            setGuestJoin(null);
            void loadLastRoom().then(setLastRoom);
            setStage('room-start');
          },
        });
        return true;
      case 'missions':
        setStage(libraryReturn);
        return true;
      case 'room-start':
      case 'fame':
        setStage('home');
        return true;
      case 'setup':
        if (room) closeRoom();
        else setStage('home');
        return true;
      case 'deal':
      case 'ready':
        confirmAction({
          title: 'Cancel this round?',
          message: 'The missions will be cleared. You can change players or deal again.',
          cancelText: 'Keep going',
          confirmText: 'Cancel round',
          onConfirm: () => setStage('setup'),
        });
        return true;
      case 'playing':
        finishEarly();
        return true;
      case 'reveal':
        // Back from the results: change players or mode (the scores are kept).
        startFreshSession();
        return true;
      case 'share':
      case 'summary':
        setStage('reveal');
        return true;
      default:
        return true;
    }
  };
  const goBackRef = useRef(goBack);
  useEffect(() => {
    goBackRef.current = goBack;
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => goBackRef.current());
    return () => subscription.remove();
  }, []);

  const setMissionOutcome = (name: string, completed: boolean) => {
    if (votesLocked) return;
    setPlayers((currentPlayers) =>
      currentPlayers.map((player) => (sameName(player.name, name) ? { ...player, completed } : player)),
    );
    play(completed ? 'success' : 'nope');
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

  useEffect(() => {
    if (Platform.OS !== 'web' || !shareOpen || !shareCardRef.current) return undefined;
    let active = true;
    webPicture.current = null;
    captureRef(shareCardRef, { format: 'png', quality: 1, result: 'data-uri' })
      .then(pictureFile)
      .then((picture) => {
        if (active) webPicture.current = picture;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [shareOpen]);

  // Shares the reveal card as a picture. Phones get the system share menu
  // (Instagram, Snapchat, WhatsApp…); browsers use their share menu when they
  // can share files, and otherwise download the picture. Returns a status line.
  const shareImage = async (): Promise<string | null> => {
    if (!shareCardRef.current) return 'The card isn’t ready yet. Try again in a second.';
    try {
      if (Platform.OS === 'web') {
        // Browsers only open their share menu right after a tap, so use the
        // picture made when the panel opened rather than making one now.
        let picture = webPicture.current;
        if (!picture) {
          picture = await pictureFile(await captureRef(shareCardRef, { format: 'png', quality: 1, result: 'data-uri' }));
          webPicture.current = picture;
        }
        if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [picture.file] })) {
          try {
            await navigator.share({ files: [picture.file], title: `We played ${BRAND.name}!`, text: shareMessage });
            return null;
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return null;
            // NotAllowedError and friends: download it instead.
          }
        }
        const link = document.createElement('a');
        link.href = picture.dataUri;
        link.download = 'party-spy-results.png';
        link.click();
        return '✓ Picture downloaded. Post it anywhere.';
      }
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Share your ${BRAND.name} results`,
          UTI: 'public.png',
        });
        return null;
      }
      await Share.share({ message: shareMessage });
      return null;
    } catch (error) {
      // Closing the browser's share menu isn't an error.
      if (error instanceof Error && error.name === 'AbortError') return null;
      if (__DEV__) console.warn('Could not share the picture.', error);
      return 'Couldn’t make the picture here. Try WhatsApp or Copy text instead.';
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
    play('badge');
    hapticPattern(['heavy', 'success'], 140);
    void updateLifetime((current) => crownMissionOfTheNight(current, candidate.name)).then(({ before, after }) =>
      showBadges(before, after),
    );
  };

  const openLibrary = (from: Stage) => {
    setLibraryReturn(from);
    setStage('missions');
  };

  const playVibe = (pack: PackId) => {
    setPacks([pack]);
    setStage('setup');
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
        {stage !== 'home' && (
          <View style={styles.headerBack}>
            <IconButton icon="arrow-left" label="Back" onPress={goBack} />
          </View>
        )}
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>{BRAND.mark}</Text>
          </View>
          <Text style={styles.brandName}>{BRAND.name}</Text>
        </View>
        <IconButton
          icon={soundEnabled ? 'volume-2' : 'volume-x'}
          label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          onPress={() => {
            setSoundEnabled(!soundEnabled);
            if (!soundEnabled) setTimeout(() => play('land'), 0);
          }}
        />
      </View>

      <Animated.View
        style={[
          styles.screen,
          { opacity: screenOpacity, transform: [{ translateY: screenOffset }] },
        ]}
      >
      {stage === 'home' && (
        <ScrollView contentContainerStyle={styles.homeContent}>
          <Entrance index={0}>
          <LinearGradient
            colors={['#FFC4E0', '#DCCBFF']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.hero}
          >
            <View style={styles.heroStickers} pointerEvents="none">
              <Bob delay={0}>
                <Text style={styles.stickerBig}>🕵️</Text>
              </Bob>
              <Bob delay={500} distance={5}>
                <Text style={styles.stickerSmall}>🎉</Text>
              </Bob>
            </View>
            <Text style={styles.heroKicker}>{BRAND.tagline.toUpperCase()}</Text>
            <Text style={styles.heroTitle}>
              Do it.{'\n'}
              <Text style={styles.heroTitleAccent}>Don’t get caught.</Text>
            </Text>
            <Text style={styles.heroCopy}>Secret missions for parties, family nights and every hangout in between.</Text>
            <View style={styles.teaser}>
              <Text style={styles.teaserEmoji}>🤫</Text>
              <RotatingText lines={HOME_TEASERS} style={styles.teaserText} />
            </View>
          </LinearGradient>
          </Entrance>

          <Entrance index={1}>
            <PrimaryButton icon="play" label="PLAY NOW" onPress={() => setStage('setup')} tone="yellow" />
          </Entrance>
          <Entrance index={2}>
            <PrimaryButton icon="smartphone" label="PLAY ON EVERY PHONE" onPress={() => setStage('room-start')} tone="cyan" />
          </Entrance>

          <Entrance index={3} style={styles.tileRow}>
            <PartyTile
              accessibilityLabel={`Mission library, ${library.length + customMissions.length} missions`}
              onPress={() => openLibrary('home')}
              style={styles.tile}
              tone="pink"
            >
              <Text style={styles.tileEmoji}>📚</Text>
              <Text style={styles.tileTitle}>MISSIONS</Text>
              <Text style={styles.tileSub}>{library.length + customMissions.length} to play · edit</Text>
            </PartyTile>
            <PartyTile accessibilityLabel="Hall of Fame" onPress={() => setStage('fame')} style={styles.tile} tone="lime">
              <Text style={styles.tileEmoji}>🏅</Text>
              <Text style={styles.tileTitle}>HALL OF FAME</Text>
              <Text style={styles.tileSub}>badges & stats</Text>
            </PartyTile>
          </Entrance>

          <Text style={styles.sectionTitle}>PICK A VIBE</Text>
          <ScrollView contentContainerStyle={styles.vibeRow} horizontal showsHorizontalScrollIndicator={false}>
            {PACK_OPTIONS.map((pack, index) => (
              <Entrance index={4 + index} key={pack.id}>
              <PartyTile
                accessibilityLabel={`Play with ${pack.title} missions`}
                onPress={() => playVibe(pack.id)}
                style={styles.vibe}
                tone={TONE_CYCLE[index % TONE_CYCLE.length]}
              >
                <Text style={styles.vibeEmoji}>{pack.emoji}</Text>
                <Text style={styles.vibeTitle}>{pack.title}</Text>
                <Text style={styles.vibeCount}>{library.filter((template) => template.pack === pack.id).length} missions</Text>
              </PartyTile>
              </Entrance>
            ))}
          </ScrollView>

          <View style={styles.howCard}>
            <Text style={styles.sectionTitleInCard}>HOW TO PLAY</Text>
            {[
              ['🤫', 'Get a secret mission. Keep a straight face.'],
              ['🎯', 'Pull it off. Think someone’s after you? Call it out!'],
              ['🗳️', 'Reveal everything, swipe to vote, crown the winner.'],
            ].map(([emoji, text], index) => (
              <View key={text} style={styles.stepRow}>
                <View style={[styles.stepBadge, { backgroundColor: TONE_COLORS[TONE_CYCLE[index]].face }]}>
                  <Text style={styles.stepEmoji}>{emoji}</Text>
                </View>
                <Text style={styles.stepText}>{text}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.homeNote}>3–10 PLAYERS · ONE PHONE OR EVERYONE’S · NO ACCOUNTS</Text>
          <Text style={styles.credit}>✨ {BRAND.credit.toUpperCase()} ✨</Text>
        </ScrollView>
      )}

      {stage === 'missions' && (
        <MissionLibrary
          customMissions={customMissions}
          edits={missionEdits}
          onBack={() => setStage(libraryReturn)}
          onCustomMissionsChange={setCustomMissions}
          onEditsChange={setMissionEdits}
        />
      )}

      {stage === 'fame' && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <Eyebrow>ON THIS PHONE</Eyebrow>
          <Text style={styles.pageTitle}>Hall of Fame.</Text>
          <Text style={styles.pageCopy}>Lifetime stats and badges. Each badge unlocks a new avatar.</Text>
          {fameEntries.length === 0 && (
            <Entrance style={styles.emptyCard}>
              <Bob distance={6}>
                <Text style={styles.emptyEmoji}>🏆</Text>
              </Bob>
              <Text style={styles.emptyTitle}>No legends yet</Text>
              <Text style={styles.emptyCopy}>Finish a round and the stats, streaks and badges start piling up here.</Text>
              <PrimaryButton icon="play" label="PLAY A ROUND" onPress={() => setStage('setup')} tone="yellow" />
            </Entrance>
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
                confirmAction({
                  title: 'Clear the Hall of Fame?',
                  message: 'All lifetime stats and badges on this phone will be deleted.',
                  cancelText: 'Keep them',
                  confirmText: 'Clear',
                  onConfirm: () => {
                    void clearLifetime().then(() => setLifetime({}));
                  },
                })
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
                      icon="log-in" label={`REJOIN ${lastRoom.code}`}
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
                    placeholderTextColor={THEME.dim}
                    returnKeyType="done"
                    style={styles.nameInput}
                    value={roomNameInput}
                  />
                </View>
                <PrimaryButton
                  icon="radio" label="HOST A ROOM"
                  disabled={!roomName}
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
                    placeholderTextColor={THEME.dim}
                    returnKeyType="join"
                    style={[styles.nameInput, roomCodeInput ? styles.codeInput : null]}
                    value={roomCodeInput}
                  />
                </View>
                <PrimaryButton
                  icon="log-in" label="JOIN ROOM"
                  disabled={!roomName || !isValidRoomCode(roomCode)}
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
              ? `Friends open ${BRAND.name}, tap Private room, and join with this code. 3–10 people, you included.`
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
                  placeholderTextColor={THEME.dim}
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
                    <Icon color={THEME.muted} name="x" size={20} />
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
              {MODE_OPTIONS.map((option, index) => (
                <Entrance index={index} key={option.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedMode === option.id }}
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
                  <PopOnChange trigger={selectedMode === option.id ? 1 : 0}>
                    <Icon color={selectedMode === option.id ? THEME.yellowText : THEME.lineStrong} name={selectedMode === option.id ? 'check-circle' : 'circle'} size={26} />
                  </PopOnChange>
                </Pressable>
                </Entrance>
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
            <Eyebrow>MISSION PACKS · {packs.length} OF {PACK_OPTIONS.length}</Eyebrow>
            <View style={styles.chipRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: packs.length === PACK_OPTIONS.length }}
                onPress={() => {
                  haptic('select');
                  setPacks(packs.length === PACK_OPTIONS.length ? DEFAULT_SETUP.packs : PACK_OPTIONS.map((pack) => pack.id));
                }}
                style={[styles.setupChip, packs.length === PACK_OPTIONS.length && styles.setupChipSelected]}
              >
                <Text style={styles.setupChipText}>✨ ALL PACKS</Text>
              </Pressable>
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
                    <PopOnChange trigger={selected ? 'on' : 'off'}>
                      <Text style={styles.setupChipText}>
                        {pack.emoji} {pack.title}
                      </Text>
                    </PopOnChange>
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
            <Icon color={doubleAgent && doubleAgentAllowed ? THEME.yellowText : THEME.lineStrong} name={doubleAgent && doubleAgentAllowed ? 'check-circle' : 'circle'} size={26} />
          </Pressable>

          <PartyTile
            accessibilityLabel="Open the mission library"
            onPress={() => openLibrary('setup')}
            style={styles.optionBlock}
            tone="pink"
          >
            <View style={styles.libraryTile}>
              <Text style={styles.tileEmoji}>📚</Text>
              <View style={styles.modeCopy}>
                <Text style={styles.tileTitle}>MISSION LIBRARY</Text>
                <Text style={styles.tileSub}>
                  {library.filter((template) => packs.includes(template.pack)).length} missions in your packs
                  {customMissions.length ? ` + ${customMissions.length} of your own` : ''} · view, edit or add
                </Text>
              </View>
              <Icon color={THEME.onAccent} name="chevron-right" size={24} />
            </View>
          </PartyTile>

          <PrimaryButton
            icon="layers" label="DEAL THE MISSIONS"
            disabled={!canStart}
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
                  icon={missionVisible ? 'check' : 'lock'} label={missionVisible ? 'GOT IT' : 'HOLD THE CARD FIRST'}
                  disabled={!missionVisible}
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
            icon="zap" label="START THE CHAOS"
            disabled={!everyoneReady(players, hostRoom.readyNames)}
            onPress={startTimer}
          />
          {!everyoneReady(players, hostRoom.readyNames) && (
            <Pressable onPress={startTimer} style={styles.backLink}>
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
            icon={missionVisible ? 'arrow-right' : 'lock'} label={missionVisible ? 'GOT IT · PASS IT ON' : 'HOLD THE CARD TO SEE IT'}
            disabled={!missionVisible}
            onPress={finishDealing}
          />
          </ScrollView>
        </View>
      )}

      {stage === 'ready' && (
        <ScrollView contentContainerStyle={styles.centerPage}>
          <PopIn>
            <Text style={styles.bigEmoji}>🔐</Text>
          </PopIn>
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
          <PrimaryButton icon="zap" label="START THE CHAOS" onPress={startTimer} />
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
            <PrimaryButton icon="alert-octagon" label="CALL IT OUT" onPress={() => openSheet({ kind: 'callout' })} />
            <PrimaryButton
              icon={pastHalfway ? 'help-circle' : 'eye'} label={pastHalfway ? 'HINT / PEEK MY MISSION' : 'PEEK MY MISSION'}
              onPress={() => openSheet({ kind: 'peek', names: room ? [room.hostName] : null })}
              secondary
            />
          </View>
          <View style={styles.playingTip}>
            <Text style={styles.tipMark}>✳</Text>
            {secondsLeft <= 10 ? (
              <Text style={styles.tipText}>Final seconds. This is absolutely fine. Act normal.</Text>
            ) : (
              <View style={styles.tipRotator}>
                <RotatingText intervalMs={7000} lines={pastHalfway ? HALFWAY_TIPS : PLAYING_TIPS} style={styles.tipText} />
              </View>
            )}
          </View>
          <PrimaryButton icon="flag" label="END GAME & REVEAL" onPress={finishEarly} secondary />
        </ScrollView>
      )}

      {stage === 'reveal' && (
        !revealReady ? (
          <View style={styles.suspenseScreen}>
            <Wobble>
              <Text style={styles.suspenseSiren}>🚨</Text>
            </Wobble>
            <Eyebrow>MISSION REVEAL</Eyebrow>
            <Text style={styles.suspenseTitle}>Everybody act innocent.</Text>
            <Text style={styles.suspenseCopy}>{commentary}</Text>
            <SuspenseLights color={COLORS.orange} />
          </View>
        ) : (
          <GestureScrollView contentContainerStyle={styles.pageContent}>
            <Entrance style={[styles.revealBanner, roundIsTie && styles.tieBanner]}>
              {/* Stay neutral until the group has voted on every mission. */}
              <PopOnChange trigger={!allMissionsVoted ? 'vote' : roundIsTie ? 'tie' : completedPlayers.length ? 'win' : 'fail'}>
                <Text style={styles.revealEmoji}>
                  {!allMissionsVoted ? '🗳️' : roundIsTie ? '🤝' : completedPlayers.length ? '🎉' : '🫠'}
                </Text>
              </PopOnChange>
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
                              onPress={() => setMissionOutcome(player.name, true)}
                              style={[styles.outcomeButton, styles.successButton]}
                            >
                              <Icon color={THEME.onAccent} name="check" size={18} />
                              <Text style={styles.outcomeText}>THEY DID IT</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${player.name} did not do it`}
                              disabled={!votable}
                              onPress={() => setMissionOutcome(player.name, false)}
                              style={[styles.outcomeButton, styles.missedButton]}
                            >
                              <Icon color={THEME.onAccent} name="x" size={18} />
                              <Text style={styles.outcomeText}>NOPE</Text>
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
                            if (!selected) play('land');
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
            <PrimaryButton icon="share-2" label="SHARE THE RESULTS" onPress={() => setStage('share')} />
            {/* A rematch or wrap-up before every vote is in would drop this round from the scores. */}
            {!allMissionsVoted && (
              <Text style={styles.voteHint}>Vote on every mission to rematch or wrap the session.</Text>
            )}
            <PrimaryButton
              icon="rotate-ccw" label="REMATCH · RUN IT BACK"
              disabled={!allMissionsVoted}
              onPress={rematch}
              secondary
            />
            {roundsPlayed > 0 && allMissionsVoted && (
              <Pressable
                accessibilityRole="button"
                onPress={wrapSession}
                style={styles.backLink}
              >
                <Text style={styles.backLinkText}>WRAP THE SESSION</Text>
              </Pressable>
            )}
            <Pressable onPress={startFreshSession} style={styles.backLink}>
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
                      {crowned && <Stamp color={THEME.yellowText} text="👑 MISSION OF THE NIGHT" />}
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
          <PrimaryButton icon="rotate-ccw" label="REMATCH · SAME GROUP" onPress={rematch} />
          <PrimaryButton icon="share-2" label="SHARE THE RESULTS" onPress={() => setStage('share')} secondary />
          <Pressable onPress={startFreshSession} style={styles.backLink}>
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
            <LinearGradient
              colors={['#FFB3D6', '#FFD9A8', '#CDB8FF']}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.shareCardTop}>
              <Text style={styles.shareLogo}>{BRAND.name}</Text>
              <Text style={styles.shareTag}>{BRAND.tagline.toUpperCase()}</Text>
            </View>
            <View style={styles.shareContent}>
              <Text style={styles.shareSiren}>🚨</Text>
              <Text style={styles.shareHeading}>WE PLAYED{'\n'}{BRAND.name}</Text>
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
              <Text style={styles.shareHashtag}>{BRAND.hashtag}</Text>
              <Text style={styles.shareCredit}>{BRAND.credit.toUpperCase()}</Text>
            </View>
          </View>
          <PrimaryButton icon="share-2" label="SHARE" onPress={() => setShareOpen(true)} />
          <PrimaryButton icon="arrow-left" label="BACK TO RESULTS" onPress={() => setStage('reveal')} secondary />
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
      {stage === 'playing' && kickoffRound === roundId && <Kickoff onDone={() => setKickoffRound(0)} />}
      <Sheet onClose={() => setShareOpen(false)} visible={stage === 'share' && shareOpen}>
        <ShareOptions message={shareMessage} onShareImage={shareImage} />
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

// Every value below comes from the theme (src/theme.ts), so the whole game
// shares one look: "candy clay" with a blush background, party-coloured clay
// buttons, Nunito headings and DM Sans text.
const card = {
  backgroundColor: THEME.surface,
  borderRadius: RADIUS.lg,
  borderWidth: 1,
  borderColor: THEME.line,
  padding: 17,
} as const;

const styles = StyleSheet.create({
  // ---- frame
  root: { flex: 1 },
  rootBackground: { backgroundColor: THEME.bg },
  webColumn: { width: '100%', maxWidth: 520, alignSelf: 'center', overflow: 'hidden' },
  app: { flex: 1, backgroundColor: 'transparent', paddingTop: 8 },
  screen: { flex: 1 },
  topBar: { height: 58, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBack: { marginRight: 10, marginTop: -6 },
  headerBackText: { color: THEME.text, fontFamily: FONTS.black, fontSize: 22, lineHeight: 28 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: THEME.yellow,
    borderBottomWidth: 4,
    borderBottomColor: THEME.yellowEdge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  brandMarkText: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 21, lineHeight: 28 },
  brandName: { color: THEME.text, fontFamily: FONTS.black, fontSize: 21, letterSpacing: 1 },
  soundToggle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: THEME.surface,
    borderWidth: 2,
    borderColor: THEME.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundToggleText: { fontSize: 18 },
  confettiLayer: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  confettiPiece: { position: 'absolute', top: 50, fontSize: 26, fontFamily: FONTS.black },

  // ---- shared page pieces
  pageContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  centerPage: { flexGrow: 1, paddingHorizontal: 22, paddingVertical: 22, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { color: THEME.text, fontFamily: FONTS.black, fontSize: 34, lineHeight: 40, marginTop: 6 },
  pageCopy: { color: THEME.muted, fontFamily: FONTS.medium, fontSize: 15, lineHeight: 22, marginTop: 6 },
  bigEmoji: { fontSize: 66, marginBottom: 10 },
  backLink: { alignItems: 'center', paddingVertical: 18 },
  backLinkText: { color: THEME.muted, fontFamily: FONTS.black, fontSize: 13, letterSpacing: 1.2 },
  voteHint: { color: THEME.muted, fontFamily: FONTS.semi, fontSize: 13, textAlign: 'center', marginTop: 12 },
  validationText: { color: THEME.bad, fontFamily: FONTS.bold, fontSize: 14, marginTop: 8 },
  sectionTitle: { color: THEME.text, fontFamily: FONTS.black, fontSize: 18, letterSpacing: 1, marginTop: 26, marginBottom: 2 },
  sectionTitleInCard: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 14, letterSpacing: 1.4, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  setupChip: {
    backgroundColor: THEME.surface,
    borderWidth: 2,
    borderColor: THEME.lineStrong,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    minHeight: 42,
    justifyContent: 'center',
  },
  setupChipSelected: { backgroundColor: THEME.violet, borderColor: THEME.violetEdge, boxShadow: CLAY.gloss },
  setupChipText: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 13, letterSpacing: 0.4 },
  toastTitle: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 15 },
  toastCopy: { color: THEME.onAccent, fontFamily: FONTS.semi, fontSize: 12, marginTop: 2, opacity: 0.8 },

  // ---- home
  homeContent: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 },
  hero: { borderRadius: 30, padding: 22, paddingTop: 20, marginBottom: 8, overflow: 'hidden', minHeight: 300 },
  heroStickers: { position: 'absolute', right: 14, top: 10, alignItems: 'flex-end' },
  stickerBig: { fontSize: 64 },
  stickerSmall: { fontSize: 34, marginRight: 46, marginTop: -6 },
  heroKicker: {
    alignSelf: 'flex-start',
    color: THEME.text,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontFamily: FONTS.black,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  heroTitle: { color: THEME.text, fontFamily: FONTS.black, fontSize: 46, lineHeight: 48, marginTop: 18 },
  heroTitleAccent: { color: THEME.primary },
  heroCopy: { color: THEME.text, fontFamily: FONTS.semi, fontSize: 16, lineHeight: 22, marginTop: 10, maxWidth: 290, opacity: 0.95 },
  teaser: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: THEME.surface,
    borderWidth: 2,
    borderColor: THEME.line,
    boxShadow: '0px 6px 14px rgba(109, 40, 217, 0.12)',
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 18,
    transform: [{ rotate: '-2deg' }],
  },
  teaserEmoji: { fontSize: 20 },
  teaserText: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 15 },
  tileRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  tile: { flex: 1, marginTop: 10 },
  tileEmoji: { fontSize: 30 },
  tileTitle: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 16, letterSpacing: 0.6, marginTop: 4 },
  tileSub: { color: THEME.onAccent, fontFamily: FONTS.semi, fontSize: 12, opacity: 0.75 },
  tileArrow: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 34 },
  libraryTile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vibeRow: { gap: 10, paddingRight: 20, paddingBottom: 4 },
  vibe: { width: 120, marginTop: 10 },
  vibeEmoji: { fontSize: 32 },
  vibeTitle: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 13, marginTop: 6 },
  vibeCount: { color: THEME.onAccent, fontFamily: FONTS.semi, fontSize: 11, opacity: 0.75 },
  howCard: { ...card, marginTop: 24 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  stepBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepEmoji: { fontSize: 20 },
  stepText: { flex: 1, color: THEME.text, fontFamily: FONTS.semi, fontSize: 15, lineHeight: 20 },
  homeNote: { textAlign: 'center', color: THEME.dim, fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1, marginTop: 22 },
  credit: { textAlign: 'center', color: THEME.primary, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 2, marginTop: 8 },

  // ---- hall of fame
  fameCard: { ...card, marginTop: 14 },
  fameTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fameAvatar: { fontSize: 42 },
  fameName: { color: THEME.text, fontFamily: FONTS.black, fontSize: 21 },
  fameStats: { color: THEME.muted, fontFamily: FONTS.semi, fontSize: 12, lineHeight: 17 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  badge: {
    boxShadow: CLAY.card,
    width: '31%',
    flexGrow: 1,
    backgroundColor: THEME.surfaceHi,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: THEME.yellow,
    padding: 9,
    alignItems: 'center',
  },
  badgeLocked: { backgroundColor: THEME.surfaceLo, borderColor: THEME.line },
  badgeEmoji: { fontSize: 24 },
  badgeName: { color: THEME.text, fontFamily: FONTS.black, fontSize: 9, letterSpacing: 0.5, marginTop: 4, textAlign: 'center' },
  badgeHint: { color: THEME.muted, fontFamily: FONTS.medium, fontSize: 9, lineHeight: 12, marginTop: 2, textAlign: 'center' },

  // ---- rooms
  roomCard: { ...card, marginTop: 16, marginBottom: 6 },
  roomCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: THEME.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: THEME.line,
    padding: 24,
    marginTop: 18,
    boxShadow: CLAY.card,
  },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { color: THEME.text, fontFamily: FONTS.black, fontSize: 22, marginTop: 8 },
  emptyCopy: { color: THEME.muted, fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 4, marginBottom: 6 },
  roomCardCopy: { color: THEME.text, fontFamily: FONTS.medium, fontSize: 14, lineHeight: 20, marginTop: 6 },
  roomCode: { color: THEME.secondary, fontFamily: FONTS.black, fontSize: 62, letterSpacing: 12, marginVertical: 4 },
  roomStatus: { color: THEME.good, fontFamily: FONTS.black, fontSize: 11, letterSpacing: 1 },
  roomStatusBad: { color: THEME.bad },
  roomMember: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 16, paddingTop: 10 },
  roomInput: { marginTop: 20, marginBottom: 4 },
  roomDivider: { alignItems: 'center', marginTop: 26, marginBottom: 10 },
  roomDividerText: { color: THEME.muted, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 1.4 },
  codeInput: { letterSpacing: 8, fontSize: 22, fontFamily: FONTS.black },

  // ---- setup
  nameList: { marginTop: 20, gap: 10 },
  nameInputRow: {
    boxShadow: CLAY.card,
    minHeight: 60,
    backgroundColor: THEME.surface,
    borderWidth: 2,
    borderColor: THEME.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameInput: { flex: 1, minHeight: 56, color: THEME.text, fontFamily: FONTS.bold, fontSize: 17 },
  removeButton: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeButtonText: { color: THEME.muted, fontSize: 26 },
  addPlayer: { alignSelf: 'flex-start', paddingVertical: 14, paddingRight: 12 },
  addPlayerText: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 14, letterSpacing: 1 },
  modeBlock: { marginTop: 24 },
  modeList: { gap: 10, marginTop: 10 },
  modeOption: {
    boxShadow: CLAY.card,
    backgroundColor: THEME.surface,
    borderColor: THEME.line,
    borderWidth: 2,
    borderRadius: RADIUS.lg,
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modeSelected: { borderColor: THEME.yellowEdge, backgroundColor: '#FFF6DA', boxShadow: '0px 8px 18px rgba(224, 161, 0, 0.18)' },
  modeEmoji: { fontSize: 30 },
  modeCopy: { flex: 1 },
  modeTitle: { color: THEME.text, fontFamily: FONTS.black, fontSize: 16, letterSpacing: 0.5 },
  modeDescription: { color: THEME.muted, fontFamily: FONTS.medium, fontSize: 13, lineHeight: 17 },
  modeCheck: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 20 },
  durationBlock: { marginTop: 22 },
  durationOptions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  durationOption: {
    boxShadow: CLAY.card,
    flex: 1,
    height: 66,
    borderRadius: RADIUS.md,
    backgroundColor: THEME.surface,
    borderWidth: 2,
    borderColor: THEME.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  durationSelected: { backgroundColor: THEME.yellow, borderColor: THEME.yellowEdge, boxShadow: CLAY.gloss },
  durationNumber: { color: THEME.text, fontFamily: FONTS.black, fontSize: 26 },
  durationNumberSelected: { color: THEME.onAccent },
  durationUnit: { color: THEME.muted, fontFamily: FONTS.black, fontSize: 11, marginTop: 6 },
  optionBlock: { marginTop: 22 },
  segment: { flexDirection: 'row', backgroundColor: THEME.surfaceLo, borderRadius: RADIUS.md, padding: 4, marginTop: 10 },
  segmentOption: { flex: 1, minHeight: 44, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: THEME.violet, borderWidth: 2, borderColor: THEME.violetEdge, boxShadow: CLAY.gloss },
  segmentText: { color: THEME.text, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 0.6 },

  // ---- dealing
  progressHeader: { paddingHorizontal: 22, paddingTop: 14 },
  progressTrack: { height: 10, backgroundColor: THEME.surfaceLo, borderRadius: 5, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 10, backgroundColor: THEME.lime, borderRadius: 5 },
  phoneHandoff: { alignItems: 'center', marginBottom: 20 },
  handoffEmoji: { fontSize: 60, marginBottom: 4 },
  handoffTitle: { color: THEME.muted, fontFamily: FONTS.bold, fontSize: 16 },
  handoffName: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 44, lineHeight: 50, textAlign: 'center' },
  privateNudge: { color: THEME.cyanText, fontFamily: FONTS.bold, fontSize: 14, textAlign: 'center', marginTop: 8 },
  dealCard: { minHeight: 210 },
  readyNote: { color: THEME.good, fontFamily: FONTS.bold, fontSize: 14, textAlign: 'center', marginVertical: 8 },
  agentNotice: { color: THEME.pinkText, fontFamily: FONTS.black, fontSize: 15, textAlign: 'center', marginTop: 12 },
  readyPlayerList: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginVertical: 22 },
  readyPlayer: {
    color: THEME.text,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.line,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontFamily: FONTS.bold,
    fontSize: 14,
  },
  modeBadge: { backgroundColor: THEME.violet, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 6, marginTop: 16 },
  modeBadgeText: { color: THEME.text, fontFamily: FONTS.black, fontSize: 13, letterSpacing: 1 },

  // ---- playing
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.goodSoft,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    marginBottom: 18,
  },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: THEME.good, marginRight: 8 },
  liveText: { color: THEME.good, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 1.2 },
  timerLabel: { color: THEME.muted, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 2 },
  timer: { color: THEME.text, fontFamily: FONTS.black, fontSize: 58, lineHeight: 66, fontVariant: ['tabular-nums'] },
  timerUrgent: { color: THEME.bad },
  suddenDeathLabel: { color: THEME.pinkText, fontFamily: FONTS.black, fontSize: 13, letterSpacing: 1, marginTop: 8 },
  playingHeadline: { color: THEME.text, fontFamily: FONTS.black, fontSize: 30, marginTop: 12 },
  activeEvent: {
    boxShadow: CLAY.card,
    width: '100%',
    backgroundColor: THEME.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: THEME.yellow,
    padding: 14,
    marginTop: 14,
  },
  activeEventUrgent: { borderColor: THEME.bad, backgroundColor: THEME.badSoft },
  activeEventTitle: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 15, letterSpacing: 0.5 },
  activeEventText: { color: THEME.text, fontFamily: FONTS.semi, fontSize: 14, lineHeight: 19, marginTop: 2 },
  swapCard: { width: '100%', backgroundColor: THEME.violet, borderRadius: RADIUS.lg, padding: 16, marginTop: 12 },
  swapText: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 15, lineHeight: 20, marginTop: 4, marginBottom: 2 },
  calloutLog: { ...card, width: '100%', marginTop: 12, gap: 4 },
  calloutLine: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 14 },
  playButtons: { width: '100%', marginTop: 14 },
  playingTip: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surfaceLo,
    borderRadius: RADIUS.md,
    padding: 14,
    marginTop: 18,
    marginBottom: 6,
  },
  tipMark: { color: THEME.primary, fontSize: 20, marginRight: 10 },
  tipRotator: { flex: 1, minHeight: 38, justifyContent: 'center' },
  tipText: { color: THEME.text, fontFamily: FONTS.semi, fontSize: 14, lineHeight: 19, flexShrink: 1 },

  // ---- reveal
  suspenseScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  suspenseSiren: { fontSize: 76, marginBottom: 14 },
  suspenseTitle: { color: THEME.text, fontFamily: FONTS.black, fontSize: 34, lineHeight: 38, textAlign: 'center', marginTop: 8 },
  suspenseCopy: { color: THEME.primary, fontFamily: FONTS.bold, fontSize: 16, textAlign: 'center', marginTop: 10 },
  revealBanner: {
    boxShadow: CLAY.card,
    backgroundColor: THEME.surfaceHi,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: THEME.yellow,
    padding: 20,
    marginBottom: 16,
  },
  tieBanner: { borderColor: THEME.pink },
  revealEmoji: { fontSize: 44, marginBottom: 4 },
  comedyLine: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 18, lineHeight: 23, marginTop: 8 },
  revealEventNote: { color: THEME.cyanText, fontFamily: FONTS.bold, fontSize: 13, marginTop: 12 },
  reactionToast: {
    color: THEME.onAccent,
    backgroundColor: THEME.yellow,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontFamily: FONTS.bold,
    fontSize: 14,
    marginBottom: 12,
  },
  resultCard: { ...card, marginBottom: 12 },
  resultTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, marginRight: 8 },
  resultAvatar: { fontSize: 28 },
  resultPlayer: { flexShrink: 1, color: THEME.text, fontFamily: FONTS.black, fontSize: 19 },
  resultMission: { color: THEME.text, fontFamily: FONTS.semi, fontSize: 16, lineHeight: 22, marginTop: 8, marginBottom: 12 },
  resultNote: { color: THEME.cyanText, fontFamily: FONTS.bold, fontSize: 12, lineHeight: 16, marginTop: -6, marginBottom: 10 },
  resultOutcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  winPoints: { color: THEME.good, fontFamily: FONTS.black, fontSize: 15 },
  missedText: { color: THEME.bad, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 0.6 },
  autoNote: { color: THEME.muted, fontFamily: FONTS.semi, fontSize: 13 },
  outcomeButtons: { flexDirection: 'row', gap: 10 },
  outcomeButton: { flex: 1, flexDirection: 'row', gap: 6, borderRadius: RADIUS.md, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  successButton: { backgroundColor: THEME.lime, borderBottomWidth: 5, borderBottomColor: THEME.limeEdge },
  missedButton: { backgroundColor: '#FF9A9A', borderBottomWidth: 5, borderBottomColor: '#E05D5D' },
  outcomeText: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 14, letterSpacing: 0.4 },
  swipeHint: { color: THEME.dim, fontFamily: FONTS.black, fontSize: 11, letterSpacing: 1.2, textAlign: 'center', marginTop: 8 },
  creativeTag: { color: THEME.pinkText, fontFamily: FONTS.black, fontSize: 13, marginTop: 10 },
  denyButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6 },
  denyText: { color: THEME.orangeText, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 0.8 },
  calloutPoints: { color: THEME.cyanText, fontFamily: FONTS.black, fontSize: 13, marginTop: 10 },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.line,
  },
  reactionPrompt: { color: THEME.dim, fontFamily: FONTS.black, fontSize: 11, letterSpacing: 1 },
  reactionButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: THEME.surfaceLo, alignItems: 'center', justifyContent: 'center' },
  reactionEmoji: { fontSize: 19 },
  creativeBlock: {
    boxShadow: CLAY.card, ...card, backgroundColor: THEME.surfaceHi, borderWidth: 2, borderColor: THEME.pink, marginVertical: 4 },
  miniLeaderboard: { ...card, marginTop: 12, marginBottom: 12 },
  scoreSummaryTitle: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 15, letterSpacing: 1 },
  scoreSummaryCopy: { color: THEME.muted, fontFamily: FONTS.semi, fontSize: 13, marginTop: 2 },

  // ---- summary
  summaryEmoji: { fontSize: 60, marginBottom: 4 },
  summaryHighlight: {
    boxShadow: CLAY.card,
    backgroundColor: THEME.surfaceHi,
    borderRadius: RADIUS.lg,
    borderWidth: 3,
    borderColor: THEME.yellow,
    padding: 18,
    marginTop: 18,
    marginBottom: 14,
  },
  summaryHighlightTitle: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 22, lineHeight: 27, marginTop: 6 },
  summaryHighlightCopy: { color: THEME.muted, fontFamily: FONTS.bold, fontSize: 12, marginTop: 4 },
  summaryHistory: { ...card, marginTop: 4, marginBottom: 12 },
  historyRow: { borderTopWidth: 1, borderTopColor: THEME.line, paddingVertical: 11 },
  historyRound: { color: THEME.text, fontFamily: FONTS.black, fontSize: 13, letterSpacing: 0.5 },
  historyDetail: { color: THEME.muted, fontFamily: FONTS.semi, fontSize: 13, lineHeight: 18, marginTop: 2 },
  motnRow: { borderTopWidth: 1, borderTopColor: THEME.line, paddingVertical: 12, gap: 6 },
  motnCrowned: {
    backgroundColor: '#FFF4D6',
    borderRadius: RADIUS.md,
    borderTopWidth: 0,
    borderWidth: 2,
    borderColor: THEME.yellow,
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  motnFaded: { opacity: 0.4 },

  // ---- share card (what gets posted)
  shareCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    minHeight: 560,
    aspectRatio: 9 / 16,
    backgroundColor: THEME.pink,
    borderRadius: RADIUS.lg,
    borderWidth: 4,
    borderColor: THEME.surface,
    overflow: 'hidden',
    boxShadow: CLAY.raised,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    marginVertical: 22,
  },
  shareCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shareLogo: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 17, letterSpacing: 1.2 },
  shareTag: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 8, letterSpacing: 0.6, flexShrink: 1, textAlign: 'right' },
  shareContent: { flex: 1, justifyContent: 'center', paddingVertical: 14 },
  shareSiren: { fontSize: 36, marginBottom: 2 },
  shareHeading: { color: THEME.text, fontFamily: FONTS.black, fontSize: 40, lineHeight: 42 },
  shareSmallLabel: { color: THEME.secondary, fontFamily: FONTS.black, fontSize: 10, letterSpacing: 1.2, marginTop: 10, marginBottom: 8 },
  shareMission: { backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: RADIUS.sm, paddingVertical: 8, paddingHorizontal: 12, marginTop: 6 },
  sharePlayer: { color: THEME.cyanText, fontFamily: FONTS.black, fontSize: 11, letterSpacing: 0.8 },
  shareMissionText: { color: THEME.text, fontFamily: FONTS.semi, fontSize: 12, lineHeight: 16, marginTop: 1 },
  shareOutcome: { fontFamily: FONTS.black, fontSize: 10, letterSpacing: 0.6, marginTop: 2 },
  shareWin: { color: THEME.limeText },
  shareLoss: { color: THEME.pinkText },
  morePlayers: { color: THEME.muted, fontFamily: FONTS.bold, fontSize: 10, marginTop: 4 },
  shareCardBottom: { borderTopWidth: 2, borderTopColor: 'rgba(42,18,64,0.12)', paddingTop: 10 },
  shareFooter: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 0.8 },
  shareHashtag: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 14, marginTop: 2 },
  shareCredit: { color: THEME.dim, fontFamily: FONTS.black, fontSize: 8, letterSpacing: 1.2, marginTop: 4 },
});
