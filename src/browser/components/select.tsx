// 領域をまたいで使う `<select>`。サイドバー（モデル・許可モード）と、段4の入力欄が両方
// 要るため `browser/component/` に置く（`browser/` の作法1。移行の段3。段の記録は
// `docs/history/decision.md`「design.md 12. 移行の段階」）。
//
// **持つ見た目は、どのプルダウンでも同じになる分だけ**（下向きの矢印と、ブラウザ既定の矢印を
// 消すこと。`select.module.css`）。寸法・枠・地・字の段と、選択肢・値・変更時の呼び先は
// すべて呼び出し側が渡す。

import { type ReactElement } from "react"

import styles from "./select.module.css"

export type SelectOption = {
  readonly value: string
  readonly label: string
}

export type SelectProps = {
  readonly id: string
  readonly ariaLabel: string
  /**
   * 矢印を重ねる枠に足す class。**置き方（列の中での伸び縮み）と字の色だけ**を渡す
   * （矢印は `currentColor` で描くので、色はここから継ぐ）。
   */
  readonly frameClassName: string
  /** `<select>` 自身に足す class。**右の余白は矢印ぶん空ける**（空けないと字が矢印の下へ潜る）。 */
  readonly className: string
  readonly value: string
  readonly options: readonly SelectOption[]
  readonly disabled: boolean
  /** `disabled` のときに理由を見せる（呼び出し側が渡さないときは `undefined`）。常設の枠は増やさず、ブラウザ既定のツールチップに任せる。 */
  readonly title: string | undefined
  readonly onChange: (value: string) => void
}

export function Select(props: SelectProps): ReactElement {
  return (
    <span className={`${styles["select-frame"] ?? ""} ${props.frameClassName}`}>
      <select
        id={props.id}
        aria-label={props.ariaLabel}
        className={`${styles["select-field"] ?? ""} ${props.className}`}
        value={props.value}
        disabled={props.disabled}
        title={props.title}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  )
}
