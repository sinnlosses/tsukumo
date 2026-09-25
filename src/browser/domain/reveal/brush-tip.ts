// 筆先（いま本文を書いている筆の先。塊の上をZ字になぞる）を配る。**書いているのは
// `use-report-reveal.ts`、読んでいるのはミニ立ち絵（`../mini-portrait.tsx`）で、どちらも
// メインビューの中**なので、機能の中（この演出のディレクトリ）に置く（`docs/design.md` 2章
// 「機能の中を分ける」。`stores/` は複数の機能が読む状態の箱で、ここは読み手が1つ）。
//
// **`SessionState` には入れない。** サーバから来るものではなく、ブラウザの描画のあいだだけ
// 存在する値だから。
//
// **書き上げたあとも筆先は消えない。** 書き終わった位置に `resting` として残り、**次に
// 書き始めたときだけ**そちらへ移る。undefined に戻るのは、まだ一度も
// 書いていないときと、測れないフレームだけ。
//
// **ただし筆先はやり取り1つに属する**（`turnId`）。座標は本文の入れ物の原点基準なので、次の
// 依頼で本文が入れ替わると、同じ座標の先には違う本文がある——**残った筆先が新しい本文の上へ
// 浮く**（画面で出た）。捨てずに持たせておくのは、過去のターンを見て戻ったときに
// 元の場所へそのまま戻れるようにするため。
//
// React の外に1つだけ持つ（演出は同時に1つしか走らない。`use-report-reveal.ts`）。

import { useSyncExternalStore } from "react"

/**
 * 筆先の座標の原点になる入れ物の印（`components/page/conversation/components/main-view/main-view.tsx` が
 * `.main-turns` に付ける）。**座標系の定義と同じところに置く**——原点が動くと座標の意味が
 * 変わるので、印の名前と {@link BrushPlace} の説明を離さない。
 */
export const BRUSH_ORIGIN_ATTRIBUTE = "data-brush-origin"

/**
 * いまなぞっている画の種別。**Z字のどの画か**で追従の間合いが変わる（`mini-portrait.tsx`）ので、
 * 「書いているか」を `| undefined` の組み合わせではなく**この1つの印**で表す。
 *
 * - `sweep`: 横画。左から右へ**文字を出しながら**進む
 * - `return`: 斜めの戻り。行末から次の帯の頭へ**筆を上げたまま**戻る（文字は出さない）
 */
export type BrushStroke = "sweep" | "return"

/**
 * 筆先の位置。**本文の入れ物**（{@link BRUSH_ORIGIN_ATTRIBUTE} を付けた要素）の左上が原点で、
 * ビューポート座標ではない。追従する側はその入れ物の中に `position: absolute` で置く。
 *
 * **原点を本文側に取るのは、書き終わった筆先がそこに残るから**（`mini-portrait.tsx`）。
 * ビューポート基準のまま残すと、本文を転がしたときに関係ない場所へ浮いたまま居座る。測るのは
 * ビューポート座標（`getBoundingClientRect()`）なので、写すのは `measure.ts` の仕事。
 *
 * `top` / `bottom` は**いま書いている帯**（Z字の1画。`use-report-reveal.ts`）の上端と下端。
 * 帯は**トピック（見出しから次の見出しまで）の行を上下に割ったもの**で、要素をまたいで伸びる。
 * 行が1つしか取れないトピックでは、その上端と下端がそのまま入る。
 */
export type BrushPlace = {
  readonly x: number
  readonly top: number
  readonly bottom: number
}

/**
 * 筆先。**書いている最中と、書き終わってそこに残っているのを1つの印で見分ける**
 * （2つの `| undefined` で1つの状態を表さない。`CLAUDE.md`）。
 *
 * - `writing`: なぞっている最中。`stroke` は**どの画か**の印で、位置と同じ1つの値の中に持つ
 *   （画ごとに別の口で配ると、位置と種別がずれたフレームができる）
 * - `resting`: 書き終わってその場に残っている。位置は**最後の行が終わったところ**（帯ではなく
 *   行。帯の右端はその帯でいちばん長い行の右なので、短い行で終わる本文では右へ外れる。
 *   `use-report-reveal.ts`）。**次に書き始めるまで消えない**ので、なぞる画も持たない
 */
export type BrushTip = BrushPlace & {
  /**
   * この筆先を出したやり取り（`src/shared/main-view.ts` の `MainViewTurn.id`）。**筆先は
   * そのやり取りの本文の上にしか意味を持たない**——別のやり取りが出ているあいだ、座標の先には
   * 違う本文があるので、追従する側はここを見て引っ込む（`components/page/conversation/components/main-view/components/mini-portrait/mini-portrait.tsx`）。
   */
  readonly turnId: number
} & ({ readonly phase: "writing"; readonly stroke: BrushStroke } | { readonly phase: "resting" })

/** 筆先を配る。 */
export function publishBrushTip(next: BrushTip | undefined): void {
  tip = next
  for (const listener of listeners) {
    listener()
  }
}

/**
 * 書いていた筆先を**最後に配ったところに残す**。演出が終わるときの**落とし先**で、ふだんは
 * 本文の末尾を測って残す（`use-report-reveal.ts` の `finish()`）——ここを使うのは末尾が
 * 測れなかったときだけ。**書いていなければ何もしない**——測れないまま終わった演出が、前に残した筆先を
 * 消さないようにする。
 */
export function restBrushTip(): void {
  if (tip === undefined || tip.phase === "resting") {
    return
  }
  publishBrushTip({
    phase: "resting",
    turnId: tip.turnId,
    x: tip.x,
    top: tip.top,
    bottom: tip.bottom,
  })
}

/** いまの筆先（まだ一度も書かれていなければ undefined）。 */
export function useBrushTip(): BrushTip | undefined {
  return useSyncExternalStore(subscribeBrushTip, brushTipSnapshot, brushTipSnapshot)
}

let tip: BrushTip | undefined = undefined
const listeners = new Set<() => void>()

function subscribeBrushTip(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** **同じ筆先なら同じオブジェクト**を返す（`useSyncExternalStore` の約束）。 */
function brushTipSnapshot(): BrushTip | undefined {
  return tip
}
