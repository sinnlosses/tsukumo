// レポートを「書き上げていくように見せる」演出で、**筆がどこをなぞるか**を決める（純粋な計算。
// 位置を測るのは `measure.ts`、いつ出すかは `plan.ts`）。
//
// 塊（トピック）の行をZ字の**帯**に割り、帯の上の `progress`（0〜1）から筆の居場所を出す。
//
// **帯の右端は、その帯にある行のいちばん右**（それまでは塊を囲む枠＝いちばん広い
// 要素の幅だった）。枠でなぞると、箇条書きのように短い行しかない帯では**横画の2〜5割しか
// 文字の上を通らず**、残りは何も書かれていない地の上を滑る。筆先に付いて歩くミニ立ち絵
// （`mini-portrait.tsx`）も、本文の右の空白に立って「書いている」ように見えない。
//
// **左端はどの帯も塊の左端で揃える**（行頭は揃っているので、帯ごとに変えない）。右端だけを
// 帯ごとにする。
//
// **横画の時間は帯の幅で按分する**。右端が帯ごとに変わるのに時間を等分したままだと、
// 筆の速さが帯ごとに変わる（実測で同じ塊の中でも 2.2倍）。塊の持ち時間はもともと文字数で
// 決まる（`plan.ts`）ので、帯へ配り直すときも**幅＝その帯の文字数の目安**で分ける。
//
// **いまどの画をなぞっているかも返す**（`BrushStep.stroke`）。横画と斜めの戻りでは
// 筆の速さが数倍ちがうので、筆先に付いて歩くミニ立ち絵が追従の間合いを画ごとに変えられるように
// する（`mini-portrait.tsx`）。

import { type BrushStroke } from "./brush-tip.ts"
import { clamp } from "./paint.ts"

/**
 * 行1つの位置（ビューポート座標）。**左端は持たない**——筆はどの帯も塊の左端から書き始めるので、
 * 行ごとの左端は使わない（箇条書きの字下げのぶん筆が右から始まることもない）。
 *
 * 図・グラフは行を持たないので、要素の box をまるごと1行として渡す（`measure.ts`）。
 */
export type LineBox = {
  readonly top: number
  readonly bottom: number
  readonly right: number
}

/** 塊を囲む枠（ビューポート座標）。**行が1つも取れない塊の落とし先**として使う。 */
export type RevealFrame = {
  readonly left: number
  readonly right: number
}

/** Z字の1画ぶんの帯。**ビューポート座標**（塊はトピックなので、要素をまたいで1本に伸びる）。 */
export type RevealBand = {
  readonly top: number
  readonly bottom: number
  /** 書き始めの左端。**どの帯も塊の左端**（行頭は揃っている）。 */
  readonly left: number
  /** 書き終わりの右端。**その帯にある行のいちばん右**（塊を囲む枠ではない）。 */
  readonly right: number
}

/** 塊1つぶんの帯。**必ず1つ以上ある**ので、使う側で「無い」を考えなくてよい。 */
export type RevealBands = readonly [RevealBand, ...(readonly RevealBand[])]

/** 筆がいまどこにいるか。**どれもビューポート座標**（`swept` だけ割合）。 */
export type BrushStep = {
  /** ここより上は全幅が出ている（`clip-path` の肩）。 */
  readonly filled: number
  /** いま書いている帯の下端。 */
  readonly bottom: number
  /** 文字を出し終えた右端。斜めに戻るあいだは帯の左端（その帯はもう出し切っている）。 */
  readonly writtenX: number
  /** 筆が帯の上を通り過ぎた割合（0〜1）。**図の濃さに使う。** 戻りのあいだは 0。 */
  readonly swept: number
  /** 筆先の横位置。戻りのあいだは右から左へ動く。 */
  readonly tipX: number
  readonly tipTop: number
  readonly tipBottom: number
  /** いまなぞっている画（横画か、斜めの戻りか）。 */
  readonly stroke: BrushStroke
}

/** Z字の横画ぜんぶに与える時間の割合を、帯1つあたりに直した値。残りが斜めの戻り。 */
const SWEEP_SHARE = 0.45

/** 斜めに戻るのに与える時間の割合。**横画より短い**（戻りは書いていないので、速く抜ける）。 */
const RETURN_SHARE = 0.1

/**
 * 行の矩形をZ字の2画に割る。**切れ目は真ん中の行の下端**なので、帯の境目が文字を上下に切らない。
 * 行が1つしか取れない塊（見出しだけ・図だけ）は1画で書く。
 *
 * 受け取る矩形は並び順も重なりも問わない（縦に重なるものはここでまとめる）。**行が1つも
 * 取れなければ枠に落とす**——まだレイアウトされていない塊で、次のフレームで測り直せば行が出る。
 */
