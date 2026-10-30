import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraOffMessage, cameraShouldRun } from '../src/lib/camera.ts';

const gate = (sessionStatus: 'live' | 'paused' | 'ended' | null, over: { hasCrop?: boolean; benchDone?: boolean } = {}) => ({ hasCrop: true, benchDone: false, sessionStatus, ...over });

test('the camera runs before the first session and during a live one', () => {
  assert.equal(cameraShouldRun(gate(null)), true); // the first frame starts the session
  assert.equal(cameraShouldRun(gate('live')), true);
});

test('pause, an ended session and a finished benchmark turn the camera off', () => {
  assert.equal(cameraShouldRun(gate('paused')), false);
  assert.equal(cameraShouldRun(gate('ended')), false);
  assert.equal(cameraShouldRun(gate('live', { benchDone: true })), false);
  assert.equal(cameraShouldRun(gate(null, { hasCrop: false })), false); // photo mode
});

test('the camera strip says why it is off', () => {
  assert.equal(cameraOffMessage(gate('paused')), 'Paused — camera off, nothing is sent');
  assert.equal(cameraOffMessage(gate('ended')), 'Session ended — camera off');
  assert.equal(cameraOffMessage(gate('live', { benchDone: true })), 'Benchmark finished — camera off');
});
