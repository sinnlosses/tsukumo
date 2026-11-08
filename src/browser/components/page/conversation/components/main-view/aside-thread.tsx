// 補足メッセージの欄の入口。

import type { ReactElement } from "react"

import type { RemainingAside } from "../../../../../features/report/ask-thread-context.ts"
import { useAsideThread } from "./hooks/use-aside-thread.ts"
import { PresentationalAsideThread } from "./presentational-aside-thread.tsx"

type AsideThreadProps = {
  readonly asides: readonly RemainingAside[]
  /** いちばん新しいやり取りか。それより前のやり取りは閉じているので、欄を畳んで出す。 */
  readonly newest: boolean
}

export function AsideThread(props: AsideThreadProps): ReactElement {
  return <PresentationalAsideThread {...useAsideThread(props.asides, props.newest)} />
}
