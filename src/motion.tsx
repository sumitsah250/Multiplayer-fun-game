// Animation building blocks for the game, built on Reanimated (UI thread) and
// Gesture Handler. Every component here handles reduced motion itself: it
// keeps opacity and colour changes and drops movement, scale and overshoot.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  LinearTransition,
  SlideInDown,
  SlideOutDown,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { CHAOS_EVENTS } from './gameLogic';
import { haptic, hapticPattern } from './haptics';
import { useSound } from './sounds';
import { CLAY, FONTS, RADIUS, THEME } from './theme';

export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

// Exit animations don't reliably finish in the browser (the element can stay on
// screen and keep blocking taps), so on the web things just disappear.
function exitOnNative<T>(animation: T): T | undefined {
  return Platform.OS === 'web' ? undefined : animation;
}

export const TONES = {
  green: THEME.good,
  greenInk: THEME.good,
  yellow: THEME.yellowEdge,
  orange: THEME.orangeEdge,
  red: THEME.bad,
};

// ---- Hold to reveal -------------------------------------------------------
// The mission only shows while a thumb is on the card, so passing the phone
// (or glancing at it mid-round) never leaves a secret on screen.
export function HoldToReveal({
  children,
  label = 'HOLD TO REVEAL',
  onReveal,
  style,
}: {
  children: ReactNode;
  label?: string;
  onReveal?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const [revealed, setRevealed] = useState(false);

  const show = () => {
    setRevealed(true);
    progress.set(withTiming(1, { duration: reduced ? 0 : 180, easing: EASE_OUT }));
    haptic('select');
    onReveal?.();
  };
  const hide = () => {
    setRevealed(false);
    progress.set(withTiming(0, { duration: reduced ? 0 : 140, easing: EASE_OUT }));
  };

  const contentStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: reduced ? [] : [{ scale: 0.97 + progress.get() * 0.03 }],
  }));
  const coverStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: reduced ? [] : [{ translateY: progress.get() * -10 }, { scale: 1 - progress.get() * 0.03 }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={revealed ? 'Mission showing. Double tap to hide.' : label}
      accessibilityHint="Hold to show your mission. Let go to hide it."
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => (revealed ? hide() : show())}
      onPressIn={show}
      onPressOut={hide}
      pressRetentionOffset={40}
      style={[motionStyles.holdCard, style]}
    >
      <Animated.View
        accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
        style={contentStyle}
      >
        {children}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, motionStyles.holdCover, coverStyle]}>
        <Text style={motionStyles.holdIcon}>👆</Text>
        <Text style={motionStyles.holdLabel}>{label}</Text>
        <Text style={motionStyles.holdHint}>Let go and it hides again.</Text>
      </Animated.View>
    </Pressable>
  );
}

// ---- Chaos slot machine ---------------------------------------------------
// Rolls through the event names and lands on this round's rule. Rare moment,
// so it gets the delight budget: ticks slow down like a real reel.
const SLOT_TICKS = 14;

