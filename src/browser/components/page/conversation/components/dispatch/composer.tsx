// 入力欄本体の入口。

import type { ReactElement } from "react"

import { useComposer } from "./hooks/use-composer.ts"
import { PresentationalComposer } from "./presentational-composer.tsx"
import type { DispatchProgress } from "./turn-status.tsx"

export function Composer(props: { readonly progress: DispatchProgress }): ReactElement {
  return <PresentationalComposer {...useComposer()} progress={props.progress} />
}
