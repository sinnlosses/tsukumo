// 診断の配線。ブラウザから届いた例外の報告を、診断ログの1行にして書く。

import type { DiagnosticProcedurePorts } from "../server/diagnostic/adapter/diagnostic-procedure.ts"
import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireDiagnostic(
  context: WiringContext,
  diagnosticLog: DiagnosticLog,
): { readonly commands: DiagnosticProcedurePorts } {
  return {
    commands: {
      reportBrowserError: (report) => {
        diagnosticLog.append([{ flow: "browser-error", at: context.now(), ...report }])
      },
      reportRecommendationPressed: (kind) => {
        diagnosticLog.append([{ flow: "recommendation-pressed", at: context.now(), kind }])
      },
    },
  }
}
