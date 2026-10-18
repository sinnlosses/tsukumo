// セッションの出来事（`SessionEvent`）のうち、ワークプラン・委譲先・ツール・バックグラウンドタスクに関するものの型。

import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { DelegateReturn } from "./delegate-return.ts"
import type { WorkPlan } from "./work-plan.ts"

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
      readonly toolUseId: string
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
  | { readonly kind: "phase-result-called"; readonly delegate: string }
  /**
   * 委譲先の返却（`SubagentHandback`）が届いた。本文は読まず、届いた事実だけを運ぶ。サーバの中だけで流れる。
   * `CallReview.pass` が受け、委譲ゲートと注記だけを立てて捨てる（畳み込み・ブラウザには届かない）。
   * `delegate` は返した委譲先で、同じ委譲先の `phase-result-called` と対にする。
   */
  | { readonly kind: "delegate-handed-back"; readonly delegate: string }
  | {
      readonly kind: "tool-started"
      readonly toolUseId: string
      readonly name: string
      readonly input: unknown
      /**
       * サブエージェントの中で動いたときの、起こした側の Agent ツールの `toolUseId`。
       * トップレベルのターンでは undefined（SDK メッセージの `parent_tool_use_id` が `null`）。
       */
      readonly parentToolUseId: string | undefined
    }
  | {
      readonly kind: "tool-finished"
      readonly toolUseId: string
      readonly content: string
      readonly isError: boolean
    }
  /**
   * 背景で走らせたツールが走り終えた（SDK の `system` / `task_notification` の `tool_use_id`）。
   * 完了・失敗・停止を区別しない。
   * 前景のツールでも数秒を越えると届く（実測）ので、効かせるかは畳み込みが記録の側で決める。
   */
  | { readonly kind: "background-tool-finished"; readonly toolUseId: string }
  /**
   * 背景のタスクの進みの1行が届いた（SDK の `system` / `task_progress` の `summary`）。
   * `summary` は委譲先の会話から作られた字なので、畳み込み・記録・ログに写さない。
   * サーバの中だけで流れ、`ProgressNudge` が受けたら駆動が送り出す手前で捨てる（畳み込み・ブラウザには届かない）。
   */
  | { readonly kind: "delegate-progress"; readonly taskId: string; readonly summary: string }
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
