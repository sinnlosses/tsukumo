// 「見た目」の引き出し（docs/design.md 6.1 部品の木の `<Appearance>` / 13.6）。地・領域・字の色
// （`ground` / `surface` / `ink`）・立ち絵を動かすか固定するか・領域の比率を既定に戻す、を
// ここにまとめる。**キャラクターの立ち絵と差し色の差し替え（`<CharacterEdit>`）もここに入る**
// （7.1。引き出しの中なので常設の要素は増えない）。**常設なのは開く口のボタン1つだけ**（
// 13.6「常設の要素は差し引きゼロ」）。
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

import { useRef, useState, type KeyboardEvent, type ReactElement } from "react"

import { loadPortraitFixed, savePortraitFixed } from "../../lib/portrait-fixed.ts"
import {
  applyAppearanceColorOverride,
  changeAppearanceColor,
  loadAppearanceColorOverride,
  readCurrentColor,
  saveAppearanceColorOverride,
  type AppearanceColorKey,
  type AppearanceColorOverride,
} from "./appearance-color.ts"
import { CharacterEdit } from "./character-edit.tsx"

export type AppearanceProps = {
  readonly onResetSplit: () => void
}

const COLOR_FIELDS: ReadonlyArray<{ readonly key: AppearanceColorKey; readonly label: string }> = [
  { key: "ground", label: "画面の地" },
  { key: "surface", label: "領域の地" },
  { key: "ink", label: "字の色" },
]

export function Appearance(props: AppearanceProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // 保存済みの上書きは、マウント時に一度だけ documentElement へ反映する
  // （リロード後も色が残っている、という要件はこの1回で満たす）。
  const [override, setOverride] = useState<AppearanceColorOverride>(() => {
    const loaded = loadAppearanceColorOverride()
    applyAppearanceColorOverride(loaded)
    return loaded
  })
  const [portraitFixed, setPortraitFixed] = useState<boolean>(loadPortraitFixed)

  function handleColorChange(key: AppearanceColorKey, value: string): void {
    const next = changeAppearanceColor(override, key, value)
    applyAppearanceColorOverride(next)
    saveAppearanceColorOverride(next)
    setOverride(next)
  }

  function handlePortraitFixedChange(value: boolean): void {
    savePortraitFixed(value)
    setPortraitFixed(value)
  }

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
          <fieldset className="appearance-fieldset">
            <legend>色</legend>
            {COLOR_FIELDS.map((field) => {
              const inputId = `appearance-color-${field.key}`
              return (
                <div className="appearance-field" key={field.key}>
                  <label htmlFor={inputId}>{field.label}</label>
                  <input
                    id={inputId}
                    type="color"
                    value={readCurrentColor(field.key)}
                    onChange={(event) => handleColorChange(field.key, event.target.value)}
                  />
                </div>
              )
            })}
          </fieldset>
          <CharacterEdit />
          <div className="appearance-field appearance-field-checkbox">
            <label>
              <input
                type="checkbox"
                checked={portraitFixed}
                onChange={(event) => handlePortraitFixedChange(event.target.checked)}
              />
              立ち絵の位置を固定する
            </label>
          </div>
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
