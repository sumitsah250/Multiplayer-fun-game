// Links that open a specific app with the results already typed in. Pure
// functions (no React Native imports) so they can be unit tested.

export type ShareTarget = 'whatsapp' | 'telegram' | 'sms' | 'email' | 'x';
export type DevicePlatform = 'ios' | 'android' | 'web' | string;

const encode = encodeURIComponent;

export function shareLink(
  target: ShareTarget,
  message: string,
  options: { platform: DevicePlatform; subject?: string; url?: string },
): string {
  const text = options.url ? `${message}\n\n${options.url}` : message;
  switch (target) {
    case 'whatsapp':
      // Universal link: opens the WhatsApp app if installed, WhatsApp Web otherwise.
      return `https://wa.me/?text=${encode(text)}`;
    case 'telegram':
      // Telegram's share link needs a url parameter; the text goes alongside it.
      return `https://t.me/share/url?url=${encode(options.url ?? ' ')}&text=${encode(message)}`;
    case 'sms':
      // iOS reads the body after "&", Android (and most others) after "?".
      return options.platform === 'ios' ? `sms:&body=${encode(text)}` : `sms:?body=${encode(text)}`;
    case 'email':
      return `mailto:?subject=${encode(options.subject ?? '')}&body=${encode(text)}`;
    case 'x':
      return `https://twitter.com/intent/tweet?text=${encode(text)}`;
  }
}
