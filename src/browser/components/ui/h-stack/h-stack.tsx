// 向きの決まった横並び。`Stack` に `direction: "row"` を渡すだけの薄い部品で、variant の
// 対応表と CSS は `Stack`（`ui/stack/`）だけが持つ（`docs/design.md` 2章「`components/ui/` の
// 部品（variant の作法と一覧）」の「`VStack` / `HStack`」）。

import { type ReactElement } from "react"

import { Stack, type StackProps } from "../stack/stack.tsx"

export type HStackProps = Omit<StackProps, "direction">

export function HStack(props: HStackProps): ReactElement {
  return <Stack {...props} direction="row" />
}
