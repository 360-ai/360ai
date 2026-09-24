import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';

import {
  isLocalRequest,
  localBypassEnabled,
  normalizeTeamDomain,
  verifyAccessToken,
} from '../functions/lib/access.js';

const teamDomain = 'https://team.cloudflareaccess.com';
const audience = 'test-audience';
const allowedEmail = 'denis@example.org';

async function tokenFixture(overrides = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  const token = await new SignJWT({
    email: allowedEmail,
    type: 'app',
    ...(overrides.payload || {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer || teamDomain)
    .setAudience(overrides.audience || audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return { token, keySet: createLocalJWKSet({ keys: [jwk] }) };
}

test('Team-Domain wird kanonisiert und darf keinen Pfad oder unsicheres Protokoll haben', () => {
  assert.equal(normalizeTeamDomain('team.cloudflareaccess.com'), teamDomain);
  assert.equal(normalizeTeamDomain(teamDomain + '/'), teamDomain);
  for (const value of ['', 'http://team.cloudflareaccess.com', teamDomain + '/pfad', teamDomain + '?x=1']) {
    assert.throws(() => normalizeTeamDomain(value));
  }
});

test('lokaler Bypass gilt nur explizit auf Loopback', () => {
  for (const url of ['http://localhost:8788/api/leads', 'http://127.0.0.1/api/leads', 'http://[::1]/api/leads']) {
    const request = new Request(url);
    assert.equal(isLocalRequest(request), true);
    assert.equal(localBypassEnabled(request, { LOCAL_DEV_BYPASS: 'true' }), true);
  }
  assert.equal(localBypassEnabled(
    new Request('https://crm.example.org/api/leads'),
    { LOCAL_DEV_BYPASS: 'true' },
  ), false);
  assert.equal(localBypassEnabled(
    new Request('http://localhost/api/leads'),
    { LOCAL_DEV_BYPASS: 'TRUE' },
  ), false);
});

test('Access-JWT wird mit Issuer, Audience, Typ und E-Mail verifiziert', async () => {
  const fixture = await tokenFixture();
  const payload = await verifyAccessToken(fixture.token, {
    TEAM_DOMAIN: teamDomain,
    POLICY_AUD: audience,
    ALLOWED_EMAIL: 'Denis@Example.org',
  }, fixture.keySet);
  assert.equal(payload.email, allowedEmail);
});

test('Access-JWT anderer E-Mail oder falschen Typs wird abgelehnt', async () => {
  const wrongMail = await tokenFixture({ payload: { email: 'fremd@example.org' } });
  await assert.rejects(() => verifyAccessToken(wrongMail.token, {
    TEAM_DOMAIN: teamDomain, POLICY_AUD: audience, ALLOWED_EMAIL: allowedEmail,
  }, wrongMail.keySet));

  const wrongType = await tokenFixture({ payload: { type: 'org' } });
  await assert.rejects(() => verifyAccessToken(wrongType.token, {
    TEAM_DOMAIN: teamDomain, POLICY_AUD: audience, ALLOWED_EMAIL: allowedEmail,
  }, wrongType.keySet));
});

test('Access-JWT mit falscher Audience oder falschem Issuer wird abgelehnt', async () => {
  const wrongAudience = await tokenFixture({ audience: 'other-aud' });
  await assert.rejects(() => verifyAccessToken(wrongAudience.token, {
    TEAM_DOMAIN: teamDomain, POLICY_AUD: audience, ALLOWED_EMAIL: allowedEmail,
  }, wrongAudience.keySet));

  const wrongIssuer = await tokenFixture({ issuer: 'https://other.cloudflareaccess.com' });
  await assert.rejects(() => verifyAccessToken(wrongIssuer.token, {
    TEAM_DOMAIN: teamDomain, POLICY_AUD: audience, ALLOWED_EMAIL: allowedEmail,
  }, wrongIssuer.keySet));
});
