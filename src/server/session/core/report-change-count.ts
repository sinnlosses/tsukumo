// 最終レポートの変更の札を数える係。駆動1代に1つ。
// 依頼（`request`）が届いたら HEAD を控え、`task` のある `report` が届いたら控えた HEAD からの `git diff --numstat` を数えて `report-change-summary` を流す。
// 数えるのは待たずに裏で走らせるので、`report` そのものは遅れない。
// 数えられないとき（HEAD が読めない・控えた HEAD がいまの HEAD の祖先でない・git が打てない・出力が読めない）は何も流さない。

import {
  NO_REPORT_CHANGE_SUMMARY,
  type ReportChangeSummary,
} from "../../../shared/report/report-change-summary.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { ChangeCountGit, GitHead, NumstatOutput } from "../../core/change-count-git.ts"

export type ReportChangeCounter = {
  /** 受理されたイベントを1件ずつ見る（復元した再生は渡さない）。 */
  readonly observe: (event: SessionEvent) => void
}

export function createReportChangeCounter(
  git: ChangeCountGit,
  emit: (event: SessionEvent) => void,
): ReportChangeCounter {
  let head: Promise<GitHead> | undefined = undefined

  return {
    observe: (event) => {
      if (event.kind === "request") {
        head = git.readHead().catch(() => ({ kind: "unknown" }) as const)
        return
      }
      if (event.kind !== "report" || event.task.kind === "none" || head === undefined) {
        return
      }
      const { toolUseId } = event
      void countSince(git, head).then((summary) => {
        if (summary.kind === "counted") {
          const { files, added, removed } = summary
          emit({ kind: "report-change-summary", toolUseId, files, added, removed })
        }
      })
    },
  }
}

const NUMSTAT_LINE = /^(\d+|-)\t(\d+|-)\t./

async function countSince(
  git: ChangeCountGit,
  head: Promise<GitHead>,
): Promise<ReportChangeSummary> {
  const known = await head
  if (known.kind === "unknown") {
    return NO_REPORT_CHANGE_SUMMARY
  }
  const output = await git
    .diffNumstatSince(known.sha)
    .catch((): NumstatOutput => ({ kind: "unavailable" }))
  return output.kind === "output" ? countNumstat(output.text) : NO_REPORT_CHANGE_SUMMARY
}

/** `<追加>\t<削除>\t<パス>` の行を数える。バイナリの `-` は行に数えずファイルには数える。読めない行があれば数えない。 */
function countNumstat(text: string): ReportChangeSummary {
  const lines = text.split("\n").filter((line) => line !== "")
  let added = 0
  let removed = 0
  for (const line of lines) {
    const match = NUMSTAT_LINE.exec(line)
    if (match === null) {
      return NO_REPORT_CHANGE_SUMMARY
    }
    added += lineCount(match[1] ?? "-")
    removed += lineCount(match[2] ?? "-")
  }
  return { kind: "counted", files: lines.length, added, removed }
}

function lineCount(field: string): number {
  return field === "-" ? 0 : Number(field)
}
