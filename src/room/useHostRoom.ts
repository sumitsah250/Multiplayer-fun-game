import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { closeRoomChannel, openRoomChannel } from './client';
import { ROOM_EVENTS, addReady, isCalloutMessage, isReadyMessage, membersFromPresence } from './protocol';
import type { CalloutMessage, RoomMember, RoomSnapshot } from './protocol';

export type HostRoom = { code: string; hostId: string; hostName: string; joinedAt: number; avatar: string };
export type RoomStatus = 'connecting' | 'live' | 'offline';

// The host's snapshot carries an absolute deadline, converted to "time left" at
// the moment of sending (see RoomSnapshot.remainingMs). Ready names are merged
// here from the guests' replies plus the host's own "got it".
export type HostSnapshot = Omit<RoomSnapshot, 'remainingMs' | 'readyNames'> & {
  endsAt: number | null;
  hostReady: boolean;
};

function readyNamesFor(
  snapshot: HostSnapshot,
  ready: { roundId: number; names: string[] },
  hostName: string,
): string[] {
  const guests = ready.roundId === snapshot.roundId ? ready.names : [];
  return snapshot.hostReady ? [hostName, ...guests] : guests;
}

export function useHostRoom(
  room: HostRoom | null,
  snapshot: HostSnapshot | null,
  onCallout: (message: CalloutMessage) => void,
) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [ready, setReady] = useState<{ roundId: number; names: string[] }>({ roundId: 0, names: [] });
  const channelRef = useRef<RealtimeChannel | null>(null);
  const snapshotRef = useRef(snapshot);
  const readyRef = useRef(ready);
  const hostNameRef = useRef(room?.hostName ?? '');
  const onCalloutRef = useRef(onCallout);
  useEffect(() => {
    onCalloutRef.current = onCallout;
  }, [onCallout]);

  const publish = useCallback(() => {
    const channel = channelRef.current;
    const current = snapshotRef.current;
    // Before the channel has joined, send() would fall back to a REST call; the
    // subscribe callback publishes as soon as it joins instead.
    if (!channel || !current || channel.state !== 'joined') return;
    const { endsAt, hostReady: _hostReady, ...rest } = current;
    const payload: RoomSnapshot = {
      ...rest,
      readyNames: readyNamesFor(current, readyRef.current, hostNameRef.current),
      remainingMs: endsAt === null ? null : Math.max(0, endsAt - Date.now()),
    };
    void channel.send({ type: 'broadcast', event: ROOM_EVENTS.snapshot, payload });
  }, []);

  const code = room?.code ?? null;
  const hostId = room?.hostId ?? null;
  const hostName = room?.hostName ?? null;
  const hostJoinedAt = room?.joinedAt ?? 0;
  const hostAvatar = room?.avatar ?? '';

  useEffect(() => {
    if (!code || !hostId || !hostName) return undefined;
    const channel = openRoomChannel(code, hostId);
    channelRef.current = channel;
    channel
      .on('presence', { event: 'sync' }, () => {
        setMembers(membersFromPresence(channel.presenceState()));
        // Someone joined or came back: bring them up to date.
        publish();
      })
      .on('broadcast', { event: ROOM_EVENTS.hello }, () => publish())
      .on('broadcast', { event: ROOM_EVENTS.ready }, ({ payload }) => {
        if (isReadyMessage(payload)) setReady((current) => addReady(current, payload));
      })
      .on('broadcast', { event: ROOM_EVENTS.callout }, ({ payload }) => {
        if (isCalloutMessage(payload)) onCalloutRef.current(payload);
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') {
          setStatus('live');
          // Track on every (re)subscribe so the host reappears after a reconnect.
          const me: RoomMember = { id: hostId, name: hostName, role: 'host', joinedAt: hostJoinedAt, avatar: hostAvatar };
          void channel.track(me);
          publish();
        } else {
          setStatus(state === 'CLOSED' ? 'connecting' : 'offline');
        }
      });
    return () => {
      void channel.send({ type: 'broadcast', event: ROOM_EVENTS.closed, payload: {} });
      closeRoomChannel(channel);
      channelRef.current = null;
      setMembers([]);
      setStatus('connecting');
      setReady({ roundId: 0, names: [] });
    };
  }, [code, hostAvatar, hostId, hostJoinedAt, hostName, publish]);

  useEffect(() => {
    snapshotRef.current = snapshot;
    readyRef.current = ready;
    hostNameRef.current = hostName ?? '';
    publish();
  }, [hostName, publish, ready, snapshot]);

  const readyNames = snapshot && hostName ? readyNamesFor(snapshot, ready, hostName) : [];
  // Another phone is already hosting this code (two hosts drew the same code).
  const codeTaken = members.some(
    (member) => member.role === 'host' && member.id !== hostId && member.joinedAt <= hostJoinedAt,
  );
  return { members: members.filter((member) => member.role !== 'host' || member.id === hostId), status, readyNames, codeTaken };
}
