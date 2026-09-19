// レイアウト全体（`<Layout>`。docs/design.md 6.1）。4領域（メイン・サイドバー・キャラビュー・
// 入力欄）を grid に並べ、3本の仕切りをドラッグで動かせるようにする。**既定の比率に戻す実行も
// UI（右下の常設ボタン）もここに持つ**（docs/design.md 13.6）。
//
// もとは静的な HTML の組み立てとブラウザ側の配線に分かれていた処理だった（移行の段6で
// React の部品にし、段3〜5の複数の root を1つにまとめた。docs/design.md 12章）。
//
// **領域の中身（`<MainView>` / `<Sidebar>` / `<CharacterView>` / `<Dispatch>`）は props で
// 受け取る。** ここから他の `features/` を import しない（`test/architecture.test.ts`
// 「ui/ の機能どうしの import」）。組み立てるのは入口の `src/ui/main.tsx`。

import { useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react"

import { LayoutResizer } from "./layout-resizer.tsx"
import { DEFAULT_SPLIT, loadSplit, saveSplit, type Split } from "./split.ts"

export type LayoutProps = {
  readonly main: ReactNode
  readonly sidebar: ReactNode
  readonly character: ReactNode
  readonly dispatch: ReactNode
}

export function Layout(props: LayoutProps): ReactElement {
  const [split, setSplit] = useState<Split>(loadSplit)
  const gridRef = useRef<HTMLDivElement>(null)
  const rowTopRef = useRef<HTMLDivElement>(null)
  const rowBottomRef = useRef<HTMLDivElement>(null)

  function reset(): void {
    setSplit(DEFAULT_SPLIT)
    saveSplit(DEFAULT_SPLIT)
  }

  // CSS カスタムプロパティの index signature は `src/ui/css-variable.d.ts` が足している。
  const gridStyle: CSSProperties = {
    "--layout-row-top": `${String(split.rowTop)}fr`,
    "--layout-row-bottom": `${String(100 - split.rowTop)}fr`,
  }
  const rowTopStyle: CSSProperties = {
    "--layout-top-left": `${String(split.topLeft)}fr`,
    "--layout-top-right": `${String(100 - split.topLeft)}fr`,
  }
  const rowBottomStyle: CSSProperties = {
    "--layout-bottom-left": `${String(split.bottomLeft)}fr`,
    "--layout-bottom-right": `${String(100 - split.bottomLeft)}fr`,
  }

  // ドラッグの終わり（onCommit）は、**動かした仕切りの位置だけ**を受け取った値で差し替えて
  // 保存する。ここの `split` は pointerdown の時点のもので、動かした仕切りの値だけが古い
  // （他の2本は同時に動かせないので、そのまま使える）。
  return (
    <>
      <div className="layout-grid" ref={gridRef} style={gridStyle}>
        <div className="layout-row layout-row-top" ref={rowTopRef} style={rowTopStyle}>
          <section className="layout-region layout-main">{props.main}</section>
          <LayoutResizer
            orientation="vertical"
            containerRef={rowTopRef}
            ariaLabel="メインビューとサイドバーの境界"
            onChange={(percent) => {
              setSplit((current) => ({ ...current, topLeft: percent }))
            }}
            onCommit={(percent) => {
              saveSplit({ ...split, topLeft: percent })
            }}
          />
          <section className="layout-region layout-sidebar">{props.sidebar}</section>
        </div>
        <LayoutResizer
          orientation="horizontal"
          containerRef={gridRef}
          ariaLabel="上段と下段の境界"
          onChange={(percent) => {
            setSplit((current) => ({ ...current, rowTop: percent }))
          }}
          onCommit={(percent) => {
            saveSplit({ ...split, rowTop: percent })
          }}
        />
        <div className="layout-row layout-row-bottom" ref={rowBottomRef} style={rowBottomStyle}>
          <section className="layout-region layout-character">{props.character}</section>
          <LayoutResizer
            orientation="vertical"
            containerRef={rowBottomRef}
            ariaLabel="キャラビューと入力欄の境界"
            onChange={(percent) => {
              setSplit((current) => ({ ...current, bottomLeft: percent }))
            }}
            onCommit={(percent) => {
              saveSplit({ ...split, bottomLeft: percent })
            }}
          />
          <section className="layout-region layout-dispatch">{props.dispatch}</section>
        </div>
      </div>
      <button type="button" className="layout-reset-split" onClick={reset}>
        領域の比率を既定に戻す
      </button>
    </>
  )
}
