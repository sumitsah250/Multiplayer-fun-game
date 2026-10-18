// Shared look and small building blocks used by both the pass-the-phone game
// (App.tsx) and the private-room guest screens (src/room/GuestRoom.tsx).
// Colours, fonts and shapes come from ./theme so every screen matches.
import { useKeepAwake } from 'expo-keep-awake';
import { usePreventScreenCapture } from 'expo-screen-capture';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { haptic } from './haptics';
import { FONTS, RADIUS, THEME, TONE_COLORS } from './theme';
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

const EDGE = 5;

// The game's button: a chunky 3D key that presses down under your finger.
// `secondary` is the quieter outlined version for less important actions.
export function PrimaryButton({
  label,
  onPress,
  onPressIn,
  disabled = false,
  secondary = false,
  tone = 'yellow',
  style,
}: {
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = TONE_COLORS[tone];
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        haptic('tap');
        onPressIn?.();
      }}
      pressRetentionOffset={20}
      style={[styles.buttonWrap, style]}
    >
      {({ pressed }) =>
        secondary ? (
          <View style={[styles.secondary, pressed && styles.secondaryPressed, disabled && styles.disabled]}>
            <Text style={styles.secondaryText}>{label}</Text>
          </View>
        ) : (
          <View style={[styles.edge, { backgroundColor: disabled ? THEME.surfaceLo : colors.edge }]}>
            <View
              style={[
                styles.face,
                { backgroundColor: disabled ? THEME.surfaceHi : colors.face },
                { transform: [{ translateY: pressed || disabled ? 0 : -EDGE }] },
              ]}
            >
              <Text style={[styles.faceText, disabled && styles.disabledText]}>{label}</Text>
            </View>
          </View>
        )
      }
    </Pressable>
  );
}

// A chunky 3D tile (category cards, home shortcuts): the same press-down feel
// as PrimaryButton, with any content inside.
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
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => haptic('tap')}
      pressRetentionOffset={20}
      style={style}
    >
      {({ pressed }) => (
        <View style={[styles.edge, { backgroundColor: colors.edge }]}>
          <View
            style={[
              styles.tileFace,
              { backgroundColor: colors.face, transform: [{ translateY: pressed ? 0 : -EDGE }] },
              faceStyle,
            ]}
          >
            {children}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

const styles = StyleSheet.create({
  buttonWrap: { marginTop: 10 },
  edge: { borderRadius: RADIUS.md, marginTop: EDGE },
  face: {
    minHeight: 58,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  tileFace: { borderRadius: RADIUS.md, padding: 14 },
  faceText: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 16, letterSpacing: 0.8, textAlign: 'center' },
  disabledText: { color: THEME.dim },
  secondary: {
    minHeight: 54,
    marginTop: EDGE,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: THEME.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  secondaryText: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 14, letterSpacing: 0.8, textAlign: 'center' },
  disabled: { opacity: 0.45 },
  eyebrow: { color: THEME.muted, fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.6 },
});
