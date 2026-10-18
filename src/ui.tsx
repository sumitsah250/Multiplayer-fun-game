// Shared look and small building blocks used by both the pass-the-phone game
// (App.tsx) and the private-room guest screens (src/room/GuestRoom.tsx).
import { useKeepAwake } from 'expo-keep-awake';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { haptic } from './haptics';

export const COLORS = {
  background: '#F7F4EC',
  ink: '#17221D',
  muted: '#737A72',
  green: '#C6F36A',
  card: '#FFFFFF',
  line: '#E7E5DC',
  orange: '#FF8B64',
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
export function ProtectMissions({ tag = 'mission-deal' }: { tag?: string }) {
  usePreventScreenCapture(tag);
  return null;
}

export function PrimaryButton({
  label,
  onPress,
  onPressIn,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const [scale] = useState(() => new Animated.Value(1));

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          haptic('tap');
          onPressIn?.();
          Animated.spring(scale, {
            toValue: 0.97,
            useNativeDriver: true,
            speed: 30,
            bounciness: 8,
          }).start();
        }}
        onPressOut={() =>
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 24,
            bounciness: 10,
          }).start()
        }
        style={[
          styles.button,
          secondary && styles.secondaryButton,
          disabled && styles.disabledButton,
        ]}
      >
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 57,
    borderRadius: 17,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 7,
  },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.line },
  secondaryButtonText: { color: COLORS.ink },
  disabledButton: { backgroundColor: '#AEB3AA' },
  eyebrow: { color: COLORS.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
});