export function ChaosSlot({
  name,
  spin,
  onLanded,
  textStyle,
}: {
  name: string;
  spin: boolean;
  onLanded?: () => void;
  textStyle?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const { play } = useSound();
  const rolling = spin && !reduced;
  const [tick, setTick] = useState(0);
  const pop = useSharedValue(1);
  const onLandedRef = useRef(onLanded);
  const playRef = useRef(play);
  useEffect(() => {
    onLandedRef.current = onLanded;
    playRef.current = play;
  }, [onLanded, play]);

  useEffect(() => {
    if (!spin) return undefined;
    if (reduced) {
      playRef.current('land');
      onLandedRef.current?.();
      return undefined;
    }
    let current = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      current += 1;
      setTick(current);
      if (current >= SLOT_TICKS) {
        haptic('success');
        playRef.current('land');
        pop.set(
          withSequence(
            withTiming(1.08, { duration: 110, easing: EASE_OUT }),
            withSpring(1, { duration: 400, dampingRatio: 0.55 }),
          ),
        );
        onLandedRef.current?.();
        return;
      }
      haptic('select');
      timer = setTimeout(step, 45 + current * current * 1.6);
    };
    timer = setTimeout(step, 120);
    return () => clearTimeout(timer);
  }, [pop, reduced, spin]);

  const names = CHAOS_EVENTS.map((event) => event.name);
  const landed = !rolling || tick >= SLOT_TICKS;
  const shown = landed ? name : names[(names.indexOf(name) + tick + 1) % names.length];
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <View accessibilityLabel={landed ? name : 'Picking the chaos rule'} style={motionStyles.slotWindow}>
      <Animated.View style={popStyle}>
        <Animated.Text
          entering={rolling && !landed ? FadeInUp.duration(80) : undefined}
          key={`${tick}-${shown}`}
          style={textStyle}
        >
          {shown}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

// ---- Countdown ring -------------------------------------------------------
// A ring that drains green → yellow → orange → red, and beats in the last 10s.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function TimerRing({
  secondsLeft,
  totalSeconds,
  size = 236,
  stroke = 14,
  children,
}: {
  secondsLeft: number;
  totalSeconds: number;
  size?: number;
  stroke?: number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = totalSeconds > 0 ? Math.min(1, secondsLeft / totalSeconds) : 0;
  const fraction = useSharedValue(target);
  const beat = useSharedValue(1);

  useEffect(() => {
    // Linear: the drain is constant motion, timed to land as the next second ticks.
    fraction.set(withTiming(target, { duration: reduced ? 0 : 1000, easing: Easing.linear }));
  }, [fraction, reduced, target]);

  useEffect(() => {
    if (reduced || secondsLeft > 10 || secondsLeft <= 0) return;
    beat.set(
      withSequence(
        withTiming(1.05, { duration: 90, easing: EASE_OUT }),
        withTiming(1, { duration: 260, easing: EASE_OUT }),
      ),
    );
  }, [beat, reduced, secondsLeft]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - fraction.get()),
    stroke: interpolateColor(
      fraction.get(),
      [0, 0.17, 0.4, 1],
      [TONES.red, TONES.orange, TONES.yellow, TONES.green],
    ),
  }));
  const beatStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.get() }] }));

  return (
    <Animated.View style={[{ width: size, height: size }, motionStyles.ringWrap, beatStyle]}>
      <Svg height={size} style={StyleSheet.absoluteFill} width={size}>
        <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke={THEME.line} strokeWidth={stroke} />
        <AnimatedCircle
          animatedProps={ringProps}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={stroke}
          // Start at 12 o'clock and drain clockwise.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </Animated.View>
  );
}

// ---- Swipe to vote --------------------------------------------------------
const VOTE_DISTANCE = 110;
const VOTE_VELOCITY = 900;

export function SwipeVote({
  enabled,
  onVote,
  children,
  style,
}: {
  enabled: boolean;
  onVote: (completed: boolean) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(enabled)
    // Horizontal only, so the reveal list still scrolls vertically.
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      x.set(event.translationX);
    })
    .onEnd((event) => {
      const far = Math.abs(event.translationX) > VOTE_DISTANCE;
      const flick = Math.abs(event.velocityX) > VOTE_VELOCITY && Math.abs(event.translationX) > 30;
      if (far || flick) scheduleOnRN(onVote, far ? event.translationX > 0 : event.velocityX > 0);
      x.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: event.velocityX }));
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: reduced
      ? [{ translateX: x.get() }]
      : [{ translateX: x.get() }, { rotate: `${x.get() / 26}deg` }],
  }));
  const yesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [16, VOTE_DISTANCE], [0, 1], 'clamp'),
  }));
  const noStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [-VOTE_DISTANCE, -16], [1, 0], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, cardStyle]}>
        {children}
        <Animated.View pointerEvents="none" style={[motionStyles.swipeStamp, motionStyles.swipeYes, yesStyle]}>
          <Text style={[motionStyles.stampText, { color: TONES.greenInk }]}>NAILED IT</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[motionStyles.swipeStamp, motionStyles.swipeNo, noStyle]}>
          <Text style={[motionStyles.stampText, { color: TONES.red }]}>NOPE</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

