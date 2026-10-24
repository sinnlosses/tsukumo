// ワークフローの設定の手続き。形は `workflowSettingContract`（読む）と `workflowSettingCommandContract`（書く）。
import { implement } from "@orpc/server"

import {
  workflowSettingCommandContract,
  workflowSettingContract,
} from "../../../shared/contract/workflow-setting.ts"
import type {
  WorkflowEntry,
  WorkflowSettingChange,
  WorkflowSettingView,
} from "../../../shared/workflow-setting/workflow-setting.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。どちらも例外を投げない。 */
export type WorkflowSettingProcedurePorts = {
  readonly readWorkflowSetting: () => Promise<WorkflowSettingView>
  readonly readWorkflowEntries: () => Promise<readonly WorkflowEntry[]>
  readonly changeWorkflowSetting: (key: string, value: string) => Promise<WorkflowSettingChange>
}

export function workflowSettingProcedure(
  ports: Pick<WorkflowSettingProcedurePorts, "readWorkflowSetting" | "readWorkflowEntries">,
) {
  const procedure = implement(workflowSettingContract)
  return procedure.router({
    read: procedure.read.handler(() => ports.readWorkflowSetting()),
    entries: procedure.entries.handler(() => ports.readWorkflowEntries()),
  })
}

export function workflowSettingCommandProcedure(
  ports: Pick<WorkflowSettingProcedurePorts, "changeWorkflowSetting">,
) {
  const procedure = implement(workflowSettingCommandContract)
  return procedure.router({
    set: procedure.set.handler(({ input }) => ports.changeWorkflowSetting(input.key, input.value)),
  })
}
