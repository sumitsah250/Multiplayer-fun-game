// A guest phone in a private room. It shows only this player's own mission,
// follows the host's timer, sends call-outs, and watches the reveal; the host
// phone runs the game and the voting.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';

import {
  MODE_OPTIONS,
  applyRoundToLifetime,
  canCallOut,
  chaosRuleSecondsLeft,
  isPastHalfway,
  makeRoundRecord,
  newBadges,
  playerKey,
  playerRoundPoints,
  secondsRemaining,
} from '../gameLogic';
import type { Badge, ChaosEvent } from '../gameLogic';
import { CallOutPanel, ChaosEventCard, DifficultyTag, Leaderboard, MissionBody, PeekPanel } from '../gameUi';
import { haptic, hapticPattern } from '../haptics';
import { BustedOverlay, Entrance, HoldToReveal, Sheet, Stamp, TONES, TimerRing, Toast } from '../motion';
import type { BustEvent } from '../motion';
import { updateLifetime } from '../storage';
import { COLORS, Eyebrow, KeepScreenAwake, PrimaryButton, ProtectMissions } from '../ui';
import { closeRoomChannel, openRoomChannel } from './client';
import {
  ROOM_EVENTS,
  chaosEventById,
  isNameTaken,
  isReady,
  membersFromPresence,
  missionFor,
  normalizeSnapshot,
  outcomeFromSnapshot,
} from './protocol';
import type { CalloutMessage, RoomMember, RoomSnapshot } from './protocol';

type GuestStatus = 'connecting' | 'live' | 'offline' | 'not-found' | 'name-taken' | 'closed';

// How long to wait for the host to show up before saying the code is wrong.
const HOST_LOOKUP_MS = 8000;

function useGuestRoom(code: string, name: string, memberId: string, avatar: string) {
  const [status, setStatus] = useState<GuestStatus>('connecting');
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [hostAway, setHostAway] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // A saved member id means this phone is coming back to the same seat.
  const [me] = useState<RoomMember>(() => ({
    id: memberId,
    name: name.trim(),
    role: 'guest',
    joinedAt: Date.now(),
    avatar,
  }));

  useEffect(() => {
    const channel = openRoomChannel(code, me.id);
    channelRef.current = channel;
    let hostSeen = false;
    let ended = false;
    let lookupTimer: ReturnType<typeof setTimeout> | null = null;

    const end = (finalStatus: GuestStatus) => {
      if (ended) return;
      ended = true;
      setStatus(finalStatus);
      void channel.untrack();
      closeRoomChannel(channel);
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        const current = membersFromPresence(channel.presenceState());
        setMembers(current);
        const host = current.some((member) => member.role === 'host');
        if (host) hostSeen = true;
        setHostAway(hostSeen && !host);
        if (current.some((member) => member.id === me.id) && isNameTaken(current, me)) end('name-taken');
      })
      .on('broadcast', { event: ROOM_EVENTS.snapshot }, ({ payload }) => {
        const next = normalizeSnapshot(payload);
        if (!next) return;
        hostSeen = true;
        setSnapshot(next);
        setEndsAt(next.remainingMs === null ? null : Date.now() + next.remainingMs);
      })
      .on('broadcast', { event: ROOM_EVENTS.closed }, () => end('closed'))
      .subscribe((state) => {
        if (ended) return;
        if (state === 'SUBSCRIBED') {
          setStatus('live');
          void channel.track(me);
          void channel.send({ type: 'broadcast', event: ROOM_EVENTS.hello, payload: {} });
          lookupTimer ??= setTimeout(() => {
            if (!hostSeen) end('not-found');
          }, HOST_LOOKUP_MS);
        } else {
          setStatus(state === 'CLOSED' ? 'connecting' : 'offline');
        }
      });

    return () => {
      if (lookupTimer) clearTimeout(lookupTimer);
      if (!ended) {
        ended = true;
        void channel.untrack();
        closeRoomChannel(channel);
      }
      channelRef.current = null;
    };
  }, [code, me]);

  const sendReady = useCallback((roundId: number) => {
    void channelRef.current?.send({
      type: 'broadcast',
      event: ROOM_EVENTS.ready,
      payload: { roundId, name: me.name },
    });
  }, [me.name]);

  const sendCallout = useCallback((roundId: number, suspect: string, guess: string) => {
    const payload: CalloutMessage = { roundId, accuser: me.name, suspect, guess };
    void channelRef.current?.send({ type: 'broadcast', event: ROOM_EVENTS.callout, payload });
  }, [me.name]);

  return { status, members, snapshot, endsAt, hostAway, sendReady, sendCallout, me };
}

