// `<ConversationLayout>` の器。
//
// 4領域は `data-region` でも名乗る。
// class 名は組み立てのたびにハッシュ化される（CSS Modules）ので、外から領域を指す口（画面を撮って位置と大きさを測る `node scripts/capture-view.ts` や、開発者ツール）はこちらを使う。
//
// 枠を持たない領域（`.layout-ground`）は、キャラビューと雑談中のメインビューで同じ class を共有する（覆いの式を1箇所にしか書かないため）。
//
// 狭い画面では上段の2領域をタブで切り替える。
// どちらを隠すかは CSS（`.layout-row-top[data-narrow-pane]` の `@media`）が決めるので、ここは幅を測らない。

import clsx from "clsx"
import { RotateCw } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { LayoutResizer } from "../layout-resizer/layout-resizer.tsx"
import styles from "./conversation-layout.module.css"
import { percentFromRatio } from "./domain/split.ts"
import type { NarrowPane, UseConversationLayoutResult } from "./hooks/use-conversation-layout.ts"

export type PresentationalConversationLayoutProps = UseConversationLayoutResult & {
  readonly main: ReactNode
  readonly sidebar: ReactNode
  readonly character: ReactNode
  readonly dispatch: ReactNode
  /** キャラビューの領域を畳み、下段を入力欄だけにするか。立ち絵が上段へ移ったとき（雑談モード）に使う。 */
  readonly collapseCharacter: boolean
  /** メインの領域を、枠を持つウィジェットではなく地そのものとして描くか（枠と角丸を外し、背景があればそこへ敷く）。 */
  readonly mainAsGround: boolean
}

/**
 * 比率を戻す口の字。字そのものが見えているピルなので、`aria-label` / `title` は持たない。
 */
const RESET_SPLIT_LABEL = "比率を既定に戻す"

const NARROW_PANES = [
  { pane: "main", label: "メインビュー" },
  { pane: "sidebar", label: "サイドバー" },
] satisfies readonly { readonly pane: NarrowPane; readonly label: string }[]

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.gridRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 */
export function PresentationalConversationLayout({
  gridRef,
  rowTopRef,
  rowBottomRef,
  gridStyle,
  rowTopStyle,
  rowBottomStyle,
  narrowPane,
  onNarrowPaneChange,
  onTopLeftChange,
  onTopLeftCommit,
  onRowTopChange,
  onRowTopCommit,
  onBottomLeftChange,
  onBottomLeftCommit,
  onReset,
  isSplitChanged,
  main,
  sidebar,
  character,
  dispatch,
  collapseCharacter,
  mainAsGround,
}: PresentationalConversationLayoutProps): ReactElement {
  return (
    <div
      className={styles["layout-grid"]}
      ref={gridRef}
      data-collapse-character={collapseCharacter}
      style={gridStyle}
    >
      <div className={styles["layout-tabs"]} role="tablist">
        {NARROW_PANES.map((entry) => (
          <button
            type="button"
            key={entry.pane}
            role="tab"
            aria-selected={entry.pane === narrowPane}
            className={clsx(styles["layout-tab"], entry.pane === narrowPane && styles["is-active"])}
            onClick={() => {
              onNarrowPaneChange(entry.pane)
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div
        className={clsx(styles["layout-row"], styles["layout-row-top"])}
        ref={rowTopRef}
        data-narrow-pane={narrowPane}
        style={rowTopStyle}
      >
        <section
          className={clsx(
            styles["layout-region"],
            styles["layout-main"],
            mainAsGround && styles["layout-ground"],
          )}
          data-region="main"
        >
          {main}
        </section>
        <LayoutResizer
          orientation="vertical"
          containerRef={rowTopRef}
          ariaLabel="メインビューとサイドバーの境界"
          toValue={percentFromRatio}
          onChange={onTopLeftChange}
          onCommit={onTopLeftCommit}
        />
        <section
          className={clsx(styles["layout-region"], styles["layout-sidebar"])}
          data-region="sidebar"
        >
          {sidebar}
        </section>
      </div>
      {/* 畳んでいる間もこの仕切りは出す（雑談中でも入力欄の高さを変えられる）。
            覚える先は `useConversationLayout` の中で切り替わるだけで、仕切りそのものは1本。 */}
      <div className={styles["layout-divider"]}>
        <LayoutResizer
          orientation="horizontal"
          containerRef={gridRef}
          ariaLabel="上段と下段の境界"
          toValue={percentFromRatio}
          onChange={onRowTopChange}
          onCommit={onRowTopCommit}
        />
        {/* 押して消えたあとのフォーカスは動かさず、body へ落ちるのに任せる。
              仕切り `role="separator"` はキー操作を持たないので、そこへ移すと押せないものにフォーカスが残る。 */}
        {isSplitChanged && (
          <Button
            variant="tinted-accent"
            size="action"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["layout-reset-split"]}
            onClick={onReset}
          >
            <RotateCw size={14} />
            {RESET_SPLIT_LABEL}
          </Button>
        )}
      </div>
      <div
        className={clsx(styles["layout-row"], styles["layout-row-bottom"])}
        ref={rowBottomRef}
        data-collapse-character={collapseCharacter}
        style={rowBottomStyle}
      >
        {/* 畳むときは仕切りごと出さない。
              比率は state に残っているので、戻したときに使う人が決めた幅がそのまま戻る。 */}
        {!collapseCharacter && (
          <>
            <section
              className={clsx(styles["layout-region"], styles["layout-ground"])}
              data-region="character"
            >
              {character}
            </section>
            <LayoutResizer
              orientation="vertical"
              containerRef={rowBottomRef}
              ariaLabel="キャラビューと入力欄の境界"
              toValue={percentFromRatio}
              onChange={onBottomLeftChange}
              onCommit={onBottomLeftCommit}
            />
          </>
        )}
        <section
          className={clsx(styles["layout-region"], styles["layout-dispatch"])}
          data-region="dispatch"
        >
          {dispatch}
        </section>
      </div>
    </div>
  )
}
