// 向きの決まった縦並び。Astryx の `VStack` に、`Stack` と同じ写し方で props を渡す薄い部品。

import { VStack as AstryxVStack } from "@astryxdesign/core/VStack"
import type { ReactElement } from "react"

import { astryxStackProps, type StackProps } from "../stack/stack.tsx"

type VStackProps = Omit<StackProps, "direction">

export function VStack(props: VStackProps): ReactElement {
  return <AstryxVStack {...astryxStackProps(props)}>{props.children}</AstryxVStack>
}
