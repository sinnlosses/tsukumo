// 脇の話の欄の入口。

import type { ReactElement } from "react"

import type { MainViewAside } from "../../../../../../../../shared/session/main-view.ts"
import { useAsideThread } from "./hooks/use-aside-thread.ts"
import { PresentationalAsideThread } from "./presentational-aside-thread.tsx"

export type AsideThreadProps = {
  readonly asides: readonly MainViewAside[]
  /** いちばん新しいやり取りか。それより前のやり取りは閉じているので、欄を畳んで出す。 */
  readonly newest: boolean
}

export function AsideThread(props: AsideThreadProps): ReactElement {
  return <PresentationalAsideThread {...useAsideThread(props.asides, props.newest)} />
}
