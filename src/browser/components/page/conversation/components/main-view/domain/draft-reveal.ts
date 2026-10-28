// やり取りの中で、書き上げる演出を掛けるステップを選ぶ。

import type { MainViewStep } from "../../../../../../../shared/session/main-view-shape.ts"

export type RevealSource = {
  /** 今回（いちばん新しい）のやり取りか。 */
  readonly newest: boolean
  /** 最終レポートのステップ。無ければ undefined。 */
  readonly finalStep: MainViewStep | undefined
  /** やり取りを出し始めた時点の最終レポートのステップの id。演出の対象から外す。 */
  readonly stepIdAtMount: number | undefined
  /** このやり取りで草稿として描いた `report` の呼び出しの ID。 */
  readonly draftedToolUseIds: ReadonlySet<string>
}

/**
 * 演出を掛けるステップの id。今回のやり取りで、出し始めたあとに現れた最終レポートのステップだけ。
 * 草稿として描いていた `report` の確定版には掛けない（読み終えた本文をもう一度書くことになる）。
 */
export function revealStepIdOf(source: RevealSource): number | undefined {
  const { finalStep } = source
  if (!source.newest || finalStep === undefined || finalStep.id === source.stepIdAtMount) {
    return undefined
  }
  return finalStep.origin.kind === "tool-report" &&
    source.draftedToolUseIds.has(finalStep.origin.toolUseId)
    ? undefined
    : finalStep.id
}
