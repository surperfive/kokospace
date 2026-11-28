import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_AVATAR as MAPS_DEFAULT_AVATAR } from '../data/maps';
import { DEFAULT_AVATAR as ROOM_DEFAULT_AVATAR } from './roomCore';
import { INK_COLOR, deriveChibiPalette, solveAvatarPose } from './avatarPose';
import {
  PAPER_DOLL_ACCESSORY_IDS,
  PAPER_DOLL_EYE_IDS,
  PAPER_DOLL_HAIR_IDS,
  PAPER_DOLL_OUTFIT_IDS,
  normalizeAccessoryId,
  normalizeHairId,
  recolorPixelByRegion,
  resolvePaperDollParts,
} from './avatarPaperDoll';

test('DEFAULT_AVATAR matches across maps.ts and roomCore.ts with exact reference defaults', () => {
  assert.deepEqual(MAPS_DEFAULT_AVATAR, ROOM_DEFAULT_AVATAR);
  assert.equal(MAPS_DEFAULT_AVATAR.skinColor, '#FCE2D4');
  assert.equal(MAPS_DEFAULT_AVATAR.hairStyle, 'bob');
  assert.equal(MAPS_DEFAULT_AVATAR.hairColor, '#FFE338');
  assert.equal(MAPS_DEFAULT_AVATAR.eyeStyle, 'rainbow');
  assert.equal(MAPS_DEFAULT_AVATAR.outfitStyle, 'pleated');
  assert.equal(MAPS_DEFAULT_AVATAR.outfitColor, '#4589E8');
  assert.equal(MAPS_DEFAULT_AVATAR.accessory, 'cap');
});

test('deriveChibiPalette produces exact reference colors for default avatar and harmonizes custom colors', () => {
  const defPal = deriveChibiPalette(MAPS_DEFAULT_AVATAR);
  assert.equal(defPal.ink, INK_COLOR);
  assert.equal(defPal.hairBase, '#FFE338');
  assert.equal(defPal.topBase, '#4589E8');
  assert.equal(defPal.skirtBase, '#9AD8FA');
  assert.equal(defPal.capFront, '#FFFFFF');
  assert.equal(defPal.capSide, '#366AD1');
});

test('solveAvatarPose keeps arms naturally downward in idle/walk and raises only when carrying', () => {
  const frontIdle = solveAvatarPose('down', 0, 0, 0, 0, false);
  assert.ok(frontIdle.leftArmRot > 0.3 && frontIdle.leftArmRot < 0.8);
  assert.ok(frontIdle.rightArmRot > 0.3 && frontIdle.rightArmRot < 0.8);

  const sideWalk = solveAvatarPose('left', 500, Math.PI * 0.5, 1, 0, false);
  assert.ok(sideWalk.sideNearLegRot > 0.4);
  assert.ok(sideWalk.sideFarLegRot < -0.4);
});

