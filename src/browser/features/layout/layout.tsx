// レイアウト全体（`<Layout>`。docs/design.md 6.1）。4領域（メイン・サイドバー・キャラビュー・
// 入力欄）を grid に並べ、3本の仕切りをドラッグで動かせるようにする。**既定の比率に戻す実行も
// UI（右下の常設ボタン）もここに持つ**（docs/design.md 13.6）。
//
// もとは静的な HTML の組み立てとブラウザ側の配線に分かれていた処理だった（移行の段6で
// React の部品にし、段3〜5の複数の root を1つにまとめた。docs/design.md 12章）。
//
// **領域の中身（`<MainView>` / `<Sidebar>` / `<CharacterView>` / `<Dispatch>`）は props で
// 受け取る。** ここから他の `features/` を import しない（`test/architecture.test.ts`
// 「browser/ の機能どうしの import」）。組み立てるのは入口の `src/browser/main.tsx`。
//
// **4領域は `data-region` でも名乗る。** class 名は組み立てのたびにハッシュ化される
// （CSS Modules）ので、外から領域を指す口——画面を撮って位置と大きさを測る
// `scripts/capture-view.ts` や、開発者ツールで測るとき——はこちらを使う。
//
// **仕切りの位置が state に入るのはドラッグを離した1回だけ。** 動かしている間の位置は
// 過渡的な値で、効くのは CSS カスタムプロパティだけなので、pointermove の間は DOM へ直接書く
// （`writeFraction`）。
//
// **狭い画面では上段の2領域をタブで切り替える**（docs/requirements.md 4.7）。どちらを隠すかは
// CSS（`.layout-row-top[data-narrow-pane]` の `@media`）が決めるので、**ここは幅を測らない**
// — 広い画面ではタブ自身が `display: none` で、選んでいる側の値は何にも効かない。

import { useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react"

import { LayoutResizer } from "./layout-resizer.tsx"
import styles from "./layout.module.css"
import { DEFAULT_SPLIT, loadSplit, saveSplit, type Split } from "./split.ts"

export type LayoutProps = {
  readonly main: ReactNode
  readonly sidebar: ReactNode
  readonly character: ReactNode
  readonly dispatch: ReactNode
  /**
   * キャラビューの領域を畳み、下段を入力欄だけにするか。**立ち絵が上段へ移ったときに使う**
   * （雑談モード。docs/design.md 13.7）。**ここは「なぜ畳むか」を知らない** — 領域の数が
   * 変わることだけを受け取る。
   */
  readonly collapseCharacter: boolean
}

/** 狭い画面のとき、上段に出している領域。 */
type NarrowPane = "main" | "sidebar"

// 狭い画面のタブ。**名前は用語集の語のまま**（docs/glossary.md）。
const NARROW_PANES = [
  { pane: "main", label: "メインビュー" },
  { pane: "sidebar", label: "サイドバー" },
] satisfies readonly { readonly pane: NarrowPane; readonly label: string }[]

// 仕切り1本が動かす CSS カスタムプロパティの組（手前の領域・奥の領域）。レンダー時の `style` と
// ドラッグ中の直接書き込みが同じ名前を見るように、名前はここにだけ書く。
// CSS 側のフォールバック値（layout.module.css）は DEFAULT_SPLIT と一致させること。
const SPLIT_VARIABLES = {
  rowTop: ["--layout-row-top", "--layout-row-bottom"],
  // 畳んでいる間の上下比は、同じ仕切りが同じ2つの名前を動かす（覚える先だけが別）。
  collapsedRowTop: ["--layout-row-top", "--layout-row-bottom"],
  topLeft: ["--layout-top-left", "--layout-top-right"],
  bottomLeft: ["--layout-bottom-left", "--layout-bottom-right"],
} satisfies Record<keyof Split, readonly [`--${string}`, `--${string}`]>

export function Layout(props: LayoutProps): ReactElement {
  const [split, setSplit] = useState<Split>(loadSplit)
  const [narrowPane, setNarrowPane] = useState<NarrowPane>("main")
  const gridRef = useRef<HTMLDivElement>(null)
  const rowTopRef = useRef<HTMLDivElement>(null)
  const rowBottomRef = useRef<HTMLDivElement>(null)

  // 仕切りを離したとき・既定に戻すときだけ通る、比率の唯一の更新点。ドラッグ中は state を
  // 触らないので、ここの `split` は最後に確定した比率そのもの（`<LayoutResizer>` は常に
  // 最新のハンドラを呼ぶ）。
  function commitSplit(update: (current: Split) => Split): void {
    const next = update(split)
    setSplit(next)
    saveSplit(next)
  }

  function reset(): void {
    commitSplit(() => DEFAULT_SPLIT)
  }

  // 上下の仕切りが動かす項。**畳んでいる間（雑談モード）は別の項に覚える**ので、どちらの
  // モードでドラッグしても相手の比率は動かない。畳んでいて雑談の比率がまだ無いときは、
  // 仕事の比率をそのまま使う（`collapsedRowTop` に既定値は持たせない。split.ts）。
  const rowTopKey = props.collapseCharacter ? "collapsedRowTop" : "rowTop"
  const rowTopPercent = props.collapseCharacter
    ? (split.collapsedRowTop ?? split.rowTop)
    : split.rowTop

  function commitRowTop(percent: number): void {
    commitSplit((current) =>
      props.collapseCharacter
        ? { ...current, collapsedRowTop: percent }
        : { ...current, rowTop: percent },
    )
  }

  return (
    <>
      <div
        className={styles["layout-grid"]}
        ref={gridRef}
        data-collapse-character={props.collapseCharacter}
        style={fractionStyle(rowTopKey, rowTopPercent)}
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
                setNarrowPane(entry.pane)
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
          style={fractionStyle("topLeft", split.topLeft)}
        >
          <section
            className={`${styles["layout-region"]} ${styles["layout-main"]}`}
            data-region="main"
          >
            {props.main}
          </section>
          <LayoutResizer
            orientation="vertical"
            containerRef={rowTopRef}
            ariaLabel="メインビューとサイドバーの境界"
            onChange={(percent) => {
              writeFraction(rowTopRef.current, "topLeft", percent)
            }}
            onCommit={(percent) => {
              commitSplit((current) => ({ ...current, topLeft: percent }))
            }}
          />
          <section
            className={`${styles["layout-region"]} ${styles["layout-sidebar"]}`}
            data-region="sidebar"
          >
            {props.sidebar}
          </section>
        </div>
        {/* **畳んでいる間もこの仕切りは出す**（雑談中でも入力欄の高さを変えられる）。
            覚える先が `rowTopKey` で切り替わるだけで、仕切りそのものは1本。 */}
        <LayoutResizer
          orientation="horizontal"
          containerRef={gridRef}
          ariaLabel="上段と下段の境界"
          onChange={(percent) => {
            writeFraction(gridRef.current, rowTopKey, percent)
          }}
          onCommit={commitRowTop}
        />
        <div
          className={`${styles["layout-row"]} ${styles["layout-row-bottom"]}`}
          ref={rowBottomRef}
          data-collapse-character={props.collapseCharacter}
          style={fractionStyle("bottomLeft", split.bottomLeft)}
        >
          {/* **畳むときは仕切りごと出さない。** 比率（`split.bottomLeft`）は state に残って
              いるので、戻したときに使う人が決めた幅がそのまま戻る。 */}
          {!props.collapseCharacter && (
            <>
              <section
                className={`${styles["layout-region"]} ${styles["layout-character"]}`}
                data-region="character"
              >
                {props.character}
              </section>
              <LayoutResizer
                orientation="vertical"
                containerRef={rowBottomRef}
                ariaLabel="キャラビューと入力欄の境界"
                onChange={(percent) => {
                  writeFraction(rowBottomRef.current, "bottomLeft", percent)
                }}
                onCommit={(percent) => {
                  commitSplit((current) => ({ ...current, bottomLeft: percent }))
                }}
              />
            </>
          )}
          <section
            className={`${styles["layout-region"]} ${styles["layout-dispatch"]}`}
            data-region="dispatch"
          >
            {props.dispatch}
          </section>
        </div>
      </div>
      <button type="button" className={styles["layout-reset-split"]} onClick={reset}>
        領域の比率を既定に戻す
      </button>
    </>
  )
}

// 確定済みの比率を描くときの `style`。CSS カスタムプロパティの index signature は
// `src/browser/css-variable.d.ts` が足している。
function fractionStyle(key: keyof Split, percent: number): CSSProperties {
  const [near, far] = SPLIT_VARIABLES[key]
  return { [near]: `${String(percent)}fr`, [far]: `${String(100 - percent)}fr` }
}

// ドラッグ中の書き込み。**state を更新せず DOM へ直接書く**ので、pointermove のたびに
// `<Layout>` を描き直さない。離した瞬間に `commitSplit` が同じ値を state へ戻すので、
// 次のレンダーの `style` と食い違わない。
function writeFraction(element: HTMLElement | null, key: keyof Split, percent: number): void {
  if (element === null) {
    return
  }
  const [near, far] = SPLIT_VARIABLES[key]
  element.style.setProperty(near, `${String(percent)}fr`)
  element.style.setProperty(far, `${String(100 - percent)}fr`)
}
