// `<AsideThread>` のロジック。やり取りの脇の話を欄に出す行へ畳み、欄を開いておくかを決める。

import { useState, type ToggleEvent } from "react"

import { isExchangeClosed } from "../../../../../../../shared/session/conversation-moment.ts"
import type { RemainingAside } from "../../../../../../features/report/ask-thread-context.ts"
import { useSession } from "../../../../../../stores/session.ts"

type AsideThreadRow = {
  readonly key: string
  readonly text: string
  readonly answer: string
  /** 鍵の部品が画面に無い補足だけが持つ、指した所の字。 */
  readonly pointed?: string
}

export type AsideThreadModel = {
  readonly summary: string
  readonly open: boolean
  readonly rows: readonly AsideThreadRow[]
  readonly onToggle: (event: ToggleEvent<HTMLDetailsElement>) => void
}

/** 選んだ開け閉めと、選んだときにやり取りが閉じていたか。 */
type OpenChoice =
  | { readonly kind: "unset" }
  | { readonly kind: "chosen"; readonly open: boolean; readonly closed: boolean }

const WAITING_ANSWER = "…"

export function useAsideThread(
  asides: readonly RemainingAside[],
  newest: boolean,
): AsideThreadModel {
  const sessionClosed = useSession((session) => isExchangeClosed(session.state))
  // いちばん新しいやり取りより前のやり取りは、次の依頼が始まった時点で閉じている。
  const closed = !newest || sessionClosed
  const [choice, setChoice] = useState<OpenChoice>({ kind: "unset" })
  const open = choice.kind === "chosen" && choice.closed === closed ? choice.open : !closed

  return {
    summary: `補足メッセージ ${String(asides.length)}件`,
    open,
    rows: asides.map(({ aside, pointed }, index) => ({
      key: String(index),
      text: aside.text,
      answer: aside.answer.kind === "answered" ? aside.answer.text : WAITING_ANSWER,
      ...(pointed === undefined ? {} : { pointed }),
    })),
    onToggle: (event) => {
      const toggled = event.currentTarget.open
      if (toggled !== open) {
        setChoice({ kind: "chosen", open: toggled, closed })
      }
    },
  }
}
