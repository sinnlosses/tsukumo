// 「聞く」の問いと答えを、部品の下へ戻すための束。会話ページが組んで渡し、レポートは束を引くだけ。

import { createContext, use } from "react"
import { sum } from "remeda"

import { turnAsides, type MainViewTurn } from "../../../shared/session/main-view-shape.ts"
import {
  type AskThreads,
  askLeafKey,
  drawnLeafKeys,
  groupAsks,
  type LeafAskThread,
} from "./domain/ask-thread.ts"
import { LeafIdentityContext, SectionPointContext } from "./leaf-point-context.ts"

export type { RemainingAside } from "./domain/ask-thread.ts"

/** 束が渡されていない描画は `none`。部品の下には何も増えない。 */
export type AskThreadSlot = { readonly kind: "none" } | ({ readonly kind: "grouped" } & AskThreads)

export const AskThreadContext = createContext<AskThreadSlot>({ kind: "none" })

/**
 * 画面に出しているやり取りの束。`turns` は古い順の全やり取り（別のやり取りの補足も、画面にある部品へ束ねる）。
 * 親のカードの欄に残すのは、画面に出しているやり取りの補足だけ。
 */
export function askThreadSlotOf(
  shown: MainViewTurn,
  turns: readonly MainViewTurn[],
): AskThreadSlot {
  const sources = turns.flatMap((turn) =>
    turnAsides(turn).map((aside) => ({ aside, own: turn.id === shown.id })),
  )
  return { kind: "grouped", ...groupAsks(sources, drawnLeafKeys(shown.steps)) }
}

/** 節の中の内容部品について聞いた数の合計。やり取りの列の節の行に「聞 n」を出す。 */
export function sectionAskCount(
  slot: AskThreadSlot,
  reportToolUseId: string,
  leafIds: readonly string[],
): number {
  if (slot.kind === "none") {
    return 0
  }
  return sum(leafIds.map((id) => slot.byLeaf.get(askLeafKey(reportToolUseId, id))?.count ?? 0))
}

export type LeafAskSlot =
  | { readonly kind: "none" }
  | { readonly kind: "asked"; readonly thread: LeafAskThread }

/** いま描いている内容部品について聞いた束。聞いていなければ `none`。 */
export function useLeafAskThread(): LeafAskSlot {
  const threads = use(AskThreadContext)
  const section = use(SectionPointContext)
  const leaf = use(LeafIdentityContext)
  if (threads.kind === "none" || section.kind === "none" || leaf.kind === "none") {
    return { kind: "none" }
  }
  const thread = threads.byLeaf.get(askLeafKey(section.reportToolUseId, leaf.componentId))
  return thread === undefined ? { kind: "none" } : { kind: "asked", thread }
}
