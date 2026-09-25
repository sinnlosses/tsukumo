// レポートを「書き上げていくように見せる」演出の速さ（`docs/requirements.md` 4.3 /
// `docs/screen-design.md` 13.6）を `localStorage` に持つ。**利用者の設定**なので `appearance-color.ts` と
// 同じ並び（`browser/domain/`。ファイル名が指すのが「演出の速さ」という tsukumo の語彙なので
// `lib/` ではない。`docs/design.md` 2章「`lib/` と `utils/` に置く基準」の手順1）。読めない・欠けている値は
// 既定（`standard`）へ畳む。
//
// **読み手は2つ**（2つ目の読み手が出たときに上げる、appearance-color.ts と同じ引き金）:
// 歯車のポップオーバー（`components/domain/screen-nav/`）が選択肢を出して保存し、レポートの演出
// （`domain/reveal/use-report-reveal.ts`）がマウント時に読んで速さに使う。**機能どうしの
// import を増やさないため、保存と読み取りをここへ集める。**
//
// 具体の ms 値（`REVEAL_TIMING`）もここに置く。`reveal/plan.ts` は値を持たず、渡された
// {@link RevealTiming} で計算するだけ（純粋な割り当てのまま）——`browser/domain/` は
// `browser/features/` を import できない（`docs/design.md` 2章の箱の表）ので、型と具体値は
// 渡す側（ここ）に置き、`reveal/plan.ts` が型だけを読む向きにする。
//
// **`off` は物差しを持たない。** 「切る」は演出そのものを走らせない選択で、
// `domain/reveal/use-report-reveal.ts` が `revealSpeed === "off"` を見て `startReveal` を呼ばずに済ませる（本文はすぐ全部出て、ミニ立ち絵の
// 筆も出ない）。だから {@link RevealTiming} の対応表は `standard` / `fast` の2つだけで足りる。

export type RevealSpeed = "standard" | "fast" | "off"

/** 塊1つぶんの時間を決める物差し（`reveal/plan.ts` の `topicDurationMs` が使う）。 */
export type RevealTiming = {
  /** 文字1つぶんの持ち時間（ms）。**筆の速さはこの値で決まる**（同じ道を倍の時間で通れば、
   * 半分の速さになる）。 */
  readonly msPerCharacter: number
  /**
   * トピック1つに使ってよい時間の下限（ms）。**下限が大きいのは、1回のZ字をゆっくり書くため。**
   * 短いトピックでも2画を書き切るので、文字数に素直に比例させると筆が飛んで見える。
   */
  readonly minBlockMs: number
  /**
   * トピック1つに使ってよい時間の上限（ms）。**どちらも塊ごとに掛け、レポート全体には
   * 掛けない**——全体に予算を置いて按分すると、長いレポートほど1文字が速くなり、目で追える
   * 速さという狙いがレポートの長さで崩れる。塊の数で全体が伸びるのは受け入れる。
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
 * `standard` / `fast` の物差し。**`fast` は `standard` の半分**（`msPerCharacter` を
 * 40ms→20ms、`minBlockMs`・`maxBlockMs` も一緒に半分にする——3つを比で保たないと、短い塊だけ
 * 下限に張り付いて速さが変わらなく見える。`20ms` は `reveal/plan.ts` がもともと使っていた値
 * そのもの）。
 */
const REVEAL_TIMING = {
  standard: { msPerCharacter: 40, minBlockMs: 2400, maxBlockMs: 8000 },
  fast: { msPerCharacter: 20, minBlockMs: 1200, maxBlockMs: 4000 },
} satisfies Readonly<Record<Exclude<RevealSpeed, "off">, RevealTiming>>

/** `standard` / `fast` の物差しを引く（`off` は物差しを持たないので受け取らない）。 */
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
