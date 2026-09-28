// 向きの決まった横並び。`Stack` に `direction: "row"` を渡すだけの薄い部品。

import type { ReactElement } from "react"

import { Stack, type StackProps } from "../stack/stack.tsx"

export type HStackProps = Omit<StackProps, "direction">

export function HStack(props: HStackProps): ReactElement {
  return <Stack {...props} direction="row" />
}
