// E2E のシナリオが選ぶ窓の大きさ。

/**
 * 窓の大きさ。広いほうはカタログを撮る道具の広い窓と同じ。狭い窓の積み替えを見る
 * シナリオだけ `narrow` を使う。`large` と `medium` は、領域の寸法を窓の大きさごとに測るシナリオが使う。
 * `tier-edge-medium` と `tier-edge-large` はサイドバーを柱に畳む段の境目の両側、`compact` は柱の段でやり取りの列が既定で畳まれる幅。
 * `phone` はスマホの縦の窓、`tier-edge-narrow` と `tier-edge-rail` は狭い画面の形と柱の段の境目の両側。
 */
export const VIEWPORTS = {
  wide: { width: 1400, height: 900 },
  narrow: { width: 720, height: 900 },
  phone: { width: 390, height: 844 },
  "tier-edge-narrow": { width: 760, height: 844 },
  "tier-edge-rail": { width: 761, height: 844 },
  large: { width: 1440, height: 900 },
  medium: { width: 1024, height: 768 },
  "tier-edge-medium": { width: 1100, height: 768 },
  "tier-edge-large": { width: 1101, height: 768 },
  compact: { width: 800, height: 768 },
} as const satisfies Record<string, { readonly width: number; readonly height: number }>
