// 確定したレポートを「書き上げていくように見せる」演出（`docs/requirements.md` 4.3）。
// **DOM は完成品を一度に作り、見せる範囲だけを進める**——文字を足していく実装にすると、表・
// mermaid・Chart.js が未完成のソースで作り直され、非同期に描く mermaid は途中の形で失敗する。
//
// **筆は1行ずつではなく、トピック1つをZ字で書く**（2026-09-20 の方針変更。それまでは `Range`
// で1文字ずつ位置を取り、行の途中で止めていた）。塊の切り方は `reveal-plan.ts`——見出しから
// 次の見出しまでが1つで、**段落や表の1つ1つではない**。その中の行を上下2つの帯に割り、帯ごとに
// 左から右へなぞって、あいだを斜めに戻る——つまりZ字の3画。**帯の切れ目は実際の行の box に
// 合わせる**ので、文字が上下に切れることはない（1行しかない塊は1画で書く）。
//
// 帯は**要素をまたいで1本に伸びる**（見出しと段落と表が同じ帯に入る）。だから筆の居場所は
// ビューポート座標で1つだけ持ち、要素ごとの見せ方へ {@link applyStep} で翻訳する:
//
// - 文字の要素は、Z字が通ったところまでを `clip-path` のポリゴンで見せる
// - 図・グラフの要素は、筆が通り過ぎた割合を `opacity` にする。**入れ物に触るだけ**なので、
//   mermaid と Chart.js が描き直されることはない（部品は `memo` のまま一度しかマウントされない）
//
// どちらもレイアウトを動かさない（`clip-path` も `opacity` も場所を取ったまま隠す）ので、
// 本文の高さは最初から最後まで変わらない。
//
// **筆先が画面から出たら器を送る**（`brush-scroll.ts`）。
//
// **止める口は3つ**（スクロール・クリック・キー入力）。ただし `scroll` は聞かない——
// スクロールアンカリングや `scrollIntoView` でも飛んでくるので、**利用者の操作そのもの**
// （ホイール・指・ポインタ・キー）だけを合図にする。
//
// **`prefers-reduced-motion: reduce` では演出ごと無効**（`theme.css` の規則は CSS の
// アニメーションにしか効かないので、ここでも見る）。

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

import { publishBrushTip, type BrushTip } from "../../stores/brush-tip.ts"
import { brushScroller } from "./brush-scroll.ts"
import { planReveal, type RevealBlock, type RevealMember } from "./reveal-plan.ts"

/** 見せる範囲を進めているあいだだけ根に立てる印（目視確認と、外から終わりを知るための口）。 */
const REVEALING_ATTRIBUTE = "data-revealing"

/** 何も見せていない状態の `clip-path`（高さ 0 に畳む。場所は取ったまま）。 */
const HIDDEN_CLIP = "inset(0 0 100% 0)"

/** 演出を飛ばす合図。**利用者の操作だけ**を並べる（`scroll` を入れない理由は冒頭）。 */
const SKIP_EVENT_NAMES = ["wheel", "touchmove", "pointerdown", "keydown"] as const

/** 合図は捕まえるだけで邪魔しない（`capture` は内側で止められても届かせるため）。 */
const SKIP_LISTENER_OPTIONS = { capture: true, passive: true } as const

/**
 * レポートの根に付ける ref を返す。`reveal` が立っていたら、**マウントした直後から**見せる範囲を
 * 進める。
 *
 * **見るのはマウントした時点の `reveal` だけ。** あとから対象でなくなっても（後ろに別の
 * レポートが現れても）始めた演出は最後まで進める——途中で止めると書きかけの本文が残る。
 */
export function useReportReveal(reveal: boolean): RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement>(null)
  const [revealOnMount] = useState(reveal)
  // **同じ本文を二度書かない。** `<Activity mode="hidden">`（キャラクター画面を開いている間）は
  // 部品の状態を残したまま効果だけを外すので、戻ってきたときにこの効果がもう一度走る。
  const revealedOnce = useRef(false)

  // React の外（DOM の style とフレームのタイマー）を動かす（docs/coding-standards.md「React」の
  // 4類型のうち「タイマー」と「React の外にある状態への書き込み」）。**`useLayoutEffect` で
  // なければならない** — `useEffect` は描画のあとに走るので、隠す前の本文が1フレームだけ
  // 全部見えてしまう。依存は1つだけで、マウント時に決まったきり変わらない。
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!revealOnMount || revealedOnce.current || root === null || prefersReducedMotion()) {
      return undefined
    }
    revealedOnce.current = true
    return startReveal(root)
  }, [revealOnMount])

  return rootRef
}

/**
 * 根の下の塊を隠してから、フレームごとに見せる範囲を進める。戻り値を呼ぶと**その場で全部出す**
 * （スキップと、部品が外れたときの後始末を兼ねる）。
 */
