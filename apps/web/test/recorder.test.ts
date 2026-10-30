import test from 'node:test';
import assert from 'node:assert/strict';
import { Recorder, RecorderCancelled, type RecorderDeps } from '../src/lib/recorder.ts';

function fakes(opts: { failContext?: boolean; failProcessor?: boolean } = {}) {
  const counts = { trackStops: 0, contexts: 0, closes: 0 };
  let resolveStream!: (s: MediaStream) => void;
  const stream = { getTracks: () => [{ stop: () => { counts.trackStops++; } }] } as unknown as MediaStream;
  const deps: RecorderDeps = {
    getUserMedia: () => new Promise(r => { resolveStream = r; }),
    createContext: () => {
      if (opts.failContext) throw new Error('no audio');
      counts.contexts++;
      return {
        sampleRate: 48000,
        destination: {},
        createMediaStreamSource: () => ({ connect: () => undefined }),
        createScriptProcessor: () => {
          if (opts.failProcessor) throw new Error('processor');
          return { onaudioprocess: null, connect: () => undefined, disconnect: () => undefined };
        },
        close: async () => { counts.closes++; },
      };
    },
  };
  return { deps, counts, resolve: () => resolveStream(stream) };
}

test('cancel while permission is pending: the late stream is stopped and no audio context starts', async () => {
  const f = fakes();
  const r = new Recorder(f.deps);
  const p = r.start();
  r.cancel();
  f.resolve();
  await assert.rejects(p, RecorderCancelled);
  assert.equal(f.counts.trackStops, 1);
  assert.equal(f.counts.contexts, 0);
});

test('start after cancel is refused without asking for the microphone', async () => {
  const f = fakes();
  const r = new Recorder(f.deps);
  r.cancel();
  await assert.rejects(r.start(), RecorderCancelled);
  assert.equal(f.counts.trackStops, 0);
});

test('a setup error releases the tracks and the context it opened', async () => {
  const f = fakes({ failProcessor: true });
  const r = new Recorder(f.deps);
  const p = r.start();
  f.resolve();
  await assert.rejects(p, /processor/);
  assert.equal(f.counts.trackStops, 1);
  assert.equal(f.counts.closes, 1);
});

test('a context that cannot start still stops the tracks', async () => {
  const f = fakes({ failContext: true });
  const r = new Recorder(f.deps);
  const p = r.start();
  f.resolve();
  await assert.rejects(p, /no audio/);
  assert.equal(f.counts.trackStops, 1);
});

test('normal start, then stop releases everything once and returns a WAV', async () => {
  const f = fakes();
  const r = new Recorder(f.deps);
  const p = r.start();
  f.resolve();
  await p;
  const out = await r.stop();
  assert.equal(f.counts.trackStops, 1);
  assert.equal(f.counts.closes, 1);
  assert.ok(out.wav.length >= 44);
  r.cancel();
  assert.equal(f.counts.trackStops, 1, 'cancel after stop does not stop twice');
});
