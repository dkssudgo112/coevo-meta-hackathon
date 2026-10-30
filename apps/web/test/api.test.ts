import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePair } from '../src/lib/api.ts';

test('pairing links parse for US-jurisdiction (wu_) and older (w_) workspaces', () => {
  assert.deepEqual(parsePair('https://x.example/caddie#pair=wu_5m036g4d2x2u1y0b.kp7EAUJl-_Z'), { workspaceId: 'wu_5m036g4d2x2u1y0b', pairSecret: 'kp7EAUJl-_Z' });
  assert.deepEqual(parsePair('https://x.example/caddie#pair=w_3m0t0010030c4v3p.abc'), { workspaceId: 'w_3m0t0010030c4v3p', pairSecret: 'abc' });
  assert.equal(parsePair('https://x.example/caddie#pair=x_123.abc'), null);
});
