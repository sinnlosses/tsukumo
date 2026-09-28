// レポートを「書き上げていくように見せる」演出の速さを `localStorage` に持つ。
// 読めない・欠けている値は既定（`standard`）へ畳む。
//
// 具体の ms 値（`REVEAL_TIMING`）もここに置く。
// 演出の計算は渡された `RevealTiming` を使うだけで、値を持たない。
//
// `off` は物差しを持たない。
// 「切る」は演出そのものを走らせない選択で、`useReportReveal` が `revealSpeed === "off"` を見て `startReveal` を呼ばずに済ませる（本文はすぐ全部出て、ミニ立ち絵の筆も出ない）。
// だから `RevealTiming` の対応表は `standard` / `fast` の2つだけで足りる。

export type RevealSpeed = "standard" | "fast" | "off"

/** 塊1つぶんの時間を決める物差し。 */
export type RevealTiming = {
  /** 文字1つぶんの持ち時間（ms）。筆の速さはこの値で決まる（同じ道を倍の時間で通れば、半分の速さになる）。 */
  readonly msPerCharacter: number
  /**
   * トピック1つに使ってよい時間の下限（ms）。下限が大きいのは、1回のZ字をゆっくり書くため。
   * 短いトピックでも2画を書き切るので、文字数に素直に比例させると筆が飛んで見える。
   */
  readonly minBlockMs: number
  /**
   * トピック1つに使ってよい時間の上限（ms）。下限も上限も塊ごとに掛け、レポート全体には掛けない。
   * 全体に予算を置いて按分すると、長いレポートほど1文字が速くなり、目で追える速さという狙いがレポートの長さで崩れる。
   * 塊の数で全体が伸びるのは受け入れる。
   */
  readonly maxBlockMs: number
}

export const DEFAULT_REVEAL_SPEED: RevealSpeed = "standard"

/** `<select>` に出す順とラベル。 */
export const REVEAL_SPEED_LABELS = [
  ["standard", "標準"],
  ["fast", "速い"],
  ["off", "切る"],
] satisfies readonly (readonly [RevealSpeed, string])[]

const STORAGE_KEY = "tsukumo-reveal-speed:v1"

/**
 * `standard` / `fast` の物差し。`fast` は `standard` の半分。
 * `msPerCharacter`・`minBlockMs`・`maxBlockMs` の3つを比で保たないと、短い塊だけ下限に張り付いて速さが変わらなく見える。
 */
const REVEAL_TIMING = {
  standard: { msPerCharacter: 40, minBlockMs: 2400, maxBlockMs: 8000 },
  fast: { msPerCharacter: 20, minBlockMs: 1200, maxBlockMs: 4000 },
} satisfies Readonly<Record<Exclude<RevealSpeed, "off">, RevealTiming>>

/** `off` は物差しを持たないので受け取らない。 */
export function revealTimingOf(speed: Exclude<RevealSpeed, "off">): RevealTiming {
  return REVEAL_TIMING[speed]
}

export function loadRevealSpeed(): RevealSpeed {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return DEFAULT_REVEAL_SPEED
  }
  return raw !== null && isRevealSpeed(raw) ? raw : DEFAULT_REVEAL_SPEED
}

export function saveRevealSpeed(value: RevealSpeed): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}

export function isRevealSpeed(value: string): value is RevealSpeed {
  return REVEAL_SPEED_LABELS.some(([speed]) => speed === value)
}
