// この作業ツリーが着手したタスクの段を、呼ばれたその場で Beads から読む。
// 例外を投げない。読めないときはすべて `none`。

import {
  claimedTaskStepsOf,
  type ClaimedTaskSteps,
} from "../../../shared/repository/task-workflow.ts"
import { readBeadsIssues } from "./beads.ts"
import { projectNameOf } from "./project-name.ts"
import { readProjectSettings } from "./project-settings.ts"

export type ClaimedTaskPorts = {
  readonly readProjectSettings: typeof readProjectSettings
  readonly readBeadsIssues: typeof readBeadsIssues
}

/**
 * 設定が `off`・読めないときは `bd` を起こさない。
 * `bd` が読めない（`.beads` の無いプロジェクトを含む）・タイムアウトしたときも `none`。
 */
export async function readClaimedTaskSteps(
  cwd: string,
  ports: ClaimedTaskPorts = REAL_CLAIMED_TASK_PORTS,
): Promise<ClaimedTaskSteps> {
  const settings = await ports.readProjectSettings(cwd)
  if (settings.kind === "off" || settings.kind === "invalid") {
    return { kind: "none" }
  }
  const beads = await ports.readBeadsIssues(cwd)
  return beads.kind === "issues"
    ? claimedTaskStepsOf(beads.issues, projectNameOf(cwd))
    : { kind: "none" }
}

const REAL_CLAIMED_TASK_PORTS = {
  readProjectSettings,
  readBeadsIssues,
} satisfies ClaimedTaskPorts
