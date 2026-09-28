// 向きの決まった縦並び。`Stack` に `direction: "column"` を渡すだけの薄い部品。

import type { ReactElement } from "react"

import { Stack, type StackProps } from "../stack/stack.tsx"

export type VStackProps = Omit<StackProps, "direction">

export function VStack(props: VStackProps): ReactElement {
  return <Stack {...props} direction="column" />
}
