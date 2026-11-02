import type { BackgroundTask } from "../session-driver/background-task.ts"

/**
 * ワークフロースクリプト1本の中で、いちばん新しく始まった手順。
 * `input` は要約に使う欄1つだけに絞った入力で、画面に出すだけでログにもファイルにも書かない。
 */
export type WorkflowStep = {
  readonly taskId: string
  readonly name: string
  readonly input: Readonly<Record<string, string>>
}

/**
 * いちばん新しいワークフロースクリプトの手順を差し替える。ワークフロースクリプトが動いていなければ元のまま。
 * SDK はワークフロースクリプトの中の `assistant` メッセージを流さないので（`tool-started` は届かない）、手順は `workflow-step-started` だけから知る。
 * `workflow-step-started` の源のフックの入力にワークフロースクリプトの `task_id` が無いので、いちばん新しいものに当てる。
 */
export function withWorkflowStep(
  steps: readonly WorkflowStep[],
  tasks: readonly BackgroundTask[],
  name: string,
  input: Readonly<Record<string, string>>,
): readonly WorkflowStep[] {
  const workflow = tasks.findLast((task) => task.kind === "workflow")
  return workflow === undefined
    ? steps
    : [
        ...steps.filter((step) => step.taskId !== workflow.taskId),
        { taskId: workflow.taskId, name, input },
      ]
}

/** 顔ぶれに残っているワークフロースクリプトの手順だけを残す。 */
export function workflowStepsOfTasks(
  steps: readonly WorkflowStep[],
  tasks: readonly BackgroundTask[],
): readonly WorkflowStep[] {
  return steps.filter((step) => tasks.some((task) => task.taskId === step.taskId))
}
