// `<Layout>` の器（docs/design.md 2章「機能の中を分ける」）。フックも算出も持たず、受け取った
// 値と呼び先をそのまま置く。ロジック（比率の state・ドラッグの読み替え）は `hooks/use-layout.ts`。
//
// 4領域は `data-region` でも名乗る。class 名は組み立てのたびにハッシュ化される（CSS Modules）
// ので、外から領域を指す口——画面を撮って位置と大きさを測る `scripts/capture-view.ts` や、
// 開発者ツールで測るとき——はこちらを使う。
//
// **枠を持たない領域（`.layout-ground`）は、キャラビューと雑談中のメインビューで同じ class を
// 共有する**（覆いの式を1箇所にしか書かないため。docs/screen-design.md 13.8）。
//
// **狭い画面では上段の2領域をタブで切り替える**（docs/requirements.md 4.7）。どちらを隠すかは
// CSS（`.layout-row-top[data-narrow-pane]` の `@media`）が決めるので、**ここは幅を測らない**
// — 広い画面ではタブ自身が `display: none` で、選んでいる側の値は何にも効かない。

import { type ReactElement, type ReactNode } from "react"

import { type NarrowPane, type UseLayoutResult } from "./hooks/use-layout.ts"
import { LayoutResizer } from "./layout-resizer.tsx"
import styles from "./layout.module.css"

export type PresentationalLayoutProps = UseLayoutResult & {
  readonly main: ReactNode
  readonly sidebar: ReactNode
  readonly character: ReactNode
  readonly dispatch: ReactNode
  /**
   * キャラビューの領域を畳み、下段を入力欄だけにするか。**立ち絵が上段へ移ったときに使う**
   * （雑談モード。docs/screen-design.md 13.7）。**ここは「なぜ畳むか」を知らない** — 領域の数が
   * 変わることだけを受け取る。
   */
  readonly collapseCharacter: boolean
  /**
   * メインの領域を、枠を持つウィジェットではなく**地そのもの**として描くか（枠と角丸を外し、
   * 背景があればそこへ敷く。docs/screen-design.md 13.8）。**ここも「なぜそうするか」を知らない** —
   * キャラビューと同じ立場になることだけを受け取る（立てるのは雑談モードの入口。13.7）。
   */
  readonly mainAsGround: boolean
}

// 狭い画面のタブ。**名前は用語集の語のまま**（docs/glossary.md）。
/**
 * 比率を戻す口の字。**字そのものが見えているピルなので、`aria-label` / `title` は持たない**
 * （見える字がそのままアクセシブルネームになる）。
 */
const RESET_SPLIT_LABEL = "比率を既定に戻す"

const NARROW_PANES = [
  { pane: "main", label: "メインビュー" },
  { pane: "sidebar", label: "サイドバー" },
] satisfies readonly { readonly pane: NarrowPane; readonly label: string }[]

/**
 * **props はここだけ分解して受ける**（他の部品は `props.x` のまま）。ref を持つ入れ物を
 * `props.gridRef` の形で描画中に読むと `react(refs)`（規約「レンダー中に ref を読み書きしない」）
 * が落ちるため（`task-board/presentational-task-board.tsx` と同じ理由）。
 */
export function PresentationalLayout({
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
}: PresentationalLayoutProps): ReactElement {
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
            className={`${styles["layout-tab"]}${
              entry.pane === narrowPane ? ` ${styles["is-active"]}` : ""
            }`}
            onClick={() => {
              onNarrowPaneChange(entry.pane)
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div
        className={`${styles["layout-row"]} ${styles["layout-row-top"]}`}
        ref={rowTopRef}
        data-narrow-pane={narrowPane}
        style={rowTopStyle}
      >
        <section
          className={`${styles["layout-region"]} ${styles["layout-main"]}${
            mainAsGround ? ` ${styles["layout-ground"]}` : ""
          }`}
          data-region="main"
        >
          {main}
        </section>
        <LayoutResizer
          orientation="vertical"
          containerRef={rowTopRef}
          ariaLabel="メインビューとサイドバーの境界"
          onChange={onTopLeftChange}
          onCommit={onTopLeftCommit}
        />
        <section
          className={`${styles["layout-region"]} ${styles["layout-sidebar"]}`}
          data-region="sidebar"
        >
          {sidebar}
        </section>
      </div>
      {/* **畳んでいる間もこの仕切りは出す**（雑談中でも入力欄の高さを変えられる）。
            覚える先は `hooks/use-layout.ts` の中で切り替わるだけで、仕切りそのものは1本。 */}
      <div className={styles["layout-divider"]}>
        <LayoutResizer
          orientation="horizontal"
          containerRef={gridRef}
          ariaLabel="上段と下段の境界"
          onChange={onRowTopChange}
          onCommit={onRowTopCommit}
        />
        {/* 押して消えたあとのフォーカスは動かさない（仕切り `role="separator"` はキー操作を
              持たないので、そこへ移すと押せないものにフォーカスが残る。body へ落ちるのに任せる） */}
        {isSplitChanged && (
          <button type="button" className={styles["layout-reset-split"]} onClick={onReset}>
            <ResetSplitIcon />
            {RESET_SPLIT_LABEL}
          </button>
        )}
      </div>
      <div
        className={`${styles["layout-row"]} ${styles["layout-row-bottom"]}`}
        ref={rowBottomRef}
        data-collapse-character={collapseCharacter}
        style={rowBottomStyle}
      >
        {/* **畳むときは仕切りごと出さない。** 比率は state に残っているので、戻したときに
              使う人が決めた幅がそのまま戻る。 */}
        {!collapseCharacter && (
          <>
            <section
              className={`${styles["layout-region"]} ${styles["layout-ground"]}`}
              data-region="character"
            >
              {character}
            </section>
            <LayoutResizer
              orientation="vertical"
              containerRef={rowBottomRef}
              ariaLabel="キャラビューと入力欄の境界"
              onChange={onBottomLeftChange}
              onCommit={onBottomLeftCommit}
            />
          </>
        )}
        <section
          className={`${styles["layout-region"]} ${styles["layout-dispatch"]}`}
          data-region="dispatch"
        >
          {dispatch}
        </section>
      </div>
    </div>
  )
}

/** 比率を戻す口の絵（回る矢印）。レイアウトの道具の絵なのでコードに置く（原則4 の対象外）。 */
function ResetSplitIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M13 8a5 5 0 1 1-1.5-3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M11.8 1.8v2.9H8.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