function useCountdown(endsAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [endsAt]);
  return endsAt === null ? null : secondsRemaining(endsAt, now);
}

function formatTimer(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function chaosLine(event: ChaosEvent, snapshot: RoomSnapshot, ruleLeft: number) {
  if (event.activeSeconds) return ruleLeft > 0 ? `${event.activeText} for ${ruleLeft}s more!` : event.afterText ?? '';
  if (event.id === 'bounty') return `🎯 ${snapshot.bountyName ?? 'The bounty'}’s mission is worth triple.`;
  if (event.id === 'swap') return snapshot.swapped ? '🔀 Two players just traded missions.' : 'Two players swap missions at halfway.';
  if (event.id === 'double-down') return 'Completed missions are worth double.';
  return event.instruction;
}

export function GuestRoom({
  code,
  name,
  memberId,
  avatar,
  onExit,
}: {
  code: string;
  name: string;
  memberId: string;
  avatar: string;
  // `keepSeat` false forgets the saved room, so it isn't offered for rejoining.
  onExit: (keepSeat: boolean) => void;
}) {
  const { status, members, snapshot, endsAt, hostAway, sendReady, sendCallout, me } = useGuestRoom(code, name, memberId, avatar);
  const secondsLeft = useCountdown(snapshot?.phase === 'playing' ? endsAt : null);
  const [seenRound, setSeenRound] = useState(0);
  const [readyRound, setReadyRound] = useState(0);
  const [spunRound, setSpunRound] = useState(0);
  // The sheet belongs to the round it was opened in, so it never outlives that round's play phase.
  const [openSheetState, setSheet] = useState<{ kind: 'callout' | 'peek'; roundId: number } | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [bust, setBust] = useState<BustEvent | null>(null);
  const [notices, setNotices] = useState<{ name: string; badge: Badge }[]>([]);
  const seenCallouts = useRef<{ roundId: number; count: number } | null>(null);
  const recordedRounds = useRef(new Set<number>());
  const swapNotified = useRef(0);
  const bustKey = useRef(0);

  const myPlayer = snapshot ? missionFor(snapshot, me.name) : null;
  const roundId = snapshot?.roundId ?? 0;
  const phase = snapshot?.phase ?? 'lobby';
  const chaosEvent = snapshot ? chaosEventById(snapshot.chaosEventId) : null;
  const iAmReady = readyRound === roundId || (snapshot ? isReady(snapshot.readyNames, me.name) : false);
  const durationSeconds = snapshot?.durationSeconds ?? 0;
  const elapsed = Math.max(0, durationSeconds - (secondsLeft ?? durationSeconds));
  const hintsOpen = phase === 'playing' && isPastHalfway(elapsed, durationSeconds);
  const missionOutcome = snapshot
    ? { mode: snapshot.mode, event: chaosEvent, bountyName: snapshot.bountyName }
    : { mode: 'classic' as const, event: null, bountyName: null };
  const sheet = openSheetState && openSheetState.roundId === roundId && phase === 'playing' ? openSheetState.kind : null;
  const iWasSwapped = Boolean(
    snapshot?.swapped && snapshot.swapPair?.some((entry) => playerKey(entry) === playerKey(me.name)),
  );

  // Close the mission sheet whenever the app leaves the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setSheet(null);
    });
    return () => subscription.remove();
  }, []);

  // Buzz when the host deals, so phones lying on the table get noticed.
  const lastBuzzedRound = useRef(0);
  useEffect(() => {
    if (phase !== 'missions' || !myPlayer || lastBuzzedRound.current === roundId) return;
    lastBuzzedRound.current = roundId;
    hapticPattern(['heavy', 'tick', 'heavy'], 110);
  }, [myPlayer, phase, roundId]);

  // My mission was swapped: buzz once.
  useEffect(() => {
    if (!iWasSwapped || swapNotified.current === roundId) return;
    swapNotified.current = roundId;
    hapticPattern(['heavy', 'tick', 'heavy'], 120);
  }, [iWasSwapped, roundId]);

  // Show BUSTED for new call-outs (but not for ones that happened before this phone joined).
  useEffect(() => {
    if (!snapshot) return;
    const count = snapshot.callouts.length;
    const seen = seenCallouts.current;
    seenCallouts.current = { roundId: snapshot.roundId, count };
    if (!seen || seen.roundId !== snapshot.roundId || count <= seen.count) return;
    const latest = snapshot.callouts[count - 1];
    const suspect = missionFor(snapshot, latest.suspect);
    bustKey.current += 1;
    setBust({ key: bustKey.current, correct: latest.correct, accuser: latest.accuser, suspect: latest.suspect, mission: suspect?.mission ?? '' });
  }, [snapshot]);

  // Record my own round in this phone's Hall of Fame once every mission has an outcome.
  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'reveal' || !snapshot.revealReady || !myPlayer) return;
    if (!snapshot.players.every((player) => player.completed !== null)) return;
    if (recordedRounds.current.has(snapshot.roundId)) return;
    recordedRounds.current.add(snapshot.roundId);
    const record = makeRoundRecord(snapshot.roundsPlayed, snapshot.players, outcomeFromSnapshot(snapshot));
    void updateLifetime((current) => applyRoundToLifetime(current, record, me.name)).then(({ before, after }) => {
      const earned = newBadges(before, after);
      if (earned.length) setNotices((queue) => [...queue, ...earned]);
    });
  }, [me.name, myPlayer, snapshot]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (bust) setBust(null);
      else if (sheet) setSheet(null);
      // Back never drops you out of a room; use Leave room for that.
      return true;
    });
    return () => subscription.remove();
  }, [bust, sheet]);

  const confirmReady = () => {
    setReadyRound(roundId);
    sendReady(roundId);
    haptic('success');
  };

  const openSheet = (kind: 'callout' | 'peek') => {
    setSheetKey((key) => key + 1);
    setSheet({ kind, roundId });
  };

  const notice = notices[0];
  const overlays = (
    <>
      <Sheet onClose={() => setSheet(null)} visible={phase === 'playing' && sheet !== null && Boolean(myPlayer)}>
        {snapshot && sheet === 'callout' && (
          <CallOutPanel
            callouts={snapshot.callouts}
            fixedAccuser={me.name}
            key={sheetKey}
            onClose={() => setSheet(null)}
            onSubmit={(_accuser, suspect, guess) => sendCallout(roundId, suspect, guess)}
            players={snapshot.players}
          />
        )}
        {snapshot && sheet === 'peek' && myPlayer && (
          <PeekPanel
            event={chaosEvent}
            fixedName={me.name}
            hintsOpen={hintsOpen}
            key={sheetKey}
            onClose={() => setSheet(null)}
            outcome={missionOutcome}
            players={[myPlayer]}
            title={iWasSwapped ? '🔀 YOUR (NEW) MISSION' : undefined}
          />
        )}
      </Sheet>
      <BustedOverlay event={bust} onDone={() => setBust(null)} />
      {notice && (
        <Toast key={notice.badge.id} onDone={() => setNotices((queue) => queue.slice(1))}>
          <Text style={styles.toastTitle}>
            {notice.badge.avatar}  You unlocked {notice.badge.name}
          </Text>
          <Text style={styles.toastCopy}>New avatar unlocked. {notice.badge.description}</Text>
        </Toast>
      )}
    </>
  );

  if (status === 'not-found' || status === 'name-taken' || status === 'closed') {
    const copy = {
      'not-found': ['No room found', `Nobody is hosting room ${code} right now. Check the code with the host and try again.`],
      'name-taken': ['That name is taken', `Someone in room ${code} is already called ${me.name}. Pick a different name and join again.`],
      closed: ['Room closed', 'The host closed the room. Thanks for playing!'],
    }[status];
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.bigEmoji}>{status === 'closed' ? '👋' : '🤔'}</Text>
        <Text style={styles.title}>{copy[0]}</Text>
        <Text style={styles.copy}>{copy[1]}</Text>
        <PrimaryButton label="BACK" onPress={() => onExit(false)} />
      </ScrollView>
    );
  }

  const header = (
    <View style={styles.roomBar}>
      <Eyebrow>
        ROOM {code} · {me.avatar} {me.name.toUpperCase()}
      </Eyebrow>
      <Text style={[styles.connection, status !== 'live' && styles.connectionBad]}>
        {status === 'live' ? (hostAway ? 'WAITING FOR HOST' : '● LIVE') : status === 'offline' ? 'RECONNECTING…' : 'CONNECTING…'}
      </Text>
    </View>
  );

  const leave = <PrimaryButton label="LEAVE ROOM" onPress={() => onExit(false)} secondary />;

  if (!snapshot || phase === 'lobby' || (!myPlayer && phase !== 'reveal')) {
    const roundInProgress = snapshot && phase !== 'lobby' && !myPlayer;
    return (
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={styles.page}>
          {header}
          <Text style={styles.bigEmoji}>{roundInProgress ? '⏳' : '🛋️'}</Text>
          <Text style={styles.title}>{roundInProgress ? 'Round in progress.' : 'You’re in.'}</Text>
          <Text style={styles.copy}>
            {roundInProgress
              ? 'You joined mid-round. You’ll get a mission when the host deals the next one.'
              : status === 'live'
                ? 'Hang tight. Your mission shows up here when the host deals.'
                : 'Connecting to the room…'}
          </Text>
          <View style={styles.card}>
            <Eyebrow>IN THE ROOM · {members.length}</Eyebrow>
            {members.map((member, index) => (
              <Entrance index={index} key={member.id}>
                <Text style={styles.memberRow}>
                  {member.avatar ?? '😎'}  {member.name}
                  {member.role === 'host' ? '  · HOST' : ''}
                  {member.id === me.id ? '  · YOU' : ''}
                </Text>
              </Entrance>
            ))}
          </View>
          {leave}
        </ScrollView>
        {overlays}
      </View>
    );
  }

  if (phase === 'missions' && myPlayer) {
    return (
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={styles.page}>
          {header}
          <ProtectMissions />
          <Text style={styles.bigEmoji}>{myPlayer.avatar}</Text>
          <Eyebrow>YOUR PRIVATE MISSION</Eyebrow>
          {chaosEvent && (
            <ChaosEventCard
              bountyName={snapshot.bountyName}
              event={chaosEvent}
              key={`chaos-${roundId}`}
              onSpun={() => setSpunRound(roundId)}
              spin={spunRound !== roundId}
            />
          )}
          {snapshot.players.some((player) => player.role === 'double-agent') && (
            <Text style={styles.footnote}>🕵️ One of you is a double agent.</Text>
          )}
          <Text style={styles.title}>{iAmReady ? 'Phone face down.' : 'Make sure nobody’s looking.'}</Text>
          <HoldToReveal key={`card-${roundId}`} onReveal={() => setSeenRound(roundId)} style={styles.missionCard}>
            <MissionBody event={chaosEvent} hint={false} outcome={missionOutcome} player={myPlayer} />
          </HoldToReveal>
          {iAmReady ? (
            <Text style={styles.copy}>
              Waiting for everyone to check their mission. {snapshot.readyNames.length} of {snapshot.players.length} ready.
            </Text>
          ) : (
            <PrimaryButton
              disabled={seenRound !== roundId}
              label={seenRound === roundId ? 'GOT IT  ✓' : 'HOLD THE CARD FIRST'}
              onPress={confirmReady}
            />
          )}
          {leave}
        </ScrollView>
        {overlays}
      </View>
    );
  }

  if (phase === 'playing' && myPlayer) {
    const shownSeconds = secondsLeft ?? durationSeconds;
    const ruleLeft = chaosRuleSecondsLeft(chaosEvent, elapsed);
    return (
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={styles.page}>
          {header}
          <KeepScreenAwake />
          {sheet && <ProtectMissions tag="guest-sheet" />}
          <View style={styles.center}>
            <TimerRing secondsLeft={shownSeconds} size={210} totalSeconds={durationSeconds}>
              <Eyebrow>TIME LEFT</Eyebrow>
              <Text style={[styles.timer, shownSeconds <= 30 && styles.timerUrgent]}>{formatTimer(shownSeconds)}</Text>
            </TimerRing>
          </View>
          <Text style={[styles.title, styles.centerText]}>Act natural.</Text>
          {chaosEvent && (
            <View style={styles.chaosCard}>
              <Text style={styles.chaosName}>
                ⚡ {chaosEvent.name}
                {ruleLeft > 0 ? ' · ACTIVE' : ''}
              </Text>
              <Text style={styles.chaosRule}>{chaosLine(chaosEvent, snapshot, ruleLeft)}</Text>
            </View>
          )}
          {iWasSwapped && (
            <Entrance style={styles.swapCard}>
              <Eyebrow>🔀 SWAP!</Eyebrow>
              <Text style={styles.swapText}>You traded missions with someone. Peek at your new one.</Text>
            </Entrance>
          )}
          {snapshot.callouts.length > 0 && (
            <View style={styles.card}>
              {snapshot.callouts.map((callout, index) => (
                <Text key={`${callout.accuser}-${index}`} style={styles.calloutLine}>
                  {callout.correct
                    ? `🚨 ${callout.accuser} busted ${callout.suspect}`
                    : `❌ ${callout.accuser}’s call on ${callout.suspect} missed`}
                </Text>
              ))}
            </View>
          )}
          <PrimaryButton
            disabled={!canCallOut(snapshot.callouts, me.name)}
            label={canCallOut(snapshot.callouts, me.name) ? '🚨  CALL IT OUT' : 'CALL-OUT USED'}
            onPress={() => openSheet('callout')}
          />
          <PrimaryButton
            label={hintsOpen ? '💡  HINT / PEEK MY MISSION' : '🤫  PEEK MY MISSION'}
            onPress={() => openSheet('peek')}
            secondary
          />
          <Text style={styles.footnote}>The host ends the round. Results show up here.</Text>
          {leave}
        </ScrollView>
        {overlays}
      </View>
    );
  }

  // Reveal: everyone watches the votes come in on their own phone.
  const modeTitle = MODE_OPTIONS.find((option) => option.id === snapshot.mode)?.title ?? 'CLASSIC';
  const outcome = outcomeFromSnapshot(snapshot);
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.page}>
        {header}
        {!snapshot.revealReady ? (
          <>
            <Text style={styles.bigEmoji}>🚨</Text>
            <Text style={styles.title}>Everybody act innocent.</Text>
          </>
        ) : (
          <>
            <Eyebrow>MISSION REVEAL · {modeTitle}</Eyebrow>
            <Text style={styles.title}>The secret’s out.</Text>
            <Text style={styles.copy}>The host is recording the group’s votes.</Text>
            {snapshot.players.map((player, index) => {
              const caughtBy = snapshot.callouts.find(
                (callout) => callout.correct && playerKey(callout.suspect) === playerKey(player.name),
              );
              const points = playerRoundPoints(player, outcome);
              return (
                <Entrance index={index} key={`${roundId}-${player.name}`} style={styles.card}>
                  <View style={styles.resultTop}>
                    <Text style={styles.resultName}>
                      {player.avatar}  {player.name}
                      {playerKey(player.name) === playerKey(me.name) ? '  · YOU' : ''}
                    </Text>
                    <DifficultyTag outcome={missionOutcome} player={player} />
                  </View>
                  <Text style={styles.resultMission}>{player.mission}</Text>
                  <View style={styles.resultOutcome}>
                    {caughtBy ? (
                      <>
                        <Stamp color={TONES.red} text="BUSTED" />
                        <Text style={styles.fail}>BY {caughtBy.accuser.toUpperCase()}</Text>
                      </>
                    ) : player.completed === null ? (
                      <Text style={styles.voting}>
                        {snapshot.deniedNames.some((entry) => playerKey(entry) === playerKey(player.name))
                          ? '⚖️ DISPUTED · RE-VOTING…'
                          : 'VOTING…'}
                      </Text>
                    ) : (
                      <>
                        <Stamp
                          color={player.completed ? TONES.greenInk : TONES.red}
                          text={player.completed ? 'NAILED IT' : 'NOPE'}
                        />
                        <Text style={styles.points}>{points.total > 0 ? `+${points.total.toLocaleString()}` : points.total} PTS</Text>
                      </>
                    )}
                  </View>
                  {snapshot.creativeName && playerKey(snapshot.creativeName) === playerKey(player.name) && (
                    <Text style={styles.creative}>🎨 MOST CREATIVE</Text>
                  )}
                </Entrance>
              );
            })}
            {snapshot.scores.length > 0 && (
              <View style={styles.card}>
                <Eyebrow>
                  SESSION SCORE · {snapshot.roundsPlayed} {snapshot.roundsPlayed === 1 ? 'ROUND' : 'ROUNDS'}
                </Eyebrow>
                <Leaderboard
                  entries={snapshot.scores.map((score) => ({
                    name: score.name,
                    avatar: missionFor(snapshot, score.name)?.avatar,
                    score: score.score,
                    streak: score.streak,
                  }))}
                />
              </View>
            )}
            <Text style={styles.footnote}>Stay here. The next round arrives when the host deals it.</Text>
          </>
        )}
        {leave}
      </ScrollView>
      {overlays}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 34 },
  center: { alignItems: 'center', marginTop: 4 },
  centerText: { textAlign: 'center' },
  roomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  connection: { color: '#527D22', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  connectionBad: { color: '#BA4938' },
  bigEmoji: { fontSize: 50, marginTop: 12, marginBottom: 10 },
  title: { color: COLORS.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -1, marginTop: 8 },
  copy: { color: COLORS.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 12 },
  footnote: { color: COLORS.muted, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: COLORS.card, borderRadius: 17, padding: 17, marginTop: 12 },
  memberRow: { color: COLORS.ink, fontSize: 14, fontWeight: '800', paddingTop: 10 },
  chaosCard: { backgroundColor: COLORS.green, borderRadius: 17, padding: 15, marginTop: 14 },
  chaosName: { color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  chaosRule: { color: COLORS.ink, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 6 },
  swapCard: { backgroundColor: '#E8DFFF', borderRadius: 17, padding: 15, marginTop: 12 },
  swapText: { color: COLORS.ink, fontSize: 13, lineHeight: 19, fontWeight: '800', marginTop: 6 },
  calloutLine: { color: COLORS.ink, fontSize: 12, fontWeight: '800', paddingVertical: 3 },
  missionCard: { marginTop: 16, minHeight: 190 },
  timer: { color: COLORS.ink, fontSize: 52, fontWeight: '900', letterSpacing: -2, textAlign: 'center', fontVariant: ['tabular-nums'] },
  timerUrgent: { color: '#CF553F' },
  resultTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  resultName: { color: COLORS.ink, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  resultMission: { color: COLORS.ink, fontSize: 13, lineHeight: 19, marginTop: 8 },
  resultOutcome: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  voting: { color: COLORS.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  points: { color: '#527D22', fontSize: 10, fontWeight: '900' },
  fail: { color: '#BC5745', fontSize: 10, fontWeight: '900' },
  creative: { color: '#6B4FD1', fontSize: 10, fontWeight: '900', marginTop: 10 },
  toastTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  toastCopy: { color: '#B9C0B8', fontSize: 11, fontWeight: '700', marginTop: 3 },
});