// ---- Stamp ----------------------------------------------------------------
// Lands with weight when it mounts: oversized, then settles with a bounce.
export function Stamp({ text, color, rotate = -8 }: { text: string; color: string; rotate?: number }) {
  const reduced = useReducedMotion();
  const land = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      land.set(withTiming(1, { duration: 150 }));
      return;
    }
    land.set(withSpring(1, { duration: 450, dampingRatio: 0.55 }));
  }, [land, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, land.get() * 2),
    transform: reduced
      ? [{ rotate: `${rotate}deg` }]
      : [{ rotate: `${rotate}deg` }, { scale: interpolate(land.get(), [0, 1], [1.7, 1]) }],
  }));

  return (
    <Animated.View style={[motionStyles.stamp, { borderColor: color }, style]}>
      <Text style={[motionStyles.stampText, { color }]}>{text}</Text>
    </Animated.View>
  );
}

// ---- Count up -------------------------------------------------------------
// Animates the number on the UI thread (no React render per frame) by driving
// a read-only TextInput's text.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function formatPoints(value: number): string {
  'worklet';
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(Math.round(value)).toString();
  let result = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) result += ',';
    result += digits[index];
  }
  return sign + result;
}

export function CountUp({
  value,
  from,
  suffix = '',
  style,
}: {
  value: number;
  from?: number;
  suffix?: string;
  style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(reduced ? value : (from ?? value));

  useEffect(() => {
    shown.set(withTiming(value, { duration: reduced ? 0 : 750, easing: EASE_OUT }));
  }, [reduced, shown, value]);

  const animatedProps = useAnimatedProps(() => {
    const text = `${formatPoints(shown.get())}${suffix}`;
    return { text, defaultValue: text } as Record<string, string>;
  });

  return (
    <AnimatedTextInput
      accessibilityLabel={`${value}${suffix}`}
      animatedProps={animatedProps}
      caretHidden
      defaultValue={`${formatPoints(value)}${suffix}`}
      editable={false}
      pointerEvents="none"
      style={[motionStyles.countUp, style]}
      underlineColorAndroid="transparent"
    />
  );
}

// ---- Streak flame ---------------------------------------------------------
export function StreakFlame({ streak }: { streak: number }) {
  const reduced = useReducedMotion();
  const flicker = useSharedValue(1);
  const [previous, setPrevious] = useState(streak);
  const [fizzles, setFizzles] = useState(0);
  // Storing the previous value during render (React's recommended pattern),
  // so a broken streak can play its fizzle once.
  if (streak !== previous) {
    if (previous >= 2 && streak === 0) setFizzles((count) => count + 1);
    setPrevious(streak);
  }

  const lit = streak >= 2;
  useEffect(() => {
    if (!lit || reduced) {
      cancelAnimation(flicker);
      flicker.set(1);
      return undefined;
    }
    flicker.set(
      withRepeat(
        withSequence(
          withTiming(1.12, { duration: 420, easing: EASE_IN_OUT }),
          withTiming(0.96, { duration: 380, easing: EASE_IN_OUT }),
        ),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(flicker);
  }, [flicker, lit, reduced]);

  // The flame grows with the streak, up to a point.
  const size = 12 + Math.min(streak, 6) * 2;
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flicker.get() }] }));

  if (lit) {
    return (
      <View accessibilityLabel={`${streak} mission streak`} style={motionStyles.flameRow}>
        <Animated.Text style={[{ fontSize: size }, flameStyle]}>🔥</Animated.Text>
        <Text style={motionStyles.flameCount}>{streak}</Text>
      </View>
    );
  }
  if (fizzles > 0 && streak === 0) return <Fizzle key={fizzles} />;
  return null;
}

function Fizzle() {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(1, { duration: 900, easing: EASE_OUT }));
  }, [progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: reduced ? [] : [{ translateY: -14 * progress.get() }],
  }));
  return (
    <Animated.Text accessibilityLabel="Streak broken" style={[motionStyles.fizzle, style]}>
      💨
    </Animated.Text>
  );
}

