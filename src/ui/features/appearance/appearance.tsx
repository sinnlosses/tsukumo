// 「見た目」の引き出し（docs/design.md 6.1 部品の木の `<Appearance>` / 13.6）。**残っているのは
// 「領域の比率を既定に戻す」だけ** — 画面の色3つ・立ち絵と差し色の差し替え・新しいパックを
// 作る口は、2026-09-17 の決定でキャラクター画面（`features/character-screen/`）へ移した。
// **この引き出し自体を畳んで右下を比率リセットのボタンに戻すのは別のタスク**（13.6
// 「右下は『領域の比率を既定に戻す』だけに戻る」）。
//
// 比率のリセットは `<Layout>` が state を持ったままなので、ここへは実行する関数だけを props
// で受け取る（`docs/design.md` 6.1「部品は SessionState と dispatch だけを見る」と同じ形で、
// ここも DOM を直接いじる配線は持たない）。
//
// **Esc での close・閉じたときにフォーカスを開く口へ戻すのは `<dialog>` のネイティブな
// モーダル挙動に任せる**（新しい依存を足さない）。**Tab の周回だけは自前で留める**
// （`trapTabKey`。実機の Chrome で確かめたところ、この `<dialog>` は最後の要素の次で
// `document.body` へ抜けてしまい、ネイティブの focus trap だけでは足りなかった）。
// 留める先は「開いている間に存在する focusable 要素の最初と最後」だけで、途中の周回は
// ブラウザの既定の Tab 移動に任せる。

import { useRef, type KeyboardEvent, type ReactElement } from "react"

export type AppearanceProps = {
  readonly onResetSplit: () => void
}

export function Appearance(props: AppearanceProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null)

  /** 最初と最後の focusable 要素の境界だけで Tab を折り返す。 */
  function trapTabKey(event: KeyboardEvent<HTMLFormElement>): void {
    if (event.key !== "Tab") {
      return
    }
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])",
    )
    const first = focusable?.[0]
    const last =
      focusable !== undefined && focusable.length > 0 ? focusable[focusable.length - 1] : undefined
    if (first === undefined || last === undefined) {
      return
    }
    const active = document.activeElement
    if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    } else if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    }
  }

  return (
    <>
      <button
        type="button"
        className="appearance-trigger"
        onClick={() => dialogRef.current?.showModal()}
      >
        見た目
      </button>
      <dialog ref={dialogRef} className="appearance-drawer" aria-label="見た目の設定">
        <form method="dialog" className="appearance-drawer-body" onKeyDown={trapTabKey}>
          <h2 className="appearance-drawer-heading">見た目</h2>
          <button type="button" className="appearance-reset-split" onClick={props.onResetSplit}>
            領域の比率を既定に戻す
          </button>
          <button type="submit" className="appearance-close">
            閉じる
          </button>
        </form>
      </dialog>
    </>
  )
}
