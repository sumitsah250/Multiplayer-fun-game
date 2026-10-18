// "Share" opens this panel: pick an app (WhatsApp, Telegram, Message, Email,
// X), copy the text, share the reveal card as an image, or use the phone's own
// share menu. Each choice opens that app with the results already filled in.
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { BRAND } from './brand';
import { haptic } from './haptics';
import { shareLink } from './shareLinks';
import type { ShareTarget } from './shareLinks';
import { FONTS, RADIUS, THEME, TONE_COLORS } from './theme';
import type { Tone } from './theme';
import { Eyebrow, PrimaryButton } from './ui';

type Option = { id: ShareTarget | 'copy'; emoji: string; label: string; tone: Tone };

const OPTIONS: Option[] = [
  { id: 'whatsapp', emoji: '💬', label: 'WhatsApp', tone: 'lime' },
  { id: 'telegram', emoji: '✈️', label: 'Telegram', tone: 'cyan' },
  { id: 'sms', emoji: '📱', label: 'Message', tone: 'yellow' },
  { id: 'email', emoji: '✉️', label: 'Email', tone: 'orange' },
  { id: 'x', emoji: '🐦', label: 'X / Twitter', tone: 'violet' },
  { id: 'copy', emoji: '📋', label: 'Copy text', tone: 'pink' },
];

export function ShareOptions({
  message,
  onShareImage,
}: {
  message: string;
  // Shares the reveal card as a picture; resolves to a short status line.
  onShareImage: () => Promise<string | null>;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const subject = `We played ${BRAND.name}!`;
  const fullText = BRAND.url ? `${message}\n\n${BRAND.url}` : message;

  const copy = async (note = '✓ Copied! Paste it into any chat.') => {
    try {
      await Clipboard.setStringAsync(fullText);
      setStatus(note);
      haptic('success');
    } catch {
      setStatus('Couldn’t copy on this device.');
    }
  };

  const choose = async (option: Option) => {
    haptic('tap');
    if (option.id === 'copy') {
      await copy();
      return;
    }
    const url = shareLink(option.id, message, { platform: Platform.OS, subject, url: BRAND.url || undefined });
    try {
      await Linking.openURL(url);
      setStatus(`Opening ${option.label}…`);
    } catch {
      await copy(`Couldn’t open ${option.label} here, so the text is copied instead. Paste it anywhere.`);
    }
  };

  const systemShare = async () => {
    try {
      await Share.share({ message: fullText, title: subject });
    } catch {
      // Browsers without a share menu (most desktops) land here.
      await copy('No share menu here, so the text is copied instead. Paste it anywhere.');
    }
  };

  const shareImage = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setStatus(await onShareImage());
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Eyebrow>📣 SHARE THE CHAOS</Eyebrow>
      <Text style={styles.title}>Where to?</Text>
      <Text style={styles.copy}>Send the results to a friend or post them anywhere.</Text>
      <View style={styles.grid}>
        {OPTIONS.map((option) => {
          const colors = TONE_COLORS[option.tone];
          return (
            <Pressable
              accessibilityLabel={`Share with ${option.label}`}
              accessibilityRole="button"
              key={option.id}
              onPress={() => void choose(option)}
              style={styles.cell}
            >
              {({ pressed }) => (
                <View style={[styles.edge, { backgroundColor: colors.edge }]}>
                  <View
                    style={[styles.face, { backgroundColor: colors.face, transform: [{ translateY: pressed ? 0 : -4 }] }]}
                  >
                    <Text style={styles.emoji}>{option.emoji}</Text>
                    <Text style={styles.label}>{option.label}</Text>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <PrimaryButton
        disabled={busy}
        icon="image" label={busy ? 'MAKING THE PICTURE…' : 'SHARE AS A PICTURE'}
        onPress={() => void shareImage()}
        tone="pink"
      />
      <PrimaryButton icon="more-horizontal" label="MORE OPTIONS" onPress={() => void systemShare()} secondary />
      {status && (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {status}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: THEME.text, fontFamily: FONTS.black, fontSize: 30, lineHeight: 34, marginTop: 6 },
  copy: { color: THEME.muted, fontFamily: FONTS.medium, fontSize: 14, lineHeight: 20, marginTop: 2, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '31%', flexGrow: 1 },
  edge: { borderRadius: RADIUS.md, marginTop: 4 },
  face: { borderRadius: RADIUS.md, minHeight: 82, alignItems: 'center', justifyContent: 'center', padding: 8 },
  emoji: { fontSize: 28 },
  label: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 12, marginTop: 2, textAlign: 'center' },
  status: { color: THEME.primary, fontFamily: FONTS.bold, fontSize: 14, textAlign: 'center', marginTop: 12 },
});
