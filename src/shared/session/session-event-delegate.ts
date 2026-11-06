// セッションの出来事（`SessionEvent`）のうち、ワークプラン・委譲先・ツール・バックグラウンドタスクに関するものの型。

import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { TaskId } from "../session-driver/task-id.ts"
import type { DelegateReturn } from "./delegate-return.ts"
import type { ToolUseId } from "./tool-use-id.ts"
import type { WorkPlan } from "./work-plan.ts"
import type { WorkflowProgress } from "./workflow-step.ts"

export type DelegateEvent =
  /**
   * `work_plan` ツールの呼び出し（ワークプラン）。メインが呼んだもので、`parseWorkPlan` を通ったものだけが届く（サブエージェントの呼び出しは変換で捨てる）。
   * 毎回、段の並びごと届く。欄の意味は `WorkPlan`。
   */
  | ({ readonly kind: "work-plan" } & WorkPlan)
  /**
   * メインが呼んだ `work_plan` の呼び出し。サーバの中だけで流れる。
   * `CallReview.pass` が同じ `toolUseId` の `tool-finished` まで預かり、差し戻されていなければ `work-plan` に変えて流す（畳み込み・ブラウザには届かない）。
   */
  | {
      readonly kind: "work-plan-called"
      readonly toolUseId: ToolUseId
      readonly plan: WorkPlan
    }
  /**
   * 委譲先が `phase_result` で帯を動かした。その結果を委譲の返却の形で運ぶ（`CallReview.pass` は通らない）。
   */
  | { readonly kind: "delegate-returned"; readonly handback: DelegateReturn }
  /**
   * 委譲先が形の合う `phase_result` を呼んだ。サーバの中だけで流れる。
   * `CallReview.pass` が受け、同じ `delegate` の次の返却に `phase_result` が伴った印にする（畳み込み・ブラウザには届かない）。
   */
  | { readonly kind: "phase-result-called"; readonly delegate: ToolUseId }
  /**
   * 委譲先の返却（`SubagentHandback`）が届いた。本文は読まず、届いた事実だけを運ぶ。サーバの中だけで流れる。
   * `CallReview.pass` が受け、委譲ゲートと注記だけを立てて捨てる（畳み込み・ブラウザには届かない）。
   * `delegate` は返した委譲先で、同じ委譲先の `phase-result-called` と対にする。
   */
  | { readonly kind: "delegate-handed-back"; readonly delegate: ToolUseId }
  /**
   * ワークフロースクリプト（`Workflow`）の走り出し（SDK の `system` / `task_started` のうち `task_type` が `local_workflow` のもの）。サーバの中だけで流れる。
   * `CallReview.pass` が `taskId` を覚え、同じ `taskId` の `task-notified` と対にしてワークフロースクリプトの完了を見分ける（畳み込み・ブラウザには届かない）。
   */
  | { readonly kind: "workflow-started"; readonly taskId: TaskId }
  /**
   * バックグラウンドタスクの完了・失敗・停止の知らせが届いた（SDK の `system` / `task_notification` の `task_id`）。サーバの中だけで流れる。
   * `task_notification` に `task_type` は無いので、ワークフロースクリプトのものかは `workflow-started` の `taskId` との突き合わせで決める。
   * `CallReview.pass` が受けて捨てる（畳み込み・ブラウザには届かない）。
   */
  | { readonly kind: "task-notified"; readonly taskId: TaskId }
  /**
   * サブエージェントの中でツールを使い始めた（`PreToolUse` のフックのうち `agent_id` のあるもの）。
   * `agentId` はそのフックの `agent_id` で、ワークフロースクリプトの agent かとどのワークフロースクリプトに当てるかは `withWorkflowStep` が決める。
   * `input` は要約に使う欄1つだけに絞ってある（`toolSummaryInput`）。
   */
  | {
      readonly kind: "workflow-step-started"
      readonly agentId: string
      readonly toolUseId: ToolUseId
      readonly name: string
      readonly input: Readonly<Record<string, string>>
    }
  /**
   * サブエージェントの中のツールが終わった（`PostToolUse`・`PostToolUseFailure` のフックのうち `agent_id` のあるもの）。
   * `toolUseId` が同じ `workflow-step-started` の手順だけを終わりにする（`finishWorkflowStep`）。
   */
  | {
      readonly kind: "workflow-step-finished"
      readonly agentId: string
      readonly toolUseId: ToolUseId
    }
  /**
   * ワークフロースクリプトの段と agent の写しが届いた（SDK の `system` / `task_progress` の `workflow_progress`）。
   * 毎回全体の写しで、受け取る側は同じ `taskId` のものを丸ごと置き換える。
   */
  | { readonly kind: "workflow-progress"; readonly progress: WorkflowProgress }
  | {
      readonly kind: "tool-started"
      readonly toolUseId: ToolUseId
      readonly name: string
      readonly input: unknown
      /**
       * サブエージェントの中で動いたときの、起こした側の Agent ツールの `toolUseId`。
       * トップレベルのターンでは undefined（SDK メッセージの `parent_tool_use_id` が `null`）。
       */
      readonly parentToolUseId?: ToolUseId
    }
  | {
      readonly kind: "tool-finished"
      readonly toolUseId: ToolUseId
      readonly content: string
      readonly isError: boolean
    }
  /**
   * 背景で走らせたツールが走り終えた（SDK の `system` / `task_notification` の `tool_use_id`）。
   * 完了・失敗・停止を区別しない。
   * 前景のツールでも数秒を越えると届く（実測）ので、効かせるかは畳み込みが記録の側で決める。
   */
  | { readonly kind: "background-tool-finished"; readonly toolUseId: ToolUseId }
  /**
   * バックグラウンドタスクの進みの1行が届いた（SDK の `system` / `task_progress` の `summary`）。
   * `summary` は委譲先の会話から作られた字なので、畳み込み・記録・ログに写さない。
   * サーバの中だけで流れ、`ProgressNudge` が受けたら駆動が送り出す手前で捨てる（畳み込み・ブラウザには届かない）。
   */
  | { readonly kind: "delegate-progress"; readonly taskId: TaskId; readonly summary: string }
  /**
   * 駆動が委譲先の進みの1行をメインへ差し込んだ（`ProgressNudge`）。差し込んだ事実だけを運び、文面は持たない。
   * `CallReview.pass` が `speak` の新しい事実に数える。
   * `delegate-progress` と同じくサーバの中だけで流れ、駆動が送り出す手前で捨てる（畳み込み・ブラウザには届かない）。
   * ターンの始まりは、続く `init` から `turn-resumed` が補う。
   */
  | { readonly kind: "progress-nudged" }
  /**
   * バックグラウンドタスクの顔ぶれが変わった（SDK の `system` / `background_tasks_changed`。実測: 背景の Bash・サブエージェントが始まったときと終わったときに1回ずつ届く）。
   * 運ぶのは変わったあとの全員で、受け取る側は丸ごと置き換える
   * （SDK の型定義が「REPLACE semantics」と言う水準の知らせ。始まり・終わりの対を数えないので、片方を取りこぼしても「動いている」が居残らない）。
   * 活動でないもの（SDK の `ambient`。見張り役など）は変換で落としてある。
   */
  | { readonly kind: "background-tasks-changed"; readonly tasks: readonly BackgroundTask[] }
