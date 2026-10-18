// Small haptics vocabulary for the whole app. On Android this uses the system
// haptic types (no VIBRATE permission, and they feel like the rest of the OS);
// elsewhere it uses impact/notification feedback.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticKind = 'tap' | 'select' | 'tick' | 'success' | 'warning' | 'error' | 'heavy';

const ANDROID: Record<HapticKind, Haptics.AndroidHaptics> = {
  tap: Haptics.AndroidHaptics.Virtual_Key,
  select: Haptics.AndroidHaptics.Segment_Tick,
  tick: Haptics.AndroidHaptics.Clock_Tick,
  success: Haptics.AndroidHaptics.Confirm,
  warning: Haptics.AndroidHaptics.Long_Press,
  error: Haptics.AndroidHaptics.Reject,
  heavy: Haptics.AndroidHaptics.Long_Press,
};

let enabled = true;

// The app turns haptics off together with motion when the device asks for reduced motion.
export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

function run(kind: HapticKind): Promise<void> {
  if (Platform.OS === 'android') return Haptics.performAndroidHapticsAsync(ANDROID[kind]);
  switch (kind) {
    case 'tap':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'select':
    case 'tick':
      return Haptics.selectionAsync();
    case 'success':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'warning':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    case 'heavy':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
}

export function haptic(kind: HapticKind) {
  if (!enabled) return;
  run(kind).catch(() => {
    // Haptics are a nice-to-have; some devices and browsers don't support them.
  });
}

// A short rhythm, e.g. ['heavy', 'tick'] for a heartbeat.
export function hapticPattern(kinds: HapticKind[], gapMs = 110) {
  kinds.forEach((kind, index) => {
    if (index === 0) haptic(kind);
    else setTimeout(() => haptic(kind), index * gapMs);
  });
}
