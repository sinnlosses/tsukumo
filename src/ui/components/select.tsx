// 領域をまたいで使う `<select>`。サイドバー（モデル・許可モード）と、段4の入力欄が両方
// 要るため `ui/component/` に置く（`ui/` の作法1。docs/design.md 12章 段3）。
//
// **領域固有の見た目・意味は持たない。** 選択肢・値・変更時の呼び先はすべて呼び出し側が渡す。

import { type ReactElement } from "react"

export type SelectOption = {
  readonly value: string
  readonly label: string
}

export type SelectProps = {
  readonly id: string
  readonly ariaLabel: string
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
    <select
      id={props.id}
      aria-label={props.ariaLabel}
      className={props.className}
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
  )
}