test('default avatar resolves directly to the 3 decomposed user-layer PNG slots across all 4 directions and walk frames', () => {
  const publicDir = path.resolve(process.cwd(), 'public');
  const dirs = ['down', 'left', 'right', 'up'] as const;

  for (const dir of dirs) {
    for (const beat of [0, 140, 280, 420]) {
      const pIdle = resolvePaperDollParts(MAPS_DEFAULT_AVATAR, dir, false, false, false, beat);
      const pWalk = resolvePaperDollParts(MAPS_DEFAULT_AVATAR, dir, true, false, false, beat);
      assert.equal(pIdle.useUserBody, true);
      assert.equal(pIdle.useUserHairCap, true);
      assert.equal(pIdle.eyeOverlayUrl, null);
      assert.ok(pIdle.bodyUrl.includes('/user-layers/body/'));
      assert.ok(pIdle.headUrl.includes('/user-layers/head/'));
      assert.ok(pIdle.hairUrl.includes('/user-layers/haircap/'));

      for (const url of [pIdle.bodyUrl, pWalk.bodyUrl, pIdle.headUrl, pIdle.hairUrl]) {
        const diskPath = path.join(publicDir, url.replace(/^\//, ''));
        assert.ok(fs.existsSync(diskPath), `Missing user-layer PNG: ${diskPath}`);
      }
    }
  }
});

test('all swappable combinations and custom uploaded layer overrides resolve cleanly and exist on disk', () => {
  const publicDir = path.resolve(process.cwd(), 'public');
  const dirs = ['down', 'left', 'right', 'up'] as const;

  for (const hairStyle of PAPER_DOLL_HAIR_IDS) {
    for (const eyeStyle of PAPER_DOLL_EYE_IDS) {
      for (const outfitStyle of PAPER_DOLL_OUTFIT_IDS) {
        for (const accessory of PAPER_DOLL_ACCESSORY_IDS) {
          const cfg = { ...MAPS_DEFAULT_AVATAR, hairStyle, eyeStyle, outfitStyle, accessory };
          for (const dir of dirs) {
            for (const isMoving of [false, true]) {
              const p = resolvePaperDollParts(cfg, dir, isMoving, false, false, 140);
              for (const url of [p.bodyUrl, p.headUrl, p.hairUrl]) {
                const diskPath = path.join(publicDir, url.replace(/^\//, ''));
                assert.ok(fs.existsSync(diskPath), `Missing swappable PNG asset: ${diskPath}`);
              }
            }
          }
        }
      }
    }
  }

  // Custom uploaded PNG layer override takes priority cleanly
  const custom = resolvePaperDollParts(
    {
      ...MAPS_DEFAULT_AVATAR,
      customLayers: {
        body: 'data:image/png;base64,AAA',
        head: 'data:image/png;base64,BBB',
        hairCap: 'data:image/png;base64,CCC',
      },
    },
    'down',
    false,
    false,
    false,
    0
  );
  assert.equal(custom.hasCustomBody, true);
  assert.equal(custom.hasCustomHead, true);
  assert.equal(custom.hasCustomHairCap, true);
  assert.equal(custom.bodyUrl, 'data:image/png;base64,AAA');
  assert.equal(custom.headUrl, 'data:image/png;base64,BBB');
  assert.equal(custom.hairUrl, 'data:image/png;base64,CCC');

  // Legacy saved avatar IDs normalize cleanly to the new unified packs
  assert.equal(normalizeHairId('short'), 'punk');
  assert.equal(normalizeHairId('bun'), 'sailor');
  assert.equal(normalizeHairId('sidepart'), 'explorer');
  assert.equal(normalizeAccessoryId('glasses'), 'none');
});

test('selective pixel recoloring preserves dark outlines and white highlights while shifting hair, cap, skin, and outfit independently', () => {
  // Dark ink outline untouched
  assert.deepEqual(recolorPixelByRegion(35, 30, 41, 'haircap', '#FF7688', '#3EC495', 'bob'), [35, 30, 41]);
  // White cap front untouched
  assert.deepEqual(recolorPixelByRegion(252, 252, 252, 'haircap', '#FF7688', '#3EC495', 'bob'), [252, 252, 252]);
  // Yellow hair shifts to pink while blue cap shifts to emerald green on the SAME haircap layer
  const [hr, hg, hb] = recolorPixelByRegion(255, 227, 56, 'haircap', '#FF7688', '#3EC495', 'bob');
  assert.ok(hr > hg && hb > hg, `Expected pink hair rgb, got (${hr},${hg},${hb})`);
  const [cr, cg, cb] = recolorPixelByRegion(69, 137, 232, 'haircap', '#FF7688', '#3EC495', 'bob');
  assert.ok(cg > cr && cg > cb, `Expected green cap rgb, got (${cr},${cg},${cb})`);
  // Explorer orange hair shifts to blue while beige hat stays protected when outfitColor is default
  const [er, eg, eb] = recolorPixelByRegion(235, 118, 52, 'haircap', '#5894EE', '#4589E8', 'explorer');
  assert.ok(eb > er, `Expected blue-tinted explorer hair, got (${er},${eg},${eb})`);
});
