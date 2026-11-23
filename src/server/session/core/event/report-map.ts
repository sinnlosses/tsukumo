// 最終レポートの「変えたファイル」に添える、レポートの時点の地図を運ぶ係。駆動1代に1つ。
// `report-change-summary` が届いたら、作業ツリーの木を読み、変えたファイルを地図の箱に当てた地図を `report-map` として流す。
// 読むのは待たずに裏で走らせるので、変更のラベルは遅れない。
// 地図が無いときと、読んで例外になったときは何も流さない。

import type { ChangedFile } from "../../../../shared/report/changed-file.ts"
import type { ReportMapRead } from "../../../../shared/report/report-map.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import type {
  CheckRecordSource,
  WorktreeTree,
} from "../../../repository/core/check-record-source.ts"

/** 作業ディレクトリの地図を読んで、変えたファイルを当てる口。 */
export type ReportMapReader = (
  changed: readonly ChangedFile[],
  tree: WorktreeTree,
) => Promise<ReportMapRead>

export type ReportMapper = {
  /** 受理されたイベントを1件ずつ見る（復元した再生は渡さない）。 */
  readonly observe: (event: SessionEvent) => void
}

export function createReportMapper(
  source: CheckRecordSource,
  readReportMap: ReportMapReader,
  emit: (event: SessionEvent) => void,
): ReportMapper {
  return {
    observe: (event) => {
      if (event.kind !== "report-change-summary") {
        return
      }
      void emitMap(event.toolUseId, event.changed)
    },
  }

  async function emitMap(toolUseId: string, changed: readonly ChangedFile[]): Promise<void> {
    try {
      const tree = await source.readWorktreeTree()
      const read = await readReportMap(changed, tree)
      if (read.kind === "mapped") {
        emit({ kind: "report-map", toolUseId, map: read.map })
      }
    } catch {
      // 読めないときは何も流さない（ファイル先頭の約束）。
    }
  }
}
