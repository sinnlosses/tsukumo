// 上へ送って読んでいるあいだの「末尾へ」の口が持つ値。
// 下端から離れた時点の行の件数を覚え、そのあとに増えた件数を「まだ見ていない新しい行」として数える。

/** 下端からこれだけ離れたら、上へ送って読んでいるとみなす（px）。 */
const TAIL_AWAY_THRESHOLD_PX = 120

export type TailReturn =
  | { readonly kind: "none" }
  | { readonly kind: "away"; readonly unseen: number }

export type TailScroll = {
  readonly scrollHeight: number
  readonly scrollTop: number
  readonly clientHeight: number
}

export type TailAnchor =
  | { readonly kind: "at-tail" }
  | { readonly kind: "away"; readonly countWhenLeft: number }

/** 転がりを測ったあとの印。離れた瞬間だけ件数を覚え、離れているあいだは覚えたまま、戻ったら捨てる。 */
export function anchorAfterScroll(
  previous: TailAnchor,
  scroll: TailScroll,
  count: number,
): TailAnchor {
  if (!isAwayFromTail(scroll)) {
    return previous.kind === "at-tail" ? previous : { kind: "at-tail" }
  }
  return previous.kind === "away" ? previous : { kind: "away", countWhenLeft: count }
}

/** `active` でないあいだ（過去のやり取り・レポートを読んでいるあいだ）は出さない。 */
export function tailReturnOf(anchor: TailAnchor, count: number, active: boolean): TailReturn {
  if (!active || anchor.kind === "at-tail") {
    return { kind: "none" }
  }
  return { kind: "away", unseen: Math.max(0, count - anchor.countWhenLeft) }
}

function isAwayFromTail(scroll: TailScroll): boolean {
  return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > TAIL_AWAY_THRESHOLD_PX
}
