// One sound board for the whole app. Sounds are short and quiet by design, play
// only on moments the player caused or is waiting for, and the same sound never
// stacks on itself. Mute is remembered on the device.
import { useAudioPlayer } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { loadSoundEnabled, saveSoundEnabled } from './storage';

// Game events only: no sound on ordinary button presses and no music.
export type SoundName =
  | 'secret'
  | 'reveal'
  | 'tick'
  | 'land'
  | 'start'
  | 'success'
  | 'nope'
  | 'busted'
  | 'wrong'
  | 'badge'
  | 'swap';

type SoundBoard = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  play: (name: SoundName) => void;
};

const SoundContext = createContext<SoundBoard>({ enabled: false, setEnabled: () => {}, play: () => {} });

// The same sound can't retrigger faster than this, so rapid taps never machine-gun.
const MIN_GAP_MS = 70;

export function SoundProvider({ children }: { children: ReactNode }) {
  const players = {
    secret: useAudioPlayer(require('../assets/sounds/secret.wav')),
    reveal: useAudioPlayer(require('../assets/sounds/reveal.wav')),
    tick: useAudioPlayer(require('../assets/sounds/tick.wav')),
    land: useAudioPlayer(require('../assets/sounds/land.wav')),
    start: useAudioPlayer(require('../assets/sounds/start.wav')),
    success: useAudioPlayer(require('../assets/sounds/success.wav')),
    nope: useAudioPlayer(require('../assets/sounds/nope.wav')),
    busted: useAudioPlayer(require('../assets/sounds/busted.wav')),
    wrong: useAudioPlayer(require('../assets/sounds/wrong.wav')),
    badge: useAudioPlayer(require('../assets/sounds/badge.wav')),
    swap: useAudioPlayer(require('../assets/sounds/swap.wav')),
  };
  const playersRef = useRef(players);
  const [enabled, setEnabledState] = useState(true);
  const enabledRef = useRef(true);
  const lastPlayed = useRef<Partial<Record<SoundName, number>>>({});

  useEffect(() => {
    playersRef.current = players;
  });

  useEffect(() => {
    let active = true;
    void loadSoundEnabled().then((saved) => {
      if (!active) return;
      enabledRef.current = saved;
      setEnabledState(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  const play = useCallback((name: SoundName) => {
    if (!enabledRef.current) return;
    const now = Date.now();
    if (now - (lastPlayed.current[name] ?? 0) < MIN_GAP_MS) return;
    lastPlayed.current[name] = now;
    const player = playersRef.current[name];
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // A sound failing to play must never interrupt the game.
    }
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    enabledRef.current = value;
    setEnabledState(value);
    saveSoundEnabled(value);
    if (!value) {
      // Stop anything still playing so muting takes effect immediately.
      for (const player of Object.values(playersRef.current)) player.pause();
    }
  }, []);

  const board = useMemo(() => ({ enabled, setEnabled, play }), [enabled, play, setEnabled]);
  return <SoundContext.Provider value={board}>{children}</SoundContext.Provider>;
}

export function useSound() {
  return useContext(SoundContext);
}
