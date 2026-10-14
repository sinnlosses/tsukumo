// ワークフローの設定の配線。呼ぶ `tw` と、どのリポジトリの設定かを決める。
// 取り込んだワークフローを載せるとき（疑似セッションを含む）は取り込みの `bin/tw`、利用者がリンクで入れていて載せないときは PATH の `tw`。

import { join } from "node:path"

import { projectNameOf } from "../server/repository/adapter/project-name.ts"
import { workflowPluginDir } from "../server/session-driver/adapter/workflow-plugin.ts"
import { twConfigPort } from "../server/workflow-setting/adapter/tw-config.ts"
import type { WorkflowSettingProcedurePorts } from "../server/workflow-setting/adapter/workflow-setting-procedure.ts"
import {
  changeWorkflowSetting,
  readWorkflowSetting,
  type WorkflowSettingPlace,
} from "../server/workflow-setting/core/workflow-setting-reading.ts"

const PATH_TW = "tw"

export function wireWorkflowSetting(
  cwd: string,
  mountWorkflowPlugin: boolean,
): WorkflowSettingProcedurePorts {
  const tw = mountWorkflowPlugin ? join(workflowPluginDir(), "bin", "tw") : PATH_TW
  const port = twConfigPort(tw, cwd)
  const place: WorkflowSettingPlace = {
    worktreeName: projectNameOf(cwd),
    configPathOf: (relativePath) => join(cwd, relativePath),
    twLocation: tw === PATH_TW ? "PATH の tw" : tw,
  }
  return {
    readWorkflowSetting: () => readWorkflowSetting(port, place),
    changeWorkflowSetting: (key, value) => changeWorkflowSetting(port, place, key, value),
  }
}
