import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeScreenWorldRect,
  getNpcWorldScale,
  getPlayerWorldScale,
  isScreenEmbeddedInCutout,
} from './screenLayout';
import { BUILTIN_MAPS } from '../data/maps';

test('embedded cutout map locks screenRect 1:1 across desktop and mobile viewports', () => {
  const moonlight = BUILTIN_MAPS.find((m) => m.id === 'sunset-rooftop');
  assert.ok(moonlight, 'sunset-rooftop map must exist');
  assert.ok(moonlight.screenFrameOverlay, 'sunset-rooftop should configure screenFrameOverlay');

  for (const vp of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    const rect = computeScreenWorldRect(moonlight, vp, null, null);
    assert.deepEqual(rect, moonlight.screenRect);
  }
});

test('persisted near-stage screenAnchor snaps into embedded cutout while distant/carried anchor detaches', () => {
  const moonlight = BUILTIN_MAPS.find((m) => m.id === 'sunset-rooftop')!;
  // Legacy anchor near the old stage wall should dock seamlessly into the arch cutout
  assert.equal(isScreenEmbeddedInCutout(moonlight, { x: 800, y: 630 }, null), true);
  assert.deepEqual(
    computeScreenWorldRect(moonlight, { width: 1440, height: 900 }, { x: 800, y: 630 }, null),
    moonlight.screenRect
  );

  // Moved far down into the lounge detaches cleanly
  assert.equal(isScreenEmbeddedInCutout(moonlight, { x: 900, y: 1200 }, null), false);
  const moved = computeScreenWorldRect(moonlight, { width: 1440, height: 900 }, { x: 900, y: 1200 }, null);
  assert.equal(Math.round(moved.x + moved.width / 2), 900);
  assert.equal(Math.round(moved.y + moved.height), 1200);
});

test('non-embedded maps preserve responsive viewport scaling', () => {
  const gallery = BUILTIN_MAPS.find((m) => m.id === 'gallery-theater')!;
  const desktop = computeScreenWorldRect(gallery, { width: 1440, height: 900 }, null, null);
  const mobile = computeScreenWorldRect(gallery, { width: 390, height: 844 }, null, null);
  assert.notEqual(desktop.width, mobile.width);
  assert.equal(Math.round(desktop.y + desktop.height), gallery.screenRect.y + gallery.screenRect.height);
});

test('player scale enlarges independently while NPC scale stays fixed', () => {
  const moonlight = BUILTIN_MAPS.find((m) => m.id === 'sunset-rooftop')!;
  const gallery = BUILTIN_MAPS.find((m) => m.id === 'gallery-theater')!;
  assert.equal(getPlayerWorldScale(moonlight), 2.6);
  assert.equal(getNpcWorldScale(moonlight), 1.85);
  assert.ok(getPlayerWorldScale(moonlight) > getNpcWorldScale(moonlight));
  assert.equal(getPlayerWorldScale(gallery), 1.55);
  assert.equal(getNpcWorldScale(gallery), 1.28);
});
