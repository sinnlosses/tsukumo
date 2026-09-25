// 向きの決まった縦並び。`Stack` に `direction: "column"` を渡すだけの薄い部品で、variant の
// 対応表と CSS は `Stack`（`ui/stack/`）だけが持つ（`docs/design.md` 2章「`components/ui/` の
// 部品（variant の作法と一覧）」の「`VStack` / `HStack`」）。

import { type ReactElement } from "react"

import { Stack, type StackProps } from "../stack/stack.tsx"

export type VStackProps = Omit<StackProps, "direction">

export function VStack(props: VStackProps): ReactElement {
  return <Stack {...props} direction="column" />
}
