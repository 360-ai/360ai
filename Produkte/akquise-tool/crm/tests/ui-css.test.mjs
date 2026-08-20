import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('Kanban begrenzt die Dokumentbreite und scrollt nur im Board horizontal', () => {
  const shellRule = css.match(/\.kanban-shell\s*\{([^}]*)\}/)?.[1] ?? '';
  const boardRule = css.match(/\.kanban-board\s*\{([^}]*)\}/)?.[1] ?? '';
  const mobileBlock = css.match(/@media \(max-width: 760px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  const mobileShellRule = mobileBlock.match(/\.kanban-shell\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.match(shellRule, /max-width:\s*calc\(100% \+ clamp\(/);
  assert.match(shellRule, /overflow:\s*hidden/);
  assert.match(boardRule, /position:\s*relative/);
  assert.match(boardRule, /width:\s*100%/);
  assert.match(boardRule, /max-width:\s*100%/);
  assert.match(boardRule, /overflow-x:\s*auto/);
  assert.match(mobileShellRule, /width:\s*calc\(100% \+ 16px\)/);
  assert.match(mobileShellRule, /max-width:\s*calc\(100% \+ 16px\)/);
});
