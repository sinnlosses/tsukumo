// レポートを「書き上げていくように見せる」演出で、**見せる範囲を要素に書く**（測るのは
// `reveal-measure.ts`、進めるのは `hooks/use-report-reveal.ts`）。**本文の見え方に触るのは
// ここだけ**——隠す・出し切る・途中まで見せるの3つを持つ。
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

import { type BrushStep } from "./reveal-band.ts"
import { type MemberShape } from "./reveal-measure.ts"
import { type RevealBlock } from "./reveal-plan.ts"

/** 何も見せていない状態の `clip-path`（高さ 0 に畳む。場所は取ったまま）。 */
const HIDDEN_CLIP = "inset(0 0 100% 0)"

export function hideBlock(block: RevealBlock): void {
  for (const member of block.members) {
    if (member.kind === "figure") {
      member.element.style.opacity = "0"
    } else {
      member.element.style.clipPath = HIDDEN_CLIP
    }
  }
}

export function showBlock(block: RevealBlock): void {
  for (const member of block.members) {
    member.element.style.removeProperty(member.kind === "figure" ? "opacity" : "clip-path")
  }
}

/** 塊ぜんたいの筆の居場所を、要素1つぶんの見せ方に翻訳する。 */
export function applyStep(shape: MemberShape, step: BrushStep): void {
  const box = shape.box
  const filled = clamp(step.filled - box.top, 0, box.height)
  const bottom = clamp(step.bottom - box.top, filled, box.height)

  if (shape.member.kind === "figure") {
    // 筆がこの要素の上を通り過ぎた割合。戻りのあいだは `swept` が 0 なので薄くならない。
    const swept = filled + (bottom - filled) * step.swept
    shape.member.element.style.opacity =
      box.height === 0 ? "0" : String(clamp(swept / box.height, 0, 1))
    return
  }

  const x = clamp(step.writtenX - box.left, 0, box.width)
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
