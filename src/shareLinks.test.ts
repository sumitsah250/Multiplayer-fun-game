/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shareLink } from './shareLinks.ts';

const message = 'Ana & Ben won PARTY SPY!\nMode: CHAOS';

describe('shareLink', () => {
  it('prefills WhatsApp, X and email with the full message', () => {
    assert.equal(shareLink('whatsapp', message, { platform: 'android' }), `https://wa.me/?text=${encodeURIComponent(message)}`);
    assert.equal(shareLink('x', message, { platform: 'web' }), `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`);
    assert.equal(
      shareLink('email', message, { platform: 'ios', subject: 'Our game' }),
      `mailto:?subject=Our%20game&body=${encodeURIComponent(message)}`,
    );
  });

  it('uses the right SMS body separator per platform', () => {
    assert.ok(shareLink('sms', message, { platform: 'ios' }).startsWith('sms:&body='));
    assert.ok(shareLink('sms', message, { platform: 'android' }).startsWith('sms:?body='));
  });

  it('adds the game link when there is one', () => {
    const link = shareLink('whatsapp', 'Hi', { platform: 'web', url: 'https://party.example' });
    assert.equal(decodeURIComponent(link.split('text=')[1]), 'Hi\n\nhttps://party.example');
    const telegram = shareLink('telegram', 'Hi', { platform: 'web', url: 'https://party.example' });
    assert.ok(telegram.includes('url=https%3A%2F%2Fparty.example'));
    assert.ok(telegram.endsWith('text=Hi'));
  });

  it('escapes characters that would break the link', () => {
    const link = shareLink('whatsapp', 'A & B #win ?', { platform: 'android' });
    assert.ok(!link.slice('https://wa.me/?text='.length).includes('&'));
    assert.ok(!link.includes('#'));
  });
});
