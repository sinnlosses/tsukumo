// オンとオフを切り替えるスイッチを描く部品。中身は Astryx の `Switch`（`role="switch"`）。

import { Switch as AstryxSwitch } from "@astryxdesign/core/Switch"
import type { ReactElement } from "react"

type SwitchProps = {
  readonly label: string
  readonly value: boolean
  readonly disabled: boolean
  readonly onChange: (value: boolean) => void
}

export function Switch(props: SwitchProps): ReactElement {
  return (
    <AstryxSwitch
      label={props.label}
      value={props.value}
      isDisabled={props.disabled}
      onChange={props.onChange}
    />
  )
}
