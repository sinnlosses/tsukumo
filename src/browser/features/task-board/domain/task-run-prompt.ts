// 「tsukumo に頼む」で頼めるタスクと、送る文面。

import {
  hasTaskStatus,
  taskReadiness,
  type TaskSummaryItem,
} from "../../../../shared/repository/task-summary.ts"

const HELD_NOTE = "このタスクは保留なので、着手の前に判断を聞いて。"

/** 却下を選んだドラフト1件。`reason` は1行の理由で、空なら文面に添えない。 */
export type DraftDrop = { readonly id: string; readonly reason: string }

/**
 * 頼みの種類。`start` は着手、`plan`・`drop` は1件のドラフトの計画と却下、
 * `sort` は複数のドラフトを1通で仕分ける（`taskId` は使わない）。
 */
export type TaskRequest =
  | { readonly kind: "start"; readonly held: boolean }
  | { readonly kind: "plan" }
  | { readonly kind: "drop" }
  | {
      readonly kind: "sort"
      readonly plans: readonly string[]
      readonly drops: readonly DraftDrop[]
    }

/** 着手できる `todo` と、待ちの無い保留。保留は文面が着手の前に判断を尋ねさせるので頼める。 */
export function isTaskRequestable(task: TaskSummaryItem): boolean {
  if (hasTaskStatus(task, "hold")) {
    return task.waitingFor.length === 0
  }
  return taskReadiness(task)?.kind === "ready"
}

/**
 * 頼みの文面。保留のタスクの着手には、着手の前に判断を聞く旨を末尾に添える。
 * `launchSkill` は利用者が書いた起動スキル名で、着手のときだけ使う。
 * 先頭の `/` と前後の空白を畳み、空・使えない文字を含む値は未設定として固定の文面にする。
 */
export function requestPromptOf(taskId: string, request: TaskRequest, launchSkill = ""): string {
  switch (request.kind) {
    case "start": {
      const skill = launchSkillOf(launchSkill)
      const prompt =
        skill === ""
          ? `タスク ${taskId} を進めて（bd show ${taskId} で読める）。`
          : `/${skill} ${taskId}`
      if (!request.held) {
        return prompt
      }
      return skill === "" ? `${prompt}${HELD_NOTE}` : `${prompt} ${HELD_NOTE}`
    }
    case "plan":
      return `ドラフト ${taskId} を計画して（bd show ${taskId} で読める）。## 完了条件 と ## やること を書いて、着手できる todo にする。`
    case "drop":
      return `ドラフト ${taskId} を却下して（bd show ${taskId} で読める）。理由を ## 結果 に書いて、dropped で閉じる。`
    case "sort":
      return sortPromptOf(request.plans, request.drops)
  }
}

function sortPromptOf(plans: readonly string[], drops: readonly DraftDrop[]): string {
  const parts = ["ドラフトを仕分けた"]
  if (plans.length > 0) {
    parts.push(`計画（承認済み）: ${plans.join(", ")}`)
  }
  if (drops.length > 0) {
    parts.push(`却下: ${drops.map(dropEntryOf).join(", ")}`)
  }
  return `/plan-tasks ${parts.join("。")}`
}

function dropEntryOf(drop: DraftDrop): string {
  const reason = drop.reason.trim()
  return reason === "" ? drop.id : `${drop.id}（${reason}）`
}

const LAUNCH_SKILL_PATTERN = /^[A-Za-z0-9_:-]+$/

/** 畳んだスキル名。未設定・使えない文字を含む値は空文字。 */
function launchSkillOf(raw: string): string {
  const skill = raw.trim().replace(/^\//, "").trim()
  return LAUNCH_SKILL_PATTERN.test(skill) ? skill : ""
}
