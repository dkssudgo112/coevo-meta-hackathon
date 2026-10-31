import test from 'node:test';
import assert from 'node:assert/strict';
import { securityHeaders, withHeaders } from '../src/headers.ts';

test('the CSP allows this origin\'s own WebSocket and nothing else new', () => {
  const live = securityHeaders(new URL('https://coevo.example.dev/desk'))['Content-Security-Policy'];
  assert.match(live, /connect-src 'self' wss:\/\/coevo\.example\.dev;/);
  const local = securityHeaders(new URL('http://127.0.0.1:8788/'))['Content-Security-Policy'];
  assert.match(local, /connect-src 'self' ws:\/\/127\.0\.0\.1:8788;/);
  assert.doesNotMatch(live, /connect-src[^;]*\*/);
});

test('ordinary responses get the security headers', () => {
  const out = withHeaders(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }), new URL('https://coevo.example.dev/api/health'));
  assert.equal(out.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(out.headers.get('Content-Type'), 'application/json');
});

test('a WebSocket upgrade response is passed through untouched', () => {
  // Node cannot build a 101 Response, so a stand-in with the same two fields the check reads.
  const upgrade = { status: 101, webSocket: {} } as unknown as Response;
  assert.equal(withHeaders(upgrade, new URL('https://coevo.example.dev/api/w/wu_x/live')), upgrade);
});
