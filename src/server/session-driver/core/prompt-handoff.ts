// 依頼を SDK へ渡す手順の順序。
// 入力のストリームへ渡すのを先にし、記録（画像の控えの組み立てを含む）はそのあとに回す。

import type { PromptDelayWatch } from "./prompt-delay.ts"

export type PromptHandoffSteps<Id> = {
  readonly now: () => number
  readonly watch: PromptDelayWatch
  /** 入力のストリームへ渡し、依頼の id を返す。 */
  readonly push: () => Id
  /** 渡したあとに記録のイベントを流す。 */
  readonly record: () => void
}

/** 渡す → 足跡の起点を打つ → 記録の順に走らせ、`push` の戻りを返す。 */
export function handOffPrompt<Id>(steps: PromptHandoffSteps<Id>): Id {
  const startedAt = steps.now()
  const id = steps.push()
  steps.watch.pushed(steps.now(), startedAt)
  steps.record()
  return id
}
