// Shared look and small building blocks used by both the pass-the-phone game
// (App.tsx) and the private-room guest screens (src/room/GuestRoom.tsx).
// Colours, fonts and shapes come from ./theme so every screen matches.
//
// "Candy clay": buttons and tiles have a solid coloured underside that they
// squish into when pressed (a spring, so it feels soft rather than snapping),
// a glossy top highlight, and a soft shadow. Cards are puffy white clay.
import Feather from '@expo/vector-icons/Feather';
import { useKeepAwake } from 'expo-keep-awake';
import { usePreventScreenCapture } from 'expo-screen-capture';
import type { ComponentProps, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic } from './haptics';
import { CLAY, FONTS, RADIUS, THEME, TONE_COLORS } from './theme';
import type { Tone } from './theme';

// Older names for the theme colours, kept so existing screens read naturally.
export const COLORS = {
  background: THEME.bg,
  ink: THEME.text,
  muted: THEME.muted,
  green: THEME.lime,
  card: THEME.surface,
  line: THEME.line,
  orange: THEME.orange,
};

// Rendered only while a round is running so the countdown stays visible and the
// end-of-round reveal can fire while the phone sits in the middle of the group.
export function KeepScreenAwake() {
  useKeepAwake();
  return null;
}

// Rendered only while missions are on screen. Sets FLAG_SECURE on Android, so
// screenshots are blocked and the recent-apps preview is blank instead of
// showing someone's secret mission. Give each simultaneous use its own tag.
// Browsers have no such control (expo-screen-capture throws there), so on the
// web this renders nothing.
function NativeProtectMissions({ tag = 'mission-deal' }: { tag?: string }) {
  usePreventScreenCapture(tag);
  return null;
}

export const ProtectMissions: (props: { tag?: string }) => null =
  Platform.OS === 'web' ? () => null : NativeProtectMissions;

// ---- Icons -------------------------------------------------------------------
// UI controls use one consistent line-icon set (Feather, the family Lucide grew
// from). Emoji stay for content: avatars, mission categories and reactions.
export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 22, color = THEME.text }: { name: IconName; size?: number; color?: string }) {
  return <Feather accessible={false} color={color} name={name} size={size} />;
}

// ---- Clay press ----------------------------------------------------------------
const PRESS_SPRING = { damping: 14, stiffness: 420, mass: 0.6 };

// Shared squish: the face sits EDGE pixels above its coloured underside and
// springs down onto it while pressed.
function useClayPress(lifted: boolean) {
  const reduced = useReducedMotion();
  const down = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lifted ? -CLAY.edge * (1 - down.get()) : 0 }],
  }));
  const press = (value: 0 | 1) => {
    if (reduced) down.set(value);
    else down.set(withSpring(value, PRESS_SPRING));
  };
  return { faceStyle, pressIn: () => press(1), pressOut: () => press(0) };
}

// The game's button: a chunky clay key that squishes down under your finger.
// `secondary` is the quieter white clay version for less important actions.
export function PrimaryButton({
  label,
  onPress,
  onPressIn,
  disabled = false,
  secondary = false,
  tone = 'yellow',
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  tone?: Tone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = secondary
    ? { face: THEME.surface, edge: THEME.lineStrong }
    : disabled
      ? { face: THEME.surfaceLo, edge: THEME.lineStrong }
      : TONE_COLORS[tone];
  const { faceStyle, pressIn, pressOut } = useClayPress(!disabled);
  const textColor = disabled ? THEME.dim : THEME.onAccent;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        haptic('tap');
        pressIn();
        onPressIn?.();
      }}
      onPressOut={pressOut}
      pressRetentionOffset={20}
      style={[styles.buttonWrap, style]}
    >
      <View style={[styles.edge, { backgroundColor: colors.edge }, !disabled && styles.edgeShadow]}>
        <Animated.View
          style={[
            styles.face,
            secondary ? styles.secondaryFace : styles.toneFace,
            { backgroundColor: colors.face, borderColor: colors.edge },
            faceStyle,
          ]}
        >
          {icon && <Icon color={textColor} name={icon} size={20} />}
          <Text style={[secondary ? styles.secondaryText : styles.faceText, { color: textColor }]}>{label}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// A chunky clay tile (category cards, home shortcuts): the same squish as
// PrimaryButton, with any content inside.
export function PartyTile({
  tone,
  onPress,
  children,
  accessibilityLabel,
  style,
  faceStyle,
}: {
  tone: Tone;
  onPress: () => void;
  children: ReactNode;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
}) {
  const colors = TONE_COLORS[tone];
  const press = useClayPress(true);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        haptic('tap');
        press.pressIn();
      }}
      onPressOut={press.pressOut}
      pressRetentionOffset={20}
      style={style}
    >
      <View style={[styles.edge, styles.edgeShadow, { backgroundColor: colors.edge }]}>
        <Animated.View
          style={[styles.tileFace, { backgroundColor: colors.face, borderColor: colors.edge }, press.faceStyle, faceStyle]}
        >
          {children}
        </Animated.View>
      </View>
    </Pressable>
  );
}

// Round clay icon button for headers and toolbars (back, sound, close, share).
export function IconButton({
  icon,
  label,
  onPress,
  tone,
  size = 44,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: Tone;
  size?: number;
}) {
  const colors = tone ? TONE_COLORS[tone] : { face: THEME.surface, edge: THEME.lineStrong };
  const press = useClayPress(true);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      onPressIn={() => {
        haptic('tap');
        press.pressIn();
      }}
      onPressOut={press.pressOut}
    >
      <View style={[styles.iconEdge, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.edge }]}>
        <Animated.View
          style={[
            styles.iconFace,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.face, borderColor: colors.edge },
            press.faceStyle,
          ]}
        >
          <Icon color={THEME.text} name={icon} size={Math.round(size * 0.46)} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

// Puffy white clay card for grouping content.
export function ClayCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

const styles = StyleSheet.create({
  buttonWrap: { marginTop: 12 },
  edge: { borderRadius: RADIUS.md, marginTop: CLAY.edge },
  edgeShadow: { boxShadow: '0px 8px 18px rgba(109, 40, 217, 0.14)' },
  face: {
    minHeight: 58,
    borderRadius: RADIUS.md,
    borderWidth: CLAY.border,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  toneFace: { boxShadow: CLAY.gloss },
  secondaryFace: { minHeight: 54, boxShadow: 'inset 0px -3px 0px rgba(42, 18, 64, 0.05)' },
  tileFace: { borderRadius: RADIUS.md, borderWidth: CLAY.border, padding: 14, boxShadow: CLAY.gloss },
  faceText: { fontFamily: FONTS.black, fontSize: 17, letterSpacing: 0.6, textAlign: 'center' },
  secondaryText: { fontFamily: FONTS.bold, fontSize: 15, letterSpacing: 0.6, textAlign: 'center' },
  iconEdge: { marginTop: CLAY.edge },
  iconFace: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  card: {
    backgroundColor: THEME.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: THEME.line,
    padding: 18,
    boxShadow: CLAY.card,
  },
  eyebrow: { color: THEME.muted, fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 1.6 },
});
