// Themed confirmation and message dialogs. Call confirmAction()/showMessage()
// from anywhere; <DialogHost /> (mounted once at the app root) shows them as
// candy-clay cards that spring in over a soft backdrop. They work the same on
// Android, iOS and the web (where React Native's Alert does nothing).
//
// Android back and tapping the backdrop count as "cancel". Dialogs requested
// while one is open wait in a queue.
import { useEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from './haptics';
import { CLAY, FONTS, RADIUS, THEME } from './theme';
import { Icon, PrimaryButton } from './ui';
import type { IconName } from './ui';

type DialogKind = 'confirm' | 'message';

type DialogSpec = {
  id: number;
  kind: DialogKind;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  onConfirm?: () => void;
};

let nextId = 1;
let queue: DialogSpec[] = [];
const listeners = new Set<(queue: DialogSpec[]) => void>();

function emit() {
  for (const listener of listeners) listener(queue);
}

function enqueue(spec: Omit<DialogSpec, 'id'>) {
  queue = [...queue, { ...spec, id: nextId++ }];
  emit();
}

function dismiss(id: number) {
  queue = queue.filter((dialog) => dialog.id !== id);
  emit();
}

// Asks before doing something that can't be undone (ending a round, closing a
// room, deleting a mission). onConfirm runs only if the player confirms.
export function confirmAction({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
}) {
  enqueue({ kind: 'confirm', title, message, confirmText, cancelText, onConfirm });
}

export function showMessage(title: string, message: string) {
  enqueue({ kind: 'message', title, message, confirmText: 'OK' });
}

const ENTER_SPRING = { damping: 16, stiffness: 260, mass: 0.8 };

export function DialogHost() {
  const [dialogs, setDialogs] = useState<DialogSpec[]>(queue);
  useEffect(() => {
    listeners.add(setDialogs);
    return () => {
      listeners.delete(setDialogs);
    };
  }, []);
  const current = dialogs[0];
  if (!current) return null;
  // Keyed by id so each dialog gets a fresh entrance animation.
  return <DialogCard key={current.id} dialog={current} />;
}

function DialogCard({ dialog }: { dialog: DialogSpec }) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(0);
  const [closing, setClosing] = useState(false);
  const isConfirm = dialog.kind === 'confirm';
  const icon: IconName = isConfirm ? 'alert-triangle' : 'info';
  const badge = isConfirm ? { face: THEME.pink, edge: THEME.pinkEdge } : { face: THEME.violet, edge: THEME.violetEdge };

  useEffect(() => {
    haptic(isConfirm ? 'warning' : 'select');
    shown.set(reduced ? withTiming(1, { duration: 160 }) : withSpring(1, ENTER_SPRING));
  }, [isConfirm, reduced, shown]);

  const close = (confirmed: boolean) => {
    if (closing) return;
    setClosing(true);
    const finish = () => {
      dismiss(dialog.id);
      if (confirmed) dialog.onConfirm?.();
    };
    // Exits are quicker than entrances, so the game never feels held up.
    shown.set(
      withTiming(0, { duration: reduced ? 100 : 160 }, (done) => {
        if (done) runOnJS(finish)();
      }),
    );
  };

  // Android back = cancel (the Modal's onRequestClose also covers it).
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close(false);
      return true;
    });
    return () => subscription.remove();
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const cardStyle = useAnimatedStyle(() => {
    const value = shown.get();
    return reduced
      ? { opacity: value }
      : { opacity: Math.min(1, value * 1.6), transform: [{ scale: 0.86 + 0.14 * value }, { translateY: (1 - value) * 24 }] };
  });

  return (
    <Modal animationType="none" onRequestClose={() => close(false)} statusBarTranslucent transparent visible>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            accessibilityLabel={isConfirm ? dialog.cancelText : 'Close'}
            accessibilityRole="button"
            onPress={() => close(false)}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View accessibilityViewIsModal style={[styles.card, cardStyle]}>
          <View style={[styles.badge, { backgroundColor: badge.face, borderColor: badge.edge }]}>
            <Icon color={THEME.onAccent} name={icon} size={28} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {dialog.title}
          </Text>
          <Text style={styles.message}>{dialog.message}</Text>
          <PrimaryButton
            label={dialog.confirmText}
            onPress={() => close(true)}
            tone={isConfirm ? 'pink' : 'yellow'}
          />
          {isConfirm && dialog.cancelText && (
            <PrimaryButton label={dialog.cancelText} onPress={() => close(false)} secondary />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop: { backgroundColor: THEME.scrim },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: THEME.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 3,
    borderColor: THEME.line,
    paddingHorizontal: 22,
    paddingTop: 44,
    paddingBottom: 20,
    marginTop: 34,
    boxShadow: CLAY.raised,
  },
  badge: {
    position: 'absolute',
    top: -34,
    alignSelf: 'center',
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: CLAY.gloss,
  },
  title: { color: THEME.text, fontFamily: FONTS.black, fontSize: 24, lineHeight: 30, textAlign: 'center' },
  message: {
    color: THEME.muted,
    fontFamily: FONTS.regular,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
});
