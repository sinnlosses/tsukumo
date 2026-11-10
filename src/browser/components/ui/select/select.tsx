// 領域をまたいで使う選択メニュー。中身は Astryx の `Selector`（開く口は `combobox`、選択肢は `option`）。
// 名札は `ariaLabel` を `label` として渡して隠す（見える名札は呼び出し側が別に置く）。
// 置き方は `frameClassName`（箱）、寸法・余白は `className`（開く口）で渡す。

import { Selector } from "@astryxdesign/core/Selector"
import type { ReactElement } from "react"

type SelectOption = {
  readonly value: string
  readonly label: string
}

type SelectProps = {
  readonly id: string
  readonly ariaLabel: string
  /** Astryx の `Selector` の箱（`containerClassName`）に足す class。置き方（列の中での伸び縮み）を渡す。 */
  readonly frameClassName: string
  /** Astryx の `Selector` の開く口（`controlClassName`）に足す class。 */
  readonly className: string
  readonly value: string
  readonly options: readonly SelectOption[]
  readonly disabled: boolean
  /** `disabled` のときに理由を見せる（押せないときの tooltip）。省略すると付けない。 */
  readonly title?: string
  readonly onChange: (value: string) => void
}

export function Select(props: SelectProps): ReactElement {
  return (
    <Selector
      id={props.id}
      label={props.ariaLabel}
      isLabelHidden
      containerClassName={props.frameClassName}
      controlClassName={props.className}
      value={props.value}
      options={[...props.options]}
      isDisabled={props.disabled}
      disabledMessage={props.title}
      onChange={props.onChange}
    />
  )
}
