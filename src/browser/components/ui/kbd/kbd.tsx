// キーの押し方を、キーごとの枠で描く部品。中身は Astryx の `Kbd`。

import { Kbd as AstryxKbd } from "@astryxdesign/core/Kbd"
import type { ReactElement } from "react"

export type KbdProps = {
  /** `+` で区切ったキーの並び（例 `mod+k`・`shift+enter`）。 */
  readonly keys: string
}

export function Kbd(props: KbdProps): ReactElement {
  return <AstryxKbd keys={props.keys} />
}
