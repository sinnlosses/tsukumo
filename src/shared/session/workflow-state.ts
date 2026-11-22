// セッションの状態（`SessionState`）のうち、ワークフロースクリプトの欄。
// 型とフィールドの doc コメントが契約の置き場。

import type { WorkflowRun } from "./workflow-run.ts"
import type { WorkflowProgress, WorkflowStep } from "./workflow-step.ts"

export type SessionWorkflowFields = {
  /**
   * `backgroundTasks` のうちワークフロースクリプトごとの、いちばん新しく始まった手順（1本につき高々1件）。
   * 源は `workflow-step-started` のうち `agentId` が {@link workflowProgress} の agent にあるものだけで、差し替え方は `withWorkflowStep`。
   * 終わりは `workflow-step-finished`（`finishWorkflowStep`）と、`workflow-progress` で agent が done・error になったとき（`finishStepsOfEndedAgents`）に付き、終わった手順も残る。
   * `background-tasks-changed` で顔ぶれから外れた分を落とし、`session-ended` で空にする。
   */
  readonly workflowSteps: readonly WorkflowStep[]
  /**
   * `backgroundTasks` のうちワークフロースクリプトごとの、段と agent の写し（1本につき高々1件）。
   * 源は `workflow-progress` で、差し替え方は `withWorkflowProgress`。
   * `background-tasks-changed` で顔ぶれから外れた分を落とし、`session-ended` で空にする。
   */
  readonly workflowProgress: readonly WorkflowProgress[]
  /**
   * ワークフロースクリプトごとの図の材料（体ごとの写しと直近の手順）。{@link workflowSteps}・{@link workflowProgress} とは別の置き場で、ピルの一文は読まない。
   * 源は `workflow-progress`（顔ぶれにあるものだけ。`withWorkflowRunProgress`）と `workflow-step-started`・`workflow-step-finished`。
   * `background-tasks-changed` で顔ぶれから外れても捨てずに終わった印（`ended`）を付け、`request` で終わった印のものだけを捨て、`session-ended` で空にする。
   */
  readonly workflowRuns: readonly WorkflowRun[]
}
