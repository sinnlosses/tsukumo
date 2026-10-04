// 診断ログの手続き。形は `diagnosticContract`。受け取った入力をそのまま口へ渡すだけ。

import { implement } from "@orpc/server"

import { diagnosticContract } from "../../../shared/contract/diagnostic.ts"
import type { BrowserErrorReport } from "../../../shared/diagnostic/diagnostic-record.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type DiagnosticProcedurePorts = {
  readonly reportBrowserError: (report: BrowserErrorReport) => void
}

export function diagnosticProcedure(ports: DiagnosticProcedurePorts) {
  const procedure = implement(diagnosticContract)
  return procedure.router({
    reportBrowserError: procedure.reportBrowserError.handler(({ input }) => {
      ports.reportBrowserError(input)
    }),
  })
}
