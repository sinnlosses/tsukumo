// ワークフローの設定の配線。呼ぶ `tw`（`chooseTw`。hook の起こしも同じ）と、どのリポジトリの設定かを決める。
// 差し替え（`TSUKUMO_TW`）があればそれ、なければ取り込んだワークフローを載せるとき（疑似セッションを含む）は取り込みの `bin/tw`、
// 利用者がリンクで入れていて載せないときは PATH の `tw`。

import { join } from "node:path"

import { projectNameOf } from "../server/repository/adapter/project-name.ts"
import { workflowPluginDir } from "../server/session-driver/adapter/workflow-plugin.ts"
import { twConfigPort } from "../server/workflow-setting/adapter/tw-config.ts"
import type { WorkflowSettingProcedurePorts } from "../server/workflow-setting/adapter/workflow-setting-procedure.ts"
import {
  changeWorkflowSetting,
  readWorkflowEntries,
  readWorkflowSetting,
  type WorkflowSettingPlace,
} from "../server/workflow-setting/core/workflow-setting-reading.ts"

const PATH_TW = "tw"

export function wireWorkflowSetting(cwd: string, tw: string): WorkflowSettingProcedurePorts {
  const port = twConfigPort(tw, cwd)
  const place: WorkflowSettingPlace = {
    worktreeName: projectNameOf(cwd),
    configPathOf: (relativePath) => join(cwd, relativePath),
    twLocation: tw === PATH_TW ? "PATH の tw" : tw,
  }
  return {
    readWorkflowSetting: () => readWorkflowSetting(port, place),
    readWorkflowEntries: () => readWorkflowEntries(port),
    changeWorkflowSetting: (key, value) => changeWorkflowSetting(port, place, key, value),
  }
}

export function chooseTw(twOverride: string | undefined, mountWorkflowPlugin: boolean): string {
  if (twOverride !== undefined) {
    return twOverride
  }
  return mountWorkflowPlugin ? join(workflowPluginDir(), "bin", "tw") : PATH_TW
}
