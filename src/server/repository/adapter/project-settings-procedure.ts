// プロジェクトの設定を書くコマンドの手続き。形は `projectSettingsContract`。
// ここは表の行（`projectSettingsCommands`）へ委ね、受け付けなかったことを契約のエラーに訳すだけ。

import { implement } from "@orpc/server"

import { projectSettingsContract } from "../../../shared/contract/project-settings.ts"
import { type CommandEventSink, receiveFeatureCommand } from "../../core/command-receiver.ts"
import {
  type ProjectSettingsCommandPorts,
  projectSettingsCommands,
} from "../core/project-settings-command.ts"

export function projectSettingsProcedure(ports: ProjectSettingsCommandPorts) {
  const table = projectSettingsCommands(ports)
  const procedure = implement(projectSettingsContract).$context<{
    readonly session: CommandEventSink
  }>()
  return procedure.router({
    save: procedure.save.handler(async ({ input, context, errors }) => {
      const result = await receiveFeatureCommand(table.save, input, context.session)
      if (!result.ok) {
        throw errors.REFUSED({ data: { reason: result.reason } })
      }
    }),
  })
}
