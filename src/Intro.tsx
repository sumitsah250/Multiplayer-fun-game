// The animated intro that takes over from the system splash screen. It starts
// with the logo exactly where (and as big as) the splash left it, so the
// handoff is invisible, then the logo bounces, the name slides in, party
// stickers pop around it, and everything fades into the home screen.
// Tap anywhere to skip. Reduced motion: a short, still fade.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BRAND } from './brand';
import { haptic } from './haptics';
import { Bob, EASE_OUT, PopIn } from './motion';
import { FONTS, THEME } from './theme';

// The splash image is 200dp wide with the tile drawn at 640/1024 of it, a
// little above centre (see assets/splash-icon.png).
const LOGO = 125;
const LOGO_LIFT = -0.04 * LOGO;
const HOLD_MS = 2500;
const FADE_MS = 380;

const STICKERS = [
  { emoji: '🕵️', x: -128, y: -215, size: 44, delay: 650 },
  { emoji: '🎉', x: 124, y: -205, size: 40, delay: 760 },
  { emoji: '🤫', x: -150, y: -40, size: 36, delay: 870 },
  { emoji: '🍕', x: 148, y: -30, size: 36, delay: 980 },
  { emoji: '🎯', x: -118, y: 150, size: 34, delay: 1090 },
  { emoji: '🪔', x: 122, y: 160, size: 34, delay: 1200 },
];

function LogoTile({ dotStyle }: { dotStyle: object }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileEdge} />
      <View style={styles.tileFace}>
        <Text style={styles.tileLetter}>{BRAND.mark}</Text>
      </View>
      <Animated.View style={[styles.dot, dotStyle]} />
    </View>
  );
}

export function Intro({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const lift = useSharedValue(0);
  const dot = useSharedValue(0);
  const glow = useSharedValue(0);
  const fade = useSharedValue(1);
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const done = () => {
    if (finished.current) return;
    finished.current = true;
    onDoneRef.current();
  };

  const fadeOut = (delay: number, duration: number) => {
    fade.set(
      withDelay(
        delay,
        withTiming(0, { duration }, (complete) => {
          if (complete) scheduleOnRN(done);
        }),
      ),
    );
  };

  useEffect(() => {
    glow.set(withTiming(1, { duration: 700, easing: EASE_OUT }));
    if (reduced) {
      dot.set(withTiming(1, { duration: 200 }));
      lift.set(-100);
      fadeOut(900, 250);
      return undefined;
    }
    // Bounce, then rise to make room for the name.
    pop.set(
      withDelay(
        120,
        withSequence(
          withTiming(1.14, { duration: 160, easing: EASE_OUT }),
          withSpring(1, { duration: 520, dampingRatio: 0.45 }),
        ),
      ),
    );
    dot.set(withDelay(300, withSpring(1, { duration: 500, dampingRatio: 0.5 })));
    lift.set(withDelay(460, withTiming(-100, { duration: 520, easing: EASE_OUT })));
    const tap = setTimeout(() => haptic('tap'), 140);
    fadeOut(HOLD_MS, FADE_MS);
    return () => clearTimeout(tap);
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: LOGO_LIFT + lift.get() }, { scale: pop.get() }],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, dot.get() * 1.5),
    transform: [{ scale: 0.6 + dot.get() * 0.4 }],
  }));

  const enter = (delay: number) => (reduced ? FadeIn.duration(200) : FadeInDown.delay(delay).duration(460).easing(EASE_OUT));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <LinearGradient
          colors={[THEME.bgTop, THEME.bg, THEME.bgDeep]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(255,79,163,0.35)', 'rgba(255,79,163,0)']}
          end={{ x: 0.2, y: 0.6 }}
          start={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Pressable
        accessibilityHint="Skips the intro"
        accessibilityLabel={`${BRAND.name}. ${BRAND.tagline}.`}
        onPress={() => {
          if (!finished.current) fadeOut(0, 180);
        }}
        style={[StyleSheet.absoluteFill, styles.center]}
      >
        {!reduced &&
          STICKERS.map((sticker) => (
            <View
              key={sticker.emoji}
              pointerEvents="none"
              style={[styles.sticker, { transform: [{ translateX: sticker.x }, { translateY: sticker.y }] }]}
            >
              <PopIn delay={sticker.delay}>
                <Bob delay={sticker.delay} distance={6}>
                  <Text style={{ fontSize: sticker.size }}>{sticker.emoji}</Text>
                </Bob>
              </PopIn>
            </View>
          ))}
        <Animated.View style={logoStyle}>
          <LogoTile dotStyle={dotStyle} />
        </Animated.View>
        <View style={styles.words}>
          <Animated.Text entering={enter(560)} style={styles.title}>
            PARTY <Text style={styles.titleAccent}>SPY</Text>
          </Animated.Text>
          <Animated.Text entering={enter(760)} style={styles.tagline}>
            {BRAND.tagline}
          </Animated.Text>
        </View>
        <Animated.Text entering={enter(1000)} style={styles.credit}>
          {BRAND.credit.toUpperCase()}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Same colour as the system splash, so the handoff doesn't flash.
  root: { backgroundColor: THEME.bg, zIndex: 100 },
  center: { alignItems: 'center', justifyContent: 'center' },
  tile: { width: LOGO, height: LOGO, transform: [{ rotate: '-8deg' }] },
  tileEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: LOGO * 0.07,
    borderRadius: LOGO * 0.24,
    backgroundColor: THEME.yellowEdge,
  },
  tileFace: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: LOGO * 0.07,
    borderRadius: LOGO * 0.24,
    backgroundColor: THEME.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLetter: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: LOGO * 0.8, lineHeight: LOGO * 1.0, marginTop: LOGO * 0.08 },
  dot: {
    position: 'absolute',
    right: -LOGO * 0.1,
    top: -LOGO * 0.1,
    width: LOGO * 0.26,
    height: LOGO * 0.26,
    borderRadius: LOGO * 0.13,
    backgroundColor: THEME.pink,
    borderWidth: LOGO * 0.035,
    borderColor: THEME.onAccent,
  },
  sticker: { position: 'absolute' },
  words: { position: 'absolute', alignItems: 'center', transform: [{ translateY: 40 }] },
  title: { color: THEME.text, fontFamily: FONTS.black, fontSize: 52, lineHeight: 60, letterSpacing: 2 },
  titleAccent: { color: THEME.primary },
  tagline: { color: THEME.muted, fontFamily: FONTS.bold, fontSize: 17, marginTop: 2 },
  credit: {
    position: 'absolute',
    bottom: 54,
    color: THEME.dim,
    fontFamily: FONTS.black,
    fontSize: 12,
    letterSpacing: 2.4,
  },
});
