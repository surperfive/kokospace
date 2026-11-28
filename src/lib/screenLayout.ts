import { MapThemeDefinition } from '../types/metaverse';

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Determines whether a map's screen is currently docked inside its illustrated
 * cutout arch window.
 *
 * Besides the clean `screenAnchor == null` default, an older persisted room
 * anchor near the stage wall (e.g. from an earlier map layout or dropping the
 * screen back on stage) snaps cleanly back into the painted arch window so the
 * cutout never shows beige gaps around a shrunk video box.
 */
export function isScreenEmbeddedInCutout(
  mapTheme: Pick<MapThemeDefinition, 'screenRect' | 'screenFrameOverlay'>,
  screenAnchor?: { x: number; y: number } | null,
  screenCarrierId?: string | null
): boolean {
  if (!mapTheme.screenFrameOverlay || screenCarrierId) return false;
  if (!screenAnchor) return true;
  const base = mapTheme.screenRect;
  const baseCx = base.x + base.width / 2;
  const baseBottom = base.y + base.height;
  return (
    Math.abs(screenAnchor.x - baseCx) <= 220 &&
    screenAnchor.y <= baseBottom + 100
  );
}

/**
 * Compute the world-space rectangle for the central cinema screen.
 *
 * When a map defines `screenFrameOverlay` (an illustrated cutout window baked into
 * the background artwork) and the screen is docked in its slot, lock the screen
 * 1:1 to `mapTheme.screenRect` so the video aligns pixel-for-pixel with the
 * painted arch, hanging lamps, and speakers at every viewport size and zoom level.
 */
export function computeScreenWorldRect(
  mapTheme: Pick<MapThemeDefinition, 'screenRect' | 'screenFrameOverlay'>,
  viewport: { width: number; height: number },
  screenAnchor?: { x: number; y: number } | null,
  screenCarrierId?: string | null
): WorldRect {
  const base = mapTheme.screenRect;

  if (isScreenEmbeddedInCutout(mapTheme, screenAnchor, screenCarrierId)) {
    return {
      x: base.x,
      y: base.y,
      width: base.width,
      height: base.height,
    };
  }

  const narrow = viewport.width < 768;
  const refZoom = narrow ? 0.62 : 0.92;
  const targetRatio = narrow ? 0.86 : 0.5;
  const raw = (viewport.width * targetRatio) / (base.width * refZoom);
  const rawByHeight = (viewport.height * 0.45) / (base.height * refZoom);
  const scale = Math.max(0.72, Math.min(1.17, raw, rawByHeight));
  const cx = screenAnchor?.x ?? base.x + base.width / 2;
  const bottom = screenAnchor?.y ?? base.y + base.height;
  const width = base.width * scale;
  const height = base.height * scale;
  return { x: cx - width / 2, y: bottom - height, width, height };
}

/**
 * Player character world-space scale factor.
 * Illustrated full-room maps (e.g. 1600×2250 Moonlight Lounge with 440px sofas)
 * render player characters prominently at 2.6× (~187 world px tall), while
 * compact vector maps render players at 1.55×.
 */
export function getPlayerWorldScale(
  mapTheme: Pick<MapThemeDefinition, 'mapSvg' | 'screenFrameOverlay'>
): number {
  return mapTheme.mapSvg || mapTheme.screenFrameOverlay ? 2.6 : 1.55;
}

/**
 * Patrolling NPC world-space scale factor (kept independently from player scale
 * so enlarging players does not bloat the NPC).
 */
export function getNpcWorldScale(
  mapTheme: Pick<MapThemeDefinition, 'mapSvg' | 'screenFrameOverlay'>
): number {
  return mapTheme.mapSvg || mapTheme.screenFrameOverlay ? 1.85 : 1.28;
}
