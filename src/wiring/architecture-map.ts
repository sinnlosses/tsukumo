// アーキテクチャの地図の配線。作業ディレクトリの地図のファイルを読む口を選ぶ。

import type { ArchitectureMapProcedurePorts } from "../server/architecture-map/adapter/architecture-map-procedure.ts"
import {
  readMapBoxes,
  readMapView,
} from "../server/architecture-map/adapter/architecture-map-view.ts"
import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import { failureDiagnostic } from "./failure-diagnostic.ts"
import { foldPortFailure } from "./fold-port-failure.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireArchitectureMap(
  context: WiringContext,
  diagnosticLog: DiagnosticLog,
): { readonly rpc: ArchitectureMapProcedurePorts } {
  const reportFailure = failureDiagnostic(diagnosticLog, context.now)
  return {
    // 読みが投げた回は足跡を残して、読めなかったときの応答に畳む（地図の画面が理由を出すだけで続く）。
    rpc: {
      readArchitectureMapView: foldPortFailure(
        reportFailure,
        { feature: "architecture-map", place: "read-view" },
        { kind: "unreadable", reason: "read-failed" },
        (selection) => readMapView(context.cwd, selection),
      ),
      readArchitectureMapBoxes: foldPortFailure(
        reportFailure,
        { feature: "architecture-map", place: "read-boxes" },
        { kind: "unreadable", reason: "read-failed" },
        () => readMapBoxes(context.cwd),
      ),
    },
  }
}
