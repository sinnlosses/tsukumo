// 入力欄本体の入口。

import type { ReactElement } from "react"

import { useComposer } from "./hooks/use-composer.ts"
import { PresentationalComposer } from "./presentational-composer.tsx"

export function Composer(): ReactElement {
  return <PresentationalComposer {...useComposer()} />
}
