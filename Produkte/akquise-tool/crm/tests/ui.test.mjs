// Rendertests fuer app.js. Die Datei enthaelt die gesamte Schreib-, Konflikt- und
// Renderlogik und war bisher nur ueber Regex-Zusicherungen abgedeckt. Hier laeuft
// sie wirklich, gegen ein echtes DOM.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import { createDemoData } from '../functions/lib/demo-data.js';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

// Startet die App gegen jsdom und liefert Fenster plus Zugriff auf den Zustand.
async function starte({ leads, activities, audits } = createDemoData()) {
  const dom = new JSDOM(html, {
    url: 'https://crm.example.org/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // app.js laedt die Daten ueber ein eingefuegtes <script>. Das wird hier direkt bedient.
  const originalAppend = window.document.head.append.bind(window.document.head);
  window.document.head.append = (element) => {
    // jsdom loest src zu einer absoluten Adresse auf, daher includes statt startsWith.
    if (element.tagName === 'SCRIPT' && String(element.src).includes('/sync')) {
      const id = new URL(element.src, 'https://crm.example.org').searchParams.get('request_id');
      queueMicrotask(() => {
        window.__AKQUISE_CRM_SYNC_V1__.deliver(id, {
          ok: true, leads, activities, audits, meta: { generated_at: new Date().toISOString() },
        });
      });
      return element;
    }
    return originalAppend(element);
  };
  window.fetch = async () => new window.Response('{}', { status: 503 });
  window.navigator.clipboard = { writeText: async () => {} };
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function close(wert) {
    this.open = false;
    this.returnValue = wert ?? '';
    this.dispatchEvent(new window.Event('close'));
  };

  const fehler = [];
  window.addEventListener('error', (event) => fehler.push(event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => fehler.push(event.reason));

  const quelle = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const domainQuelle = await readFile(new URL('../public/domain.js', import.meta.url), 'utf8');
  // ES-Module ohne Bundler: domain.js wird eingebettet und der Import entfernt.
  const zusammen = domainQuelle.replaceAll(/^export /gm, '')
    + '\n' + quelle.replace(/^import \{[\s\S]*?\} from '\.\/domain\.js';\n/m, '');
  window.eval(zusammen);
  await new Promise((resolve) => { setTimeout(resolve, 30); });
  return { window, dom, fehler };
}

const text = (window) => window.document.querySelector('#main-content').textContent;

test('Dashboard startet mit echten Daten und ohne Fehler', async () => {
  const { window, fehler } = await starte();
  assert.deepEqual(fehler, []);
  assert.match(text(window), /Guten Tag, Denis/);
  assert.match(window.document.querySelector('#sync-state').textContent, /Gerade aktualisiert/);
  // Der Link zum Sheet zeigt auf die echte Tabelle.
  assert.match(window.document.querySelector('#sheet-link').href, /docs\.google\.com\/spreadsheets/);
});

test('alle Ansichten rendern ohne Ausnahme', async () => {
  const { window, fehler } = await starte();
  for (const ansicht of ['leads', 'kanban', 'archiv', 'neu', 'dashboard']) {
    window.location.hash = ansicht;
    window.dispatchEvent(new window.Event('hashchange'));
    assert.ok(window.document.querySelector('#main-content').innerHTML.length > 50, ansicht);
  }
  assert.deepEqual(fehler, [], 'kein unbehandelter Fehler beim Ansichtswechsel');
});

test('ein unlesbares Datum legt die App nicht lahm', async () => {
  const daten = createDemoData();
  daten.leads[0].next_action_at = '2026-13-01';
  daten.leads[1].next_action_at = '20.08.2026';
  daten.leads[2].unterlagen_gesendet_am = '9999-99-99';
  const { window, fehler } = await starte(daten);
  assert.deepEqual(fehler, []);
  assert.match(text(window), /Guten Tag, Denis/, 'Dashboard muss trotzdem stehen');
  for (const ansicht of ['leads', 'kanban']) {
    window.location.hash = ansicht;
    window.dispatchEvent(new window.Event('hashchange'));
    assert.ok(window.document.querySelector('#main-content').innerHTML.length > 50, ansicht);
  }
  window.location.hash = 'lead/' + daten.leads[0].lead_id;
  window.dispatchEvent(new window.Event('hashchange'));
  assert.match(text(window), /nicht gelesen werden/, 'Hinweis auf unlesbares Datum fehlt');
  assert.deepEqual(fehler, []);
});

test('Lead ohne gueltigen Status bleibt im Kanban sichtbar', async () => {
  const daten = createDemoData();
  daten.leads[0].status = '';
  daten.leads[1].status = 'Neu';
  const { window } = await starte(daten);
  window.location.hash = 'kanban';
  window.dispatchEvent(new window.Event('hashchange'));
  const inhalt = text(window);
  assert.match(inhalt, /Ohne gültigen Status/);
  assert.match(inhalt, new RegExp(daten.leads[0].firma));
  assert.match(inhalt, new RegExp(daten.leads[1].firma));
});

test('Kanban-Karte fuehrt in die Lead-Akte', async () => {
  const { window } = await starte();
  window.location.hash = 'kanban';
  window.dispatchEvent(new window.Event('hashchange'));
  const knopf = window.document.querySelector('.kanban-open');
  assert.ok(knopf, 'Kanban-Karte braucht einen anklickbaren Namen');
  knopf.click();
  window.dispatchEvent(new window.Event('hashchange'));
  assert.match(window.location.hash, /^#lead\//);
  assert.ok(window.document.querySelector('#lead-edit-form'), 'Detailansicht fehlt');
});

test('Detailansicht zeigt Stammdaten, KI-Panel und Verlauf', async () => {
  const { window, fehler } = await starte();
  window.location.hash = 'lead/L-DEMO-004';
  window.dispatchEvent(new window.Event('hashchange'));
  const inhalt = text(window);
  for (const abschnitt of ['Kundendaten', 'CRM-Felder bearbeiten', 'Text mit KI verfassen',
    'Verlauf', 'Lead-Verwaltung']) {
    assert.match(inhalt, new RegExp(abschnitt), abschnitt + ' fehlt');
  }
  // Telefon- und Mail-Links duerfen nicht prozentkodiert sein.
  const tel = window.document.querySelector('a[href^="tel:"]');
  assert.ok(tel && !tel.href.includes('%'), 'tel-Link darf keine Prozentkodierung enthalten');
  const mail = window.document.querySelector('a[href^="mailto:"]');
  assert.ok(mail && mail.href.includes('@'), 'mailto-Link braucht ein echtes @');
  assert.deepEqual(fehler, []);
});

test('Stammdaten lassen sich zum Bearbeiten aufklappen', async () => {
  const { window } = await starte();
  window.location.hash = 'lead/L-DEMO-004';
  window.dispatchEvent(new window.Event('hashchange'));
  assert.equal(window.document.querySelector('#stammdaten-form'), null);
  window.document.querySelector('[data-action="stammdaten-toggle"]').click();
  const form = window.document.querySelector('#stammdaten-form');
  assert.ok(form, 'Bearbeiten-Modus oeffnet kein Formular');
  for (const feld of ['firma', 'strasse', 'telefon', 'handy', 'mail']) {
    assert.ok(form.querySelector(`[name="${feld}"]`), 'Feld fehlt: ' + feld);
  }
});

test('Fehler bleiben stehen und sind schliessbar', async () => {
  const { window } = await starte();
  window.location.hash = 'lead/L-DEMO-004';
  window.dispatchEvent(new window.Event('hashchange'));
  // Die KI-Route antwortet in diesem Test mit 503.
  window.document.querySelector('#ki-form').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true }),
  );
  await new Promise((resolve) => { setTimeout(resolve, 20); });
  const meldung = window.document.querySelector('#alert-region .toast');
  assert.ok(meldung, 'Fehlermeldung fehlt');
  assert.equal(window.document.querySelector('#alert-region').getAttribute('role'), 'alert');
  meldung.querySelector('.toast-close').click();
  assert.equal(window.document.querySelector('#alert-region .toast'), null);
});

test('leere Datenquelle bietet das Anlegen an', async () => {
  const { window } = await starte({ leads: [], activities: [], audits: [] });
  window.location.hash = 'leads';
  window.dispatchEvent(new window.Event('hashchange'));
  assert.match(text(window), /Noch kein Lead in der Pipeline/);
  assert.ok(window.document.querySelector('a[href="#neu"]'));
});
