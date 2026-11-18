// 最終レポートの書き出しのコマンドの手続き。形は `reportExportContract`。
// 書き出しは書いたパスを応答で返すので、真偽しか返さない表の行（`receiveFeatureCommand`）を通さず、断った理由を契約のエラーに訳す。
// 開く・表示するは表の `call` の行へ委ねる。

import { implement } from "@orpc/server"

import { reportExportContract } from "../../../shared/contract/report-export.ts"
import { refusedUnlessAccepted } from "../../adapter/command-refusal.ts"
import { type CommandEventSink, receiveFeatureCommand } from "../../core/command-receiver.ts"
import {
  type ReportExportCommandPorts,
  reportExportOpenCommands,
  saveReportExport,
} from "../core/export/report-export-command.ts"

export function reportExportProcedure(ports: ReportExportCommandPorts) {
  const table = reportExportOpenCommands(ports.folder)
  const procedure = implement(reportExportContract).$context<{
    readonly session: CommandEventSink
  }>()
  return procedure.router({
    save: procedure.save.handler(async ({ input, errors }) => {
      const outcome = await saveReportExport(ports, input)
      if (outcome.kind === "refused") {
        throw errors.REFUSED({ data: { reason: outcome.reason } })
      }
      return { path: outcome.path, fileName: outcome.fileName }
    }),
    openInBrowser: procedure.openInBrowser.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.openInBrowser, input, context.session),
        errors,
      ),
    ),
    revealInFinder: procedure.revealInFinder.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.revealInFinder, input, context.session),
        errors,
      ),
    ),
  })
}