// ---- Busted overlay -------------------------------------------------------
export type BustEvent = {
  key: number;
  correct: boolean;
  accuser: string;
  suspect: string;
  mission: string;
};

// `silent`: show it without sound (a bystander phone in a room, so a table of
// phones doesn't all go off at once).
export function BustedOverlay({
  event,
  onDone,
  silent = false,
}: {
  event: BustEvent | null;
  onDone: () => void;
  silent?: boolean;
}) {
  if (!event) return null;
  return <BustedContent event={event} key={event.key} onDone={onDone} silent={silent} />;
}

function BustedContent({ event, onDone, silent }: { event: BustEvent; onDone: () => void; silent: boolean }) {
  const reduced = useReducedMotion();
  const { play } = useSound();
  const playRef = useRef(play);
  const flash = useSharedValue(0);
  const shake = useSharedValue(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!silent) playRef.current(event.correct ? 'busted' : 'wrong');
    if (event.correct) hapticPattern(['heavy', 'error'], 120);
    else haptic('warning');
    flash.set(
      withSequence(
        withTiming(event.correct ? 0.5 : 0.18, { duration: 70 }),
        withTiming(0, { duration: 520, easing: EASE_OUT }),
      ),
    );
    if (!reduced) {
      const step = (to: number) => withTiming(to, { duration: 45 });
      shake.set(withSequence(step(14), step(-12), step(10), step(-7), step(4), step(0)));
    }
    const timeout = setTimeout(() => onDoneRef.current(), 2800);
    return () => clearTimeout(timeout);
  }, [event.correct, flash, reduced, shake, silent]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  return (
    <Animated.View entering={FadeIn.duration(120)} exiting={exitOnNative(FadeOut.duration(180))} style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
        onPress={() => onDoneRef.current()}
        style={[StyleSheet.absoluteFill, motionStyles.bustBackdrop]}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: event.correct ? TONES.red : THEME.bgDeep }, flashStyle]}
        />
        <Animated.View accessibilityLiveRegion="assertive" style={[motionStyles.bustCard, cardStyle]}>
          <Stamp color={event.correct ? TONES.red : THEME.yellowText} text={event.correct ? 'BUSTED!' : 'WRONG CALL'} />
          <Text style={motionStyles.bustTitle}>
            {event.correct ? `${event.accuser} caught ${event.suspect}!` : `${event.accuser} accused ${event.suspect}…`}
          </Text>
          {event.correct ? (
            <>
              <Text style={motionStyles.bustMission}>“{event.mission}”</Text>
              <Text style={motionStyles.bustCopy}>{event.suspect}’s mission fails. {event.accuser} +500.</Text>
            </>
          ) : (
            <Text style={motionStyles.bustCopy}>Not even close. {event.accuser} −250. The real hunter is still out there.</Text>
          )}
          <Text style={motionStyles.bustDismiss}>TAP TO KEEP PLAYING</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ---- Sheet ----------------------------------------------------------------
// In-tree bottom sheet. Deliberately not RN's Modal: on Android a Modal is a
// separate window, so the screenshot block for missions wouldn't cover it.
export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {visible && (
        <>
          <Animated.View entering={FadeIn.duration(180)} exiting={exitOnNative(FadeOut.duration(150))} style={[StyleSheet.absoluteFill, motionStyles.backdrop]}>
            <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.duration(300).easing(EASE_SHEET)}
            exiting={exitOnNative(SlideOutDown.duration(200))}
            style={motionStyles.sheet}
          >
            <View style={motionStyles.sheetTop}>
              <View style={motionStyles.sheetHandle} />
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={10}
                onPress={onClose}
                style={motionStyles.sheetClose}
              >
                <Text style={motionStyles.sheetCloseText}>✕  CLOSE</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={motionStyles.sheetContent} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ---- Toast ----------------------------------------------------------------
export function Toast({
  children,
  onDone,
  duration = 3200,
  interactive = false,
}: {
  children: ReactNode;
  onDone: () => void;
  duration?: number;
  interactive?: boolean;
}) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const timeout = setTimeout(() => onDoneRef.current(), duration);
    return () => clearTimeout(timeout);
  }, [duration]);
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      entering={FadeInUp.duration(260).easing(EASE_OUT)}
      exiting={exitOnNative(FadeOut.duration(180))}
      pointerEvents={interactive ? 'auto' : 'none'}
      style={motionStyles.toast}
    >
      {children}
    </Animated.View>
  );
}

