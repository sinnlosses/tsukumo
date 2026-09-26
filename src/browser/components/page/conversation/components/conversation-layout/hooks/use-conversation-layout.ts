// `<ConversationLayout>` のロジック（docs/design.md 2章「機能の中を分ける」）。3本の仕切りの比率
// （`Split`）を state に持ち、狭い画面のタブの選択と合わせて、見た目
// （`presentational-conversation-layout.tsx`）が読むだけでよい形（CSS カスタムプロパティの `style`
// と、仕切りに渡す呼び先）へ畳む。
//
// **仕切りの位置が state に入るのはドラッグを離した1回だけ。** 動かしている間の位置は
// 過渡的な値で、効くのは CSS カスタムプロパティだけなので、pointermove の間は DOM へ直接書く
// （`onTopLeftChange` などの `on*Change`）。離した瞬間に呼ばれる `on*Commit` だけが state を
// 更新し、`saveSplit` で保存する。

import { useRef, useState, type CSSProperties, type RefObject } from "react"

import { DEFAULT_SPLIT, isDefaultSplit, loadSplit, saveSplit, type Split } from "../domain/split.ts"

/** 狭い画面のとき、上段に出している領域。 */
export type NarrowPane = "main" | "sidebar"

export type UseConversationLayoutResult = {
  readonly narrowPane: NarrowPane
  readonly onNarrowPaneChange: (pane: NarrowPane) => void
  readonly gridRef: RefObject<HTMLDivElement | null>
  readonly rowTopRef: RefObject<HTMLDivElement | null>
  readonly rowBottomRef: RefObject<HTMLDivElement | null>
  /** 上段と下段の高さの比（畳んでいる間は雑談用の比に切り替わる）。 */
  readonly gridStyle: CSSProperties
  /** メインビューとサイドバーの幅の比。 */
  readonly rowTopStyle: CSSProperties
  /** キャラビューと入力欄の幅の比。 */
  readonly rowBottomStyle: CSSProperties
  readonly onTopLeftChange: (percent: number) => void
  readonly onTopLeftCommit: (percent: number) => void
  readonly onRowTopChange: (percent: number) => void
  readonly onRowTopCommit: (percent: number) => void
  readonly onBottomLeftChange: (percent: number) => void
  readonly onBottomLeftCommit: (percent: number) => void
  readonly onReset: () => void
  /** 3本の比率と雑談の上下比が既定と1つでも違うか。「比率を既定に戻す」ピルを出すかの判定に使う。 */
  readonly isSplitChanged: boolean
}

/**
 * `collapseCharacter`（雑談モードでキャラビューを畳んでいるか）は呼び出すたびに渡し直す
 * （`<ConversationLayout>` の props そのままで、state には持たない）。畳んでいる間の上下比は別の項
 * （`collapsedRowTop`）に覚えるので、どちらでドラッグしても相手の比率は動かない。
 */
export function useConversationLayout(collapseCharacter: boolean): UseConversationLayoutResult {
  const [split, setSplit] = useState<Split>(loadSplit)
  const [narrowPane, setNarrowPane] = useState<NarrowPane>("main")
  const gridRef = useRef<HTMLDivElement>(null)
  const rowTopRef = useRef<HTMLDivElement>(null)
  const rowBottomRef = useRef<HTMLDivElement>(null)

  // 仕切りを離したとき・既定に戻すときだけ通る、比率の唯一の更新点。ドラッグ中は state を
  // 触らないので、ここの `split` は最後に確定した比率そのもの。
  function commitSplit(update: (current: Split) => Split): void {
    const next = update(split)
    setSplit(next)
    saveSplit(next)
  }

  // 畳んでいて雑談の比率がまだ無いときは、仕事の比率をそのまま使う
  // （`collapsedRowTop` に既定値は持たせない。split.ts）。
  const rowTopKey = collapseCharacter ? "collapsedRowTop" : "rowTop"
  const rowTopPercent = collapseCharacter ? (split.collapsedRowTop ?? split.rowTop) : split.rowTop

  return {
    narrowPane,
    onNarrowPaneChange: setNarrowPane,
    gridRef,
    rowTopRef,
    rowBottomRef,
    gridStyle: fractionStyle(rowTopKey, rowTopPercent),
    rowTopStyle: fractionStyle("topLeft", split.topLeft),
    rowBottomStyle: fractionStyle("bottomLeft", split.bottomLeft),
    onTopLeftChange: (percent) => {
      writeFraction(rowTopRef.current, "topLeft", percent)
    },
    onTopLeftCommit: (percent) => {
      commitSplit((current) => ({ ...current, topLeft: percent }))
    },
    onRowTopChange: (percent) => {
      writeFraction(gridRef.current, rowTopKey, percent)
    },
    onRowTopCommit: (percent) => {
      commitSplit((current) =>
        collapseCharacter
          ? { ...current, collapsedRowTop: percent }
          : { ...current, rowTop: percent },
      )
    },
    onBottomLeftChange: (percent) => {
      writeFraction(rowBottomRef.current, "bottomLeft", percent)
    },
    onBottomLeftCommit: (percent) => {
      commitSplit((current) => ({ ...current, bottomLeft: percent }))
    },
    onReset: () => {
      commitSplit(() => DEFAULT_SPLIT)
    },
    isSplitChanged: !isDefaultSplit(split),
  }
}

// 仕切り1本が動かす CSS カスタムプロパティの組（手前の領域・奥の領域）。レンダー時の `style` と
// ドラッグ中の直接書き込みが同じ名前を見るように、名前はここにだけ書く。
// CSS 側のフォールバック値（conversation-layout.module.css）は DEFAULT_SPLIT と一致させること。
const SPLIT_VARIABLES = {
  rowTop: ["--layout-row-top", "--layout-row-bottom"],
  // 畳んでいる間の上下比は、同じ仕切りが同じ2つの名前を動かす（覚える先だけが別）。
  collapsedRowTop: ["--layout-row-top", "--layout-row-bottom"],
  topLeft: ["--layout-top-left", "--layout-top-right"],
  bottomLeft: ["--layout-bottom-left", "--layout-bottom-right"],
} satisfies Record<keyof Split, readonly [`--${string}`, `--${string}`]>

// 確定済みの比率を描くときの `style`。CSS カスタムプロパティの index signature は
// `src/browser/css-variable.d.ts` が足している。
function fractionStyle(key: keyof Split, percent: number): CSSProperties {
  const [near, far] = SPLIT_VARIABLES[key]
  return { [near]: `${String(percent)}fr`, [far]: `${String(100 - percent)}fr` }
}

// ドラッグ中の書き込み。**state を更新せず DOM へ直接書く**ので、pointermove のたびに
// `<ConversationLayout>` を描き直さない。離した瞬間に `commitSplit` が同じ値を state へ戻すので、
// 次のレンダーの `style` と食い違わない。
function writeFraction(element: HTMLElement | null, key: keyof Split, percent: number): void {
  if (element === null) {
    return
  }
  const [near, far] = SPLIT_VARIABLES[key]
  element.style.setProperty(near, `${String(percent)}fr`)
  element.style.setProperty(far, `${String(100 - percent)}fr`)
}
