// E2E のシナリオが選ぶビューポートの大きさ。

/**
 * ビューポートの大きさ。広いほうはカタログを撮る道具の広いビューポートと同じ。狭いビューポートの積み替えを見る
 * シナリオだけ `narrow` を使う。`large` と `medium` は、寸法をビューポートの大きさごとに測るシナリオが使う。
 * `phone` はスマホの縦のビューポート。
 * `full-hd` はフルHDの全画面（1920×1080）、`laptop` は小さめのノート PC の画面（1280×800）。
 */
export const VIEWPORTS = {
  wide: { width: 1400, height: 900 },
  narrow: { width: 720, height: 900 },
  phone: { width: 390, height: 844 },
  large: { width: 1440, height: 900 },
  medium: { width: 1024, height: 768 },
  "full-hd": { width: 1920, height: 1080 },
  laptop: { width: 1280, height: 800 },
} as const satisfies Record<string, { readonly width: number; readonly height: number }>
