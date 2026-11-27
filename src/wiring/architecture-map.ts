// アーキテクチャの地図の配線。作業ディレクトリの地図のファイルを読む口を選ぶ。

import type { ArchitectureMapProcedurePorts } from "../server/architecture-map/adapter/architecture-map-procedure.ts"
import { readReportMap } from "../server/architecture-map/adapter/architecture-map-report.ts"
import {
  readMapBoxes,
  readMapView,
} from "../server/architecture-map/adapter/architecture-map-view.ts"
import { rememberBySourceCommit } from "../server/architecture-map/adapter/map-change-log.ts"
import { changeWindowStartOf } from "../server/architecture-map/core/map-change-frequency.ts"
import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import { listRecentCommits } from "../server/repository/adapter/recent-commit.ts"
import { listRepositoryFiles } from "../server/repository/adapter/repository-file.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager-port.ts"
import { failureDiagnostic } from "./failure-diagnostic.ts"
import { foldPortFailure } from "./fold-port-failure.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireArchitectureMap(
  context: WiringContext,
  diagnosticLog: DiagnosticLog,
): {
  readonly rpc: ArchitectureMapProcedurePorts
  readonly manager: Pick<SessionManagerOptions, "readReportMap">
} {
  const reportFailure = failureDiagnostic(diagnosticLog, context.now)
  // 一覧が2万件を超えて欠けた回は、数が合わないので「数えられない」(空) にする
  const listFiles = async (): Promise<readonly string[]> => {
    const list = await listRepositoryFiles(context.cwd)
    return list.omittedCount > 0 ? [] : list.paths
  }
  const readChangeLog = rememberBySourceCommit(() =>
    listRecentCommits(context.cwd, changeWindowStartOf(context.now())),
  )
  return {
    // 疑似セッションは場面の JSON が `report-map` を流すので、ここでは何も読まない
    manager: {
      readReportMap:
        context.driver.kind === "fake"
          ? () => Promise.resolve({ kind: "none" })
          : (changed, tree) => readReportMap(context.cwd, changed, tree),
    },
    // 読みが投げた回は足跡を残して、読めなかったときの応答に畳む（地図の画面が理由を出すだけで続く）。
    rpc: {
      readArchitectureMapView: foldPortFailure(
        reportFailure,
        { feature: "architecture-map", place: "read-view" },
        { kind: "unreadable", reason: "read-failed" },
        (selection) => readMapView(context.cwd, selection, listFiles, readChangeLog),
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
