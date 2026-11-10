// 向きの決まった横並び。Astryx の `HStack` に、`Stack` と同じ写し方で props を渡す薄い部品。

import { HStack as AstryxHStack } from "@astryxdesign/core/HStack"
import type { ReactElement } from "react"

import { astryxStackProps, type StackProps } from "../stack/stack.tsx"

type HStackProps = Omit<StackProps, "direction">

export function HStack(props: HStackProps): ReactElement {
  return <AstryxHStack {...astryxStackProps(props)}>{props.children}</AstryxHStack>
}
