// `<Turn>` のテストが共有する、ステップ・やり取りの組み立て。

import type {
  MainViewStep,
  MainViewStepBody,
  MainViewTurn,
} from "../../src/shared/session/main-view-shape.ts"

/** やり取りの番号。筆先に添えて配られるので、`<Report>` まで届いていることを見る。 */
export const TURN_ID = 5

/** 本文を持つステップの `body`。先頭行は本文そのもの（1行の本文しか使わないため）。 */
export function text(report: string): MainViewStepBody {
  return {
    kind: "text",
    report: { kind: "markdown", markdown: report },
    firstLine: report,
    task: { kind: "none" },
    finishedPhase: { kind: "none" },
    changeSummary: { kind: "none" },
  }
}

export function step(overrides: Partial<MainViewStep> & { readonly id: number }): MainViewStep {
  return {
    body: { kind: "none" },
    interim: false,
    superseded: false,
    final: false,
    actions: [],
    asides: [],
    ...overrides,
  }
}

export function turn(steps: readonly MainViewStep[]): MainViewTurn {
  return {
    id: TURN_ID,
    request: { text: "架空の依頼", images: [] },
    steps,
    hasInterimReport: false,
    droppedCount: 0,
    failure: { kind: "none" },
  }
}