function startReveal(root: HTMLElement): () => void {
  const blocks = planReveal(root)
  if (blocks.length === 0) {
    return () => undefined
  }

  for (const block of blocks) {
    hideBlock(block)
  }
  root.setAttribute(REVEALING_ATTRIBUTE, "yes")

  const followTip = brushScroller(root)
  const startedAt = performance.now()
  let frame = 0
  let shown = 0
  let finished = false

  const finish = (): void => {
    if (finished) {
      return
    }
    finished = true
    cancelAnimationFrame(frame)
    for (const block of blocks) {
      showBlock(block)
    }
    root.removeAttribute(REVEALING_ATTRIBUTE)
    publishBrushTip(undefined)
    for (const name of SKIP_EVENT_NAMES) {
      window.removeEventListener(name, finish, SKIP_LISTENER_OPTIONS)
    }
  }

  const step = (): void => {
    // 出し切ったあとに積み残しのフレームが走っても、隠し直さない。
    if (finished) {
      return
    }
    const elapsed = performance.now() - startedAt
    // 通り過ぎた塊は出し切る。**塊は時間の順に並んでいる**ので、先頭から数えるだけでよい。
    for (let block = blocks.at(shown); block !== undefined && block.endMs <= elapsed; ) {
      showBlock(block)
      shown += 1
      block = blocks.at(shown)
    }

    const current = blocks.at(shown)
    if (current === undefined) {
      finish()
      return
    }
    const tip = advanceBlock(current, progressOf(current, elapsed))
    publishBrushTip(tip)
    followTip(tip)
    frame = requestAnimationFrame(step)
  }

  frame = requestAnimationFrame(step)
  for (const name of SKIP_EVENT_NAMES) {
    window.addEventListener(name, finish, SKIP_LISTENER_OPTIONS)
  }

  return finish
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function progressOf(block: RevealBlock, elapsed: number): number {
  const span = block.endMs - block.startMs
  return span <= 0 ? 1 : clamp((elapsed - block.startMs) / span, 0, 1)
}

function hideBlock(block: RevealBlock): void {
  for (const member of block.members) {
    if (member.kind === "figure") {
      member.element.style.opacity = "0"
    } else {
      member.element.style.clipPath = HIDDEN_CLIP
    }
  }
}

function showBlock(block: RevealBlock): void {
  for (const member of block.members) {
    member.element.style.removeProperty(member.kind === "figure" ? "opacity" : "clip-path")
  }
}

/** Z字の1画ぶんの帯。**ビューポート座標**（塊はトピックなので、要素をまたいで1本に伸びる）。 */
type RevealBand = {
  readonly top: number
  readonly bottom: number
}

/** 塊1つぶんの帯。**必ず1つ以上ある**ので、使う側で「無い」を考えなくてよい。 */
type RevealBands = readonly [RevealBand, ...(readonly RevealBand[])]

/** 塊を囲む枠（ビューポート座標）。筆先の横の振れ幅はこの幅で決まる。 */
type RevealFrame = {
  readonly left: number
  readonly width: number
}

/** 要素1つと、そのいまの位置。1フレームの中で box を2度測らないために組で持ち回る。 */
type MemberShape = {
  readonly member: RevealMember
  readonly box: DOMRect
}

/** Z字の横画1つに与える時間の割合。残り（{@link RETURN_SHARE}）が斜めの戻り。 */
const SWEEP_SHARE = 0.45

/** 斜めに戻るのに与える時間の割合。**横画より短い**（戻りは書いていないので、速く抜ける）。 */
const RETURN_SHARE = 0.1

/** 筆がいまどこにいるか。縦はビューポート座標、横は塊の幅に対する割合。 */
type BrushStep = {
  /** ここより上は全幅が出ている（`clip-path` の肩）。 */
  readonly filled: number
  /** いま書いている帯の下端。 */
  readonly bottom: number
  /** 帯の中で出ている横幅（0〜1）。戻りのあいだは 0。 */
  readonly written: number
  /** 筆先の横位置（0〜1）。戻りのあいだは右から左へ動く。 */
  readonly tipX: number
  readonly tipTop: number
  readonly tipBottom: number
}

/** 塊1つを `progress`（0〜1）まで出し、そのときの筆先を返す。 */
function advanceBlock(block: RevealBlock, progress: number): BrushTip | undefined {
  const shapes = block.members.map((member) => ({
    member,
    box: member.element.getBoundingClientRect(),
  }))
  const frame = frameOf(shapes)
  if (frame === undefined) {
    // まだレイアウトされていない。隠したまま次のフレームで追いつく。
    return undefined
  }

  const step = brushStep(bandsOf(shapes), progress)
  for (const shape of shapes) {
    applyStep(shape, step)
  }

  return {
    x: frame.left + step.tipX * frame.width,
    top: step.tipTop,
    bottom: step.tipBottom,
  }
}

/** 塊の中で、いちばん左といちばん広い要素に合わせる（要素ごとに幅が違っても筆が枠から出ない）。 */
function frameOf(shapes: readonly MemberShape[]): RevealFrame | undefined {
  const boxes = shapes.map((shape) => shape.box).filter((box) => box.width > 0 || box.height > 0)
  const first = boxes.at(0)
  if (first === undefined) {
    return undefined
  }

  return {
    left: boxes.reduce((left, box) => Math.min(left, box.left), first.left),
    width: boxes.reduce((width, box) => Math.max(width, box.width), first.width),
  }
}

/**
 * 塊をZ字の2画に割る。**切れ目は真ん中の行の下端**なので、帯の境目が文字を上下に切らない。
 * 行が1つしか取れない塊（見出しだけ・図だけ）は1画で書く。
 */
function bandsOf(shapes: readonly MemberShape[]): RevealBands {
  const lines = mergeLines(shapes.flatMap(lineBoxesOf))
  const first = lines.at(0)
  const last = lines.at(-1)
  const middle = lines.at(Math.ceil(lines.length / 2) - 1)
  if (first === undefined || last === undefined) {
    return [{ top: 0, bottom: 0 }]
  }
  if (lines.length < 2 || middle === undefined) {
    return [{ top: first.top, bottom: last.bottom }]
  }

  return [
    { top: first.top, bottom: middle.bottom },
    { top: middle.bottom, bottom: last.bottom },
  ]
}

/**
 * 要素の中の行。**図・グラフは行を持たない**ので、その要素の box をまるごと1行として扱う
 * （筆はその上を1画で通る）。
 */
function lineBoxesOf(shape: MemberShape): readonly RevealBand[] {
  if (shape.member.kind === "figure") {
    return shape.box.height > 0 ? [{ top: shape.box.top, bottom: shape.box.bottom }] : []
  }

  const range = document.createRange()
  range.selectNodeContents(shape.member.element)
  return [...range.getClientRects()]
    .filter((rect) => rect.height > 0)
    .map((rect) => ({ top: rect.top, bottom: rect.bottom }))
}

/**
 * 縦に重なる行を1本にまとめる。`getClientRects()` は**行ごと・インラインの箱ごと**に返すので、
 * 段落の中の `<code>` や、同じ行に並ぶ表のセルが別々の矩形になる。
 */
function mergeLines(boxes: readonly RevealBand[]): readonly RevealBand[] {
  return [...boxes]
    .sort((left, right) => left.top - right.top)
    .reduce<readonly RevealBand[]>((lines, box) => {
      const last = lines.at(-1)
      return last !== undefined && box.top < last.bottom
        ? [...lines.slice(0, -1), { top: last.top, bottom: Math.max(last.bottom, box.bottom) }]
        : [...lines, box]
    }, [])
}

/**
 * Z字の上で、`progress` の時点の筆の居場所を求める。横画 → 斜めの戻り → 横画の順に時間を
 * 配り、**戻りのあいだは何も出さない**（直前の帯を出し切った状態のまま筆だけが動く）ので、
 * 見せる範囲が戻ることはない。
 */
function brushStep(bands: RevealBands, progress: number): BrushStep {
  const cycle = SWEEP_SHARE + RETURN_SHARE
  const span = bands.length * SWEEP_SHARE + (bands.length - 1) * RETURN_SHARE
  const at = clamp(progress, 0, 1) * span
  const index = Math.min(Math.floor(at / cycle), bands.length - 1)
  const band = bands[index] ?? bands[0]
  const next = bands.at(index + 1)
  const within = at - index * cycle

  if (within <= SWEEP_SHARE || next === undefined) {
    const written = clamp(within / SWEEP_SHARE, 0, 1)
    return {
      filled: band.top,
      bottom: band.bottom,
      written,
      tipX: written,
      tipTop: band.top,
      tipBottom: band.bottom,
    }
  }

  const returned = clamp((within - SWEEP_SHARE) / RETURN_SHARE, 0, 1)
  return {
    filled: band.bottom,
    bottom: band.bottom,
    written: 0,
    tipX: 1 - returned,
    tipTop: band.top + (next.top - band.top) * returned,
    tipBottom: band.bottom + (next.bottom - band.bottom) * returned,
  }
}

/** 塊ぜんたいの筆の居場所を、要素1つぶんの見せ方に翻訳する。 */
function applyStep(shape: MemberShape, step: BrushStep): void {
  const box = shape.box
  const filled = clamp(step.filled - box.top, 0, box.height)
  const bottom = clamp(step.bottom - box.top, filled, box.height)

  if (shape.member.kind === "figure") {
    // 筆がこの要素の上を通り過ぎた割合。戻りのあいだは `written` が 0 なので薄くならない。
    const swept = filled + (bottom - filled) * step.written
    shape.member.element.style.opacity =
      box.height === 0 ? "0" : String(clamp(swept / box.height, 0, 1))
    return
  }

  const x = clamp(step.written * box.width, 0, box.width)
  shape.member.element.style.clipPath =
    `polygon(0px 0px, ${px(box.width)} 0px, ${px(box.width)} ${px(filled)}, ` +
    `${px(x)} ${px(filled)}, ${px(x)} ${px(bottom)}, 0px ${px(bottom)})`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function px(value: number): string {
  return `${String(Math.round(value))}px`
}
