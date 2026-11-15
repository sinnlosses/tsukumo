// `<ConversationLayout>` の器。
//
// 広い画面では左（立ち絵と席）・中央（メインビューと、その下端の入力欄）・右（サイドバー）の3列を、器の全面に敷いた背景の上に並べる。
// 4領域は `data-region` でも名乗る。
// class 名は組み立てのたびにハッシュ化される（CSS Modules）ので、外から領域を指す口（画面を撮って位置と大きさを測る `node scripts/capture/capture-view.ts` や、開発者ツール）はこちらを使う。
//
// 旗 `narrowGround` を立てると、狭い画面（760px 以下）で左の列を出さず背景の絵を敷く（`data-narrow-ground`）。
//
// 狭い画面では縦の1列に積み、サイドバーと仕切りを出さない。
// 何を隠すかは CSS の `@media` が決めるので、ここは幅を測らない。
// 中くらいのビューポート幅ではサイドバーを柱に畳む。柱を出すか・サイドバーを重ねるかも CSS が決め、ここは開閉の印（`data-sidebar-open`）を立てるだけ。

import clsx from "clsx"
import { PanelRightClose, PanelRightOpen, RotateCw } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { LayoutResizer } from "../../../../ui/layout-resizer/layout-resizer.tsx"
import styles from "./conversation-layout.module.css"
import { leftPxFromRatio, sidebarPercentFromRatio } from "./domain/split.ts"
import type { UseConversationLayoutResult } from "./hooks/use-conversation-layout.ts"

type PresentationalConversationLayoutProps = UseConversationLayoutResult & {
  readonly main: ReactNode
  readonly sidebar: ReactNode
  readonly character: ReactNode
  readonly dispatch: ReactNode
  /** 左の列の上（立ち絵の上）に載せる、やり取りの列。 */
  readonly outline: ReactNode
  /** 狭い画面で顔と吹き出しと入力欄のあいだに固定する、答え待ちのカード。 */
  readonly inquiry: ReactNode
  readonly rail: {
    /** 中くらいのビューポート幅の柱の、開くボタンの中に置くもの。 */
    readonly badge: ReactNode
  }
  /** 狭い画面（760px 以下）で、左の列を出さず、背景の絵を敷くか（雑談モード）。 */
  readonly narrowGround: boolean
}

/**
 * 比率を戻す口の字。字そのものが見えているピルなので、`aria-label` / `title` は持たない。
 */
const RESET_SPLIT_LABEL = "比率を既定に戻す"

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.splitters.gridRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 */
export function PresentationalConversationLayout({
  splitters: { gridRef, gridStyle, left, sidebar: sidebarSplitter, onReset, moved },
  sidebarDisclosure: {
    rootRef: sideRef,
    id: sidebarId,
    open: sidebarOpen,
    onToggle: onToggleSidebar,
    toggleRef: sidebarToggleRef,
  },
  main,
  sidebar,
  character,
  outline,
  dispatch,
  inquiry,
  rail: { badge: railBadge },
  narrowGround,
}: PresentationalConversationLayoutProps): ReactElement {
  // 押して消えたあとのフォーカスは動かさず、body へ落ちるのに任せる。
  // 仕切り `role="separator"` はキー操作を持たないので、そこへ移すと押せないものにフォーカスが残る。
  const resetButton = (
    <Button
      variant="tinted-accent"
      size="action"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "none" }}
      className={styles["layout-reset-split"]}
      onClick={onReset}
    >
      <RotateCw size={14} />
      {RESET_SPLIT_LABEL}
    </Button>
  )
  return (
    <div
      className={clsx(styles["layout-grid"], styles["layout-ground"])}
      ref={gridRef}
      data-narrow-ground={narrowGround}
      data-sidebar-open={sidebarOpen}
      style={gridStyle}
    >
      <section
        className={clsx(styles["layout-region"], styles["layout-bare"], styles["layout-left"])}
        data-region="character"
        aria-label="キャラクター"
      >
        <div className={styles["layout-outline"]}>{outline}</div>
        {character}
      </section>
      <div className={styles["layout-divider"]}>
        <LayoutResizer
          orientation="vertical"
          containerRef={gridRef}
          ariaLabel="キャラビューとメインビューの境界"
          toValue={leftPxFromRatio}
          onChange={left.onChange}
          onCommit={left.onCommit}
          className=""
        />
        {moved === "left" && resetButton}
      </div>
      <div className={styles["layout-center"]}>
        <main
          className={clsx(styles["layout-region"], styles["layout-main"])}
          data-region="main"
          aria-label="メインビュー"
        >
          {main}
        </main>
        <div className={styles["layout-inquiry"]}>{inquiry}</div>
        <section
          className={clsx(styles["layout-region"], styles["layout-dispatch"])}
          data-region="dispatch"
          aria-label="入力欄"
        >
          {dispatch}
        </section>
      </div>
      <div className={clsx(styles["layout-divider"], styles["layout-divider-sidebar"])}>
        <LayoutResizer
          orientation="vertical"
          containerRef={gridRef}
          ariaLabel="メインビューとサイドバーの境界"
          toValue={sidebarPercentFromRatio}
          onChange={sidebarSplitter.onChange}
          onCommit={sidebarSplitter.onCommit}
          className=""
        />
        {moved === "sidebar" && resetButton}
      </div>
      <div className={styles["layout-side"]} ref={sideRef}>
        <aside
          id={sidebarId}
          className={clsx(styles["layout-region"], styles["layout-sidebar"])}
          data-region="sidebar"
          aria-label="サイドバー"
        >
          {sidebar}
        </aside>
        <div className={styles["layout-rail"]}>
          <Button
            variant="ghost"
            size="label"
            pressed="none"
            disabled={false}
            ariaLabel="サイドバー"
            disclosure={{
              kind: "popover",
              popup: "none",
              ref: sidebarToggleRef,
              expanded: sidebarOpen,
              controls: sidebarId,
            }}
            title={sidebarOpen ? "サイドバーを閉じる" : "サイドバーを開く"}
            className={styles["layout-rail-toggle"]}
            onClick={onToggleSidebar}
          >
            {railBadge}
            {sidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </Button>
        </div>
      </div>
    </div>
  )
}
