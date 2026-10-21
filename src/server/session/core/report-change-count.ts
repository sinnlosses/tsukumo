// 最終レポートの変更の札を数える係。駆動1代に1つ。
// 依頼（`request`）が届いたら HEAD を控え、`task` のある `report` が届いたら、控えた HEAD より後のコミットのうち件名が `<タスクID>:` で始まるものの `numstat` を数えて `report-change-summary` を流す。
// 件名が合うコミットが無いときは控えた HEAD からの `git diff --numstat` を数え、範囲に別のコミットがあった（または一覧が読めなかった）なら `mixed` を立てる。
// 数えるのは待たずに裏で走らせるので、`report` そのものは遅れない。
// 数えられないとき（HEAD が読めない・控えた HEAD がいまの HEAD の祖先でない・git が打てない・出力が読めない）は何も流さない。

import {
  NO_REPORT_CHANGE_SUMMARY,
  type ReportChangeSummary,
} from "../../../shared/report/report-change-summary.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type {
  ChangeCountGit,
  CommitListOutput,
  GitHead,
  NumstatOutput,
} from "../../core/change-count-git.ts"

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
      void emitSummary(toolUseId, countSince(git, head, event.task.id))
    },
  }

  async function emitSummary(
    toolUseId: string,
    counting: Promise<ReportChangeSummary>,
  ): Promise<void> {
    try {
      const summary = await counting
      if (summary.kind === "counted") {
        const { files, added, removed, mixed } = summary
        emit({ kind: "report-change-summary", toolUseId, files, added, removed, mixed })
      }
    } catch {
      // 数えられないときは何も流さない（ファイル先頭の約束）。
    }
  }
}

const NUMSTAT_LINE = /^(\d+|-)\t(\d+|-)\t(.+)$/

const UNAVAILABLE_NUMSTAT: NumstatOutput = { kind: "unavailable" }

async function countSince(
  git: ChangeCountGit,
  head: Promise<GitHead>,
  taskId: string,
): Promise<ReportChangeSummary> {
  const known = await head
  if (known.kind === "unknown") {
    return NO_REPORT_CHANGE_SUMMARY
  }
  const commits = await git
    .commitsSince(known.sha)
    .catch((): CommitListOutput => ({ kind: "unavailable" }))
  const own = commits.kind === "output" ? commitsOfTask(commits, taskId) : []
  if (own.length > 0) {
    const outputs = await Promise.all(
      own.map((sha) => git.numstatOfCommit(sha).catch(() => UNAVAILABLE_NUMSTAT)),
    )
    const texts = outputs.flatMap((output) => (output.kind === "output" ? [output.text] : []))
    return texts.length === outputs.length ? countNumstat(texts, false) : NO_REPORT_CHANGE_SUMMARY
  }
  const output = await git.diffNumstatSince(known.sha).catch(() => UNAVAILABLE_NUMSTAT)
  const mixed = commits.kind === "unavailable" || commits.commits.length > 0
  return output.kind === "output" ? countNumstat([output.text], mixed) : NO_REPORT_CHANGE_SUMMARY
}

/** 件名が `<タスクID>:` で始まるコミットの SHA。大文字小文字は区別しない。 */
function commitsOfTask(
  commits: Extract<CommitListOutput, { readonly kind: "output" }>,
  taskId: string,
): readonly string[] {
  const prefix = `${taskId}:`.toLowerCase()
  return commits.commits
    .filter((commit) => commit.subject.toLowerCase().startsWith(prefix))
    .map((commit) => commit.sha)
}

/**
 * `<追加>\t<削除>\t<パス>` の行を数える。同じパスは1ファイルに数え、行は足し合わせる。
 * バイナリの `-` は行に数えずファイルには数える。読めない行があれば数えない。
 * 変更が無い（0 ファイル）ときは混ざりようが無いので `mixed` は立てない。
 */
function countNumstat(texts: readonly string[], mixed: boolean): ReportChangeSummary {
  const paths = new Set<string>()
  let added = 0
  let removed = 0
  for (const line of texts.flatMap((text) => text.split("\n")).filter((entry) => entry !== "")) {
    const match = NUMSTAT_LINE.exec(line)
    if (match === null) {
      return NO_REPORT_CHANGE_SUMMARY
    }
    paths.add(match[3] ?? "")
    added += lineCount(match[1] ?? "-")
    removed += lineCount(match[2] ?? "-")
  }
  return { kind: "counted", files: paths.size, added, removed, mixed: mixed && paths.size > 0 }
}

function lineCount(field: string): number {
  return field === "-" ? 0 : Number(field)
}