// ---- Lists ----------------------------------------------------------------
// Rows slide into their new order when scores change.
export const ROW_LAYOUT = LinearTransition.duration(320).easing(EASE_IN_OUT);

export function Entrance({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    // A soft spring with a little overshoot, like clay settling into place.
    <Animated.View entering={FadeInDown.springify().damping(15).stiffness(170).delay(Math.min(index, 8) * 55)} style={style}>
      {children}
    </Animated.View>
  );
}

// A small spring "pop" each time `trigger` changes (e.g. an avatar swap).
export function PopOnChange({ trigger, children }: { trigger: string | number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    scale.set(withSequence(withTiming(0.9, { duration: 70 }), withSpring(1, { duration: 350, dampingRatio: 0.5 })));
  }, [reduced, scale, trigger]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// ---- Ambient touches ------------------------------------------------------
// Cycles gently through lines (e.g. sample missions in the home bubble). Slow
// on purpose: it should feel alive, not busy. Reduced motion: shows the first.
export function RotatingText({
  lines,
  intervalMs = 3200,
  style,
}: {
  lines: string[];
  intervalMs?: number;
  style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reduced || lines.length < 2) return undefined;
    const interval = setInterval(() => setIndex((current) => (current + 1) % lines.length), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, lines.length, reduced]);
  const line = lines[index % lines.length];
  return (
    <Animated.Text
      entering={reduced ? undefined : FadeInUp.duration(320).easing(EASE_OUT)}
      key={line}
      style={style}
    >
      {line}
    </Animated.Text>
  );
}

// Three dots that pulse in a wave: the drumroll before the reveal.
export function SuspenseLights({ color }: { color: string }) {
  return (
    <View style={motionStyles.lights}>
      {[0, 1, 2].map((index) => (
        <SuspenseDot color={color} index={index} key={index} />
      ))}
    </View>
  );
}

function SuspenseDot({ color, index }: { color: string; index: number }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(reduced ? 1 : 0.35);
  useEffect(() => {
    if (reduced) return undefined;
    const timeout = setTimeout(() => {
      pulse.set(
        withRepeat(
          withSequence(
            withTiming(1, { duration: 260, easing: EASE_OUT }),
            withTiming(0.35, { duration: 260, easing: EASE_OUT }),
          ),
          -1,
        ),
      );
    }, index * 130);
    return () => {
      clearTimeout(timeout);
      cancelAnimation(pulse);
    };
  }, [index, pulse, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: pulse.get(),
    transform: reduced ? [] : [{ scale: 0.8 + pulse.get() * 0.3 }],
  }));
  return <Animated.View style={[motionStyles.light, { backgroundColor: color }, style]} />;
}

