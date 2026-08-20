import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

function rgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  const channels = rgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function property(block, name) {
  return block.match(new RegExp('--' + name + ':\\s*(#[0-9a-f]{6})', 'i'))?.[1];
}

const root = css.match(/:root\s*\{([^}]+)\}/)?.[1] ?? '';
const tokens = Object.fromEntries([
  'ink', 'ink-soft', 'muted', 'paper', 'card', 'control', 'control-border',
  'lavender', 'lavender-dark', 'on-accent',
].map((name) => [name, property(root, name)]));

test('Dark Mode ist Browser- und Theme-Standard', () => {
  assert.match(root, /color-scheme:\s*dark/);
  assert.match(html, /<meta name="color-scheme" content="dark">/);
  assert.match(html, /<meta name="theme-color" content="#0f1421">/);
  assert.doesNotMatch(css, /rgba\(255\s*,\s*255\s*,\s*255/i);
  assert.doesNotMatch(css, /#(?:fff|ffffff|fafbfe)\b/i);
});

test('Textfarben erreichen auf dunklen Flaechen mindestens WCAG AA', () => {
  assert.ok(contrast(tokens.ink, tokens.paper) >= 12);
  assert.ok(contrast(tokens.ink, tokens.card) >= 12);
  assert.ok(contrast(tokens['ink-soft'], tokens.card) >= 7);
  assert.ok(contrast(tokens.muted, tokens.card) >= 4.5);
  assert.ok(contrast(tokens['lavender-dark'], tokens.card) >= 4.5);
  assert.ok(contrast(tokens['on-accent'], tokens.lavender) >= 4.5);
});

test('Formular- und Button-Raender erreichen mindestens 3 zu 1', () => {
  assert.ok(contrast(tokens['control-border'], tokens.card) >= 3);
  assert.ok(contrast(tokens['control-border'], tokens.control) >= 3);
  assert.match(css, /\.button-secondary\s*\{[^}]*border-color:\s*var\(--control-border\)/s);
  assert.match(css, /\.field input[^}]*border:\s*1px solid var\(--control-border\)/s);
});

test('Status- und Compliance-Badges bleiben im Dark Mode lesbar', () => {
  const blocks = [...css.matchAll(/\.(?:status|compliance)-[a-z_]+\s*\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter((block) => property(block, 'status-bg') && property(block, 'status-ink'));
  assert.ok(blocks.length >= 10);
  for (const block of blocks) {
    const background = property(block, 'status-bg');
    const foreground = property(block, 'status-ink');
    assert.ok(contrast(foreground, background) >= 4.5, foreground + ' auf ' + background);
  }
});

test('Kleine Texte und Touch-Ziele bleiben gut lesbar und bedienbar', () => {
  assert.doesNotMatch(css, /font-size:\s*(?:10|11)px/);
  assert.match(css, /\.drag-handle\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s);
  assert.match(css, /\.icon-button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s);
  assert.match(css, /\.kanban-card \.field select\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.confirm-dialog\s*\{[^}]*background:\s*var\(--card\)/s);
  assert.doesNotMatch(css, /opacity:\s*\.55/);
});