export function toBands(boxes: readonly LineBox[], frame: RevealFrame): RevealBands {
  const lines = mergeLines(boxes)
  const first = lines.at(0)
  const last = lines.at(-1)
  if (first === undefined || last === undefined) {
    return [{ top: 0, bottom: 0, left: frame.left, right: frame.right }]
  }

  const upper = lines.slice(0, Math.ceil(lines.length / 2))
  const lower = lines.slice(upper.length)
  const middle = upper.at(-1)
  if (middle === undefined || lower.length === 0) {
    return [bandOf(first.top, last.bottom, lines, frame)]
  }

  return [
    bandOf(first.top, middle.bottom, upper, frame),
    bandOf(middle.bottom, last.bottom, lower, frame),
  ]
}

/**
 * 書き終わりの行（**行であって帯ではない**）。書き上げたあとに筆先を残す位置に使う
 * （`use-report-reveal.ts`）——帯の右端は**その帯でいちばん長い行の右**なので、短い行で終わる
 * 本文に使うと、書き終わっていない場所まで筆先が飛ぶ。
 */
export function lastLineOf(boxes: readonly LineBox[]): LineBox | undefined {
  return mergeLines(boxes).at(-1)
}

/**
 * Z字の上で、`progress` の時点の筆の居場所を求める。横画 → 斜めの戻り → 横画の順に時間を
 * 配り、**戻りのあいだは何も出さない**（直前の帯を出し切った状態のまま筆だけが動く）ので、
 * 見せる範囲が戻ることはない。
 */
export function brushStep(bands: RevealBands, progress: number): BrushStep {
  const timings = sweepTimingsOf(bands)
  const at = clamp(progress, 0, 1) * spanOf(timings)
  const index = Math.max(
    0,
    timings.findLastIndex((timing) => at >= timing.startAt),
  )
  const timing = timings[index] ?? { startAt: 0, share: SWEEP_SHARE }
  const band = bands[index] ?? bands[0]
  const next = bands.at(index + 1)
  const within = at - timing.startAt

  if (within <= timing.share || next === undefined) {
    const swept = timing.share <= 0 ? 1 : clamp(within / timing.share, 0, 1)
    const writtenX = band.left + swept * widthOf(band)
    return {
      filled: band.top,
      bottom: band.bottom,
      writtenX,
      swept,
      tipX: writtenX,
      tipTop: band.top,
      tipBottom: band.bottom,
      stroke: "sweep",
    }
  }

  const returned = clamp((within - timing.share) / RETURN_SHARE, 0, 1)
  return {
    filled: band.bottom,
    bottom: band.bottom,
    writtenX: band.left,
    swept: 0,
    tipX: band.left + (1 - returned) * widthOf(band),
    tipTop: band.top + (next.top - band.top) * returned,
    tipBottom: band.bottom + (next.bottom - band.bottom) * returned,
    stroke: "return",
  }
}

/** 帯1つ。右端はその帯にある行のいちばん右で、**塊の左端より左には来ない**。 */
function bandOf(
  top: number,
  bottom: number,
  lines: readonly LineBox[],
  frame: RevealFrame,
): RevealBand {
  const right = lines.reduce((max, line) => Math.max(max, line.right), frame.left)
  return { top, bottom, left: frame.left, right }
}

/**
 * 縦に重なる矩形を1行にまとめる。行の矩形は**行ごと・インラインの箱ごと**に取れるので、
 * 段落の中の `<code>` や、同じ行に並ぶ表のセルが別々の矩形になっている。
 */
function mergeLines(boxes: readonly LineBox[]): readonly LineBox[] {
  return [...boxes]
    .sort((left, right) => left.top - right.top)
    .reduce<readonly LineBox[]>((lines, box) => {
      const last = lines.at(-1)
      return last !== undefined && box.top < last.bottom
        ? [
            ...lines.slice(0, -1),
            {
              top: last.top,
              bottom: Math.max(last.bottom, box.bottom),
              right: Math.max(last.right, box.right),
            },
          ]
        : [...lines, box]
    }, [])
}

/** 帯1つぶんの横画の「始まる時刻」と「持ち時間」（どちらも正規化した時間）。 */
type SweepTiming = {
  readonly startAt: number
  readonly share: number
}

/**
 * 横画の時間を**帯の幅で按分して**並べる。幅がぜんぶ 0 の塊（まだレイアウトされていない）は
 * 等分に落とす。
 */
function sweepTimingsOf(bands: RevealBands): readonly SweepTiming[] {
  const total = bands.reduce((sum, band) => sum + widthOf(band), 0)
  const budget = bands.length * SWEEP_SHARE
  return bands.reduce<readonly SweepTiming[]>((timings, band) => {
    const last = timings.at(-1)
    return [
      ...timings,
      {
        startAt: last === undefined ? 0 : last.startAt + last.share + RETURN_SHARE,
        share: total <= 0 ? SWEEP_SHARE : (budget * widthOf(band)) / total,
      },
    ]
  }, [])
}

/** Z字ぜんたいの長さ（正規化した時間）。最後の横画を書き終えたところで終わる。 */
function spanOf(timings: readonly SweepTiming[]): number {
  const last = timings.at(-1)
  return last === undefined ? SWEEP_SHARE : last.startAt + last.share
}

function widthOf(band: RevealBand): number {
  return Math.max(0, band.right - band.left)
}