// A small looping wobble (the siren on the suspense screen).
export function Wobble({ children, degrees = 9 }: { children: ReactNode; degrees?: number }) {
  const reduced = useReducedMotion();
  const angle = useSharedValue(0);
  useEffect(() => {
    if (reduced) return undefined;
    angle.set(
      withRepeat(
        withSequence(
          withTiming(degrees, { duration: 140, easing: EASE_IN_OUT }),
          withTiming(-degrees, { duration: 140, easing: EASE_IN_OUT }),
        ),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(angle);
  }, [angle, degrees, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// Springs in once when it mounts (e.g. the lock on "missions sealed").
export function PopIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return undefined;
    const timeout = setTimeout(() => {
      progress.set(withSpring(1, { duration: 500, dampingRatio: 0.5 }));
    }, delay);
    return () => clearTimeout(timeout);
  }, [delay, progress, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.get() * 1.5),
    transform: [
      { scale: interpolate(progress.get(), [0, 1], [0.85, 1]) },
      { rotate: `${interpolate(progress.get(), [0, 1], [-10, 0])}deg` },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// ---- Kickoff ----------------------------------------------------------------
// "3, 2, 1… LET'S START THE CHAOS!" before every round. The round deadline
// already includes this time (KICKOFF_SECONDS), so nobody loses a second.
// Each count lands as a big disc of party-coloured clay.
const KICKOFF_STEPS = [
  { text: '3', face: THEME.yellow, edge: THEME.yellowEdge },
  { text: '2', face: THEME.pink, edge: THEME.pinkEdge },
  { text: '1', face: THEME.cyan, edge: THEME.cyanEdge },
];
const STEP_MS = 750;

export function Kickoff({ onDone, silent = false }: { onDone: () => void; silent?: boolean }) {
  const reduced = useReducedMotion();
  const { play } = useSound();
  const [step, setStep] = useState(0);
  const onDoneRef = useRef(onDone);
  const playRef = useRef(play);
  useEffect(() => {
    onDoneRef.current = onDone;
    playRef.current = play;
  }, [onDone, play]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    KICKOFF_STEPS.forEach((_, index) => {
      timers.push(
        setTimeout(() => {
          setStep(index);
          if (!silent) playRef.current('tick');
          haptic('heavy');
        }, index * STEP_MS),
      );
    });
    timers.push(
      setTimeout(() => {
        setStep(KICKOFF_STEPS.length);
        if (!silent) playRef.current('start');
        hapticPattern(['heavy', 'success'], 120);
      }, KICKOFF_STEPS.length * STEP_MS),
    );
    timers.push(setTimeout(() => onDoneRef.current(), KICKOFF_STEPS.length * STEP_MS + 1150));
    return () => timers.forEach(clearTimeout);
  }, [silent]);

  const go = step >= KICKOFF_STEPS.length;
  return (
    <Animated.View
      accessibilityLiveRegion="assertive"
      entering={FadeIn.duration(160)}
      exiting={exitOnNative(FadeOut.duration(220))}
      style={[StyleSheet.absoluteFill, motionStyles.kickoff]}
    >
      {go ? (
        <Animated.View entering={reduced ? undefined : FadeInUp.duration(320).easing(EASE_OUT)} style={motionStyles.kickoffGo}>
          <Text style={motionStyles.kickoffEmoji}>🎉</Text>
          <Text style={motionStyles.kickoffTitle}>LET’S START{'\n'}THE CHAOS!</Text>
          <Text style={motionStyles.kickoffCopy}>Here we go… act natural. 🤫</Text>
        </Animated.View>
      ) : (
        <PopIn key={step}>
          <View
            style={[
              motionStyles.kickoffDisc,
              {
                backgroundColor: KICKOFF_STEPS[step].face,
                borderColor: KICKOFF_STEPS[step].edge,
                boxShadow: `0px 14px 0px ${KICKOFF_STEPS[step].edge}, ${CLAY.gloss}`,
              },
            ]}
          >
            <Text style={motionStyles.kickoffNumber}>{KICKOFF_STEPS[step].text}</Text>
          </View>
        </PopIn>
      )}
      {!go && <Text style={motionStyles.kickoffHint}>GET READY…</Text>}
    </Animated.View>
  );
}

// Bobs gently up and down forever (decorative stickers). Reduced motion: still.
export function Bob({ children, delay = 0, distance = 7 }: { children: ReactNode; delay?: number; distance?: number }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return undefined;
    const timeout = setTimeout(() => {
      y.set(
        withRepeat(
          withSequence(
            withTiming(-distance, { duration: 1400, easing: EASE_IN_OUT }),
            withTiming(0, { duration: 1400, easing: EASE_IN_OUT }),
          ),
          -1,
        ),
      );
    }, delay);
    return () => {
      clearTimeout(timeout);
      cancelAnimation(y);
    };
  }, [delay, distance, reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const motionStyles = StyleSheet.create({
  lights: { flexDirection: 'row', gap: 10, marginTop: 32 },
  light: { width: 12, height: 12, borderRadius: 6 },
  holdCard: {
    boxShadow: CLAY.card,
    width: '100%',
    backgroundColor: THEME.surfaceHi,
    borderRadius: RADIUS.lg,
    borderWidth: 3,
    borderColor: THEME.pinkEdge,
    padding: 20,
    marginBottom: 10,
    overflow: 'hidden',
  },
  holdCover: {
    backgroundColor: THEME.pink,
    borderRadius: RADIUS.lg - 3,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  holdIcon: { fontSize: 40, marginBottom: 6 },
  holdLabel: { color: THEME.text, fontFamily: FONTS.black, fontSize: 18, letterSpacing: 1.4 },
  holdHint: { color: THEME.text, fontFamily: FONTS.semi, fontSize: 13, marginTop: 2, opacity: 0.85 },
  slotWindow: { overflow: 'hidden', minHeight: 34, justifyContent: 'center' },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  swipeStamp: {
    position: 'absolute',
    top: 14,
    borderWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: THEME.bgDeep,
  },
  swipeYes: { left: 14, borderColor: TONES.greenInk, transform: [{ rotate: '-10deg' }] },
  swipeNo: { right: 14, borderColor: TONES.red, transform: [{ rotate: '10deg' }] },
  stamp: { alignSelf: 'flex-start', borderWidth: 3, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  stampText: { fontFamily: FONTS.black, fontSize: 16, letterSpacing: 1.5 },
  countUp: { padding: 0, margin: 0, color: THEME.secondary, fontFamily: FONTS.black, fontSize: 14, textAlign: 'right', minWidth: 84 },
  flameRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 8 },
  flameCount: { color: THEME.orangeText, fontFamily: FONTS.black, fontSize: 12 },
  fizzle: { fontSize: 15, marginRight: 8 },
  bustBackdrop: { backgroundColor: THEME.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bustCard: {
    boxShadow: CLAY.card,
    width: '100%',
    backgroundColor: THEME.surfaceHi,
    borderRadius: RADIUS.lg,
    borderWidth: 3,
    borderColor: THEME.pink,
    padding: 24,
    gap: 8,
  },
  bustTitle: { color: THEME.text, fontFamily: FONTS.black, fontSize: 28, lineHeight: 32, marginTop: 6 },
  bustMission: { color: THEME.primary, fontFamily: FONTS.bold, fontSize: 16, lineHeight: 22 },
  bustCopy: { color: THEME.muted, fontFamily: FONTS.semi, fontSize: 14, lineHeight: 20 },
  bustDismiss: { color: THEME.dim, fontFamily: FONTS.black, fontSize: 11, letterSpacing: 1.2, marginTop: 8 },
  backdrop: { backgroundColor: THEME.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: THEME.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 3,
    borderColor: THEME.yellow,
  },
  sheetTop: { height: 48, justifyContent: 'center' },
  sheetHandle: { alignSelf: 'center', width: 46, height: 5, borderRadius: 3, backgroundColor: THEME.lineStrong },
  sheetClose: {
    position: 'absolute',
    right: 16,
    top: 9,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    backgroundColor: THEME.surfaceHi,
    justifyContent: 'center',
  },
  sheetCloseText: { color: THEME.text, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 0.8 },
  sheetContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 36 },
  toast: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 26,
    backgroundColor: THEME.yellow,
    borderRadius: RADIUS.md,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  kickoff: { backgroundColor: THEME.bgDeep, alignItems: 'center', justifyContent: 'center', padding: 24 },
  kickoffDisc: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  kickoffNumber: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 130, lineHeight: 150, textAlign: 'center' },
  kickoffHint: { color: THEME.muted, fontFamily: FONTS.black, fontSize: 14, letterSpacing: 3, marginTop: 4 },
  kickoffGo: { alignItems: 'center' },
  kickoffEmoji: { fontSize: 64 },
  kickoffTitle: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 46, lineHeight: 50, textAlign: 'center', marginTop: 8 },
  kickoffCopy: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 18, marginTop: 10 },
});
