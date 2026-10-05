// `projectSettings` が受けるコマンドの表。

import type { projectSettingsContract } from "../../../shared/contract/project-settings.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import type { ProjectTasks } from "../../../shared/repository/project-settings.ts"
import type { FeatureCommandTable } from "../../core/command-receiver.ts"

export type ProjectSettingsCommandPorts = {
  /** 起動先の `.tsukumo/project.json` を書き、書けたかどうかを返す。 */
  readonly save: (tasks: ProjectTasks) => Promise<boolean>
}

export function projectSettingsCommands(
  ports: ProjectSettingsCommandPorts,
): FeatureCommandTable<typeof projectSettingsContract> {
  return {
    // 流すイベントは無い。タスクの節は見回りが読み直して `tasks-changed` で切り替わる。
    save: {
      kind: "call",
      receive: (input) => ports.save(input),
      failure: FRAME_ERROR_REASON.projectSettingsSaveFailed,
    },
  }
}
