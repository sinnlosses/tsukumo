// 最終レポートの書き出しのコマンド。
// 書き出すターンの最終レポートをセッションの状態から選び、表紙の帯の値も状態から引いて文書を組み、保存先の口へ渡す。
// 開く・表示するは、保存先の口が書いたと覚えているパスだけを通す（口の側が断る）。
// 時計・ファイル・外部コマンドは持たず、全部を口で受ける。

import type { CommandInputs, CommandRefusalReason } from "../../../../shared/command.ts"
import type { reportExportContract } from "../../../../shared/contract/report-export.ts"
import { FRAME_ERROR_REASON } from "../../../../shared/frame-error-reason.ts"
import type { ReportTaskOutcome } from "../../../../shared/report/report-task.ts"
import { isExchangeClosed } from "../../../../shared/session/conversation-moment.ts"
import { recordTimeAt, type SessionRecord } from "../../../../shared/session/session-record.ts"
import type { SessionState } from "../../../../shared/session/session-state.ts"
import { splitIntoTurns, type Turn, turnIdOf } from "../../../../shared/session/turn.ts"
import type { CallReceiver } from "../../../core/command-receiver.ts"
import type { ReportImageShelf } from "../image/report-image-shelf.ts"
import { buildReportExportDocument, type ReportExportMasthead } from "./report-export-document.ts"
import { reportExportFileName } from "./report-export-file-name.ts"

/** 組んだ文書の字数の上限。画像を `data:` で埋めたあとの長さで見る。 */
const MAX_REPORT_EXPORT_DOCUMENT_LENGTH = 64 * 1024 * 1024

/** 書いたファイル。 */
export type WrittenReportExport = { readonly path: string; readonly fileName: string }

/** 保存先に書けたか。 */
export type ReportExportWrite =
  | ({ readonly kind: "written" } & WrittenReportExport)
  | { readonly kind: "failed" }

/** 保存先の口。書いたパスを覚え、開く・表示するは覚えたパスだけを外へ渡す。 */
export type ReportExportFolder = {
  /**
   * 保存先にある名前を読み、`nameOf` が決めた名前で書く。
   * 書く間に同じ名前ができたときは、名前を決め直して書く。
   */
  readonly write: (
    content: string,
    nameOf: (existingNames: ReadonlySet<string>) => string,
  ) => Promise<ReportExportWrite>
  /** 書いたパスなら外へ渡して開き、開けたかを返す。書いていないパスは開かずに false。 */
  readonly openInBrowser: (path: string) => Promise<boolean>
  /** 書いたパスなら Finder で表示し、表示できたかを返す。書いていないパスは表示せずに false。 */
  readonly revealInFinder: (path: string) => Promise<boolean>
}

export type ReportExportCommandPorts = {
  readonly state: () => SessionState
  readonly findImage: ReportImageShelf["find"]
  /** サーバの時計（エポックミリ秒）。 */
  readonly now: () => number
  /** エポックミリ秒が指す、利用者のローカル時刻。 */
  readonly localTimeAt: (epochMilliseconds: number) => Temporal.PlainDateTime
  readonly folder: ReportExportFolder
}

type ReportExportInputs = CommandInputs<typeof reportExportContract>

export type ReportExportOutcome =
  | ({ readonly kind: "saved" } & WrittenReportExport)
  | { readonly kind: "refused"; readonly reason: CommandRefusalReason }

/** `turnId` のターンの最終レポートを書き出す。 */
export async function saveReportExport(
  ports: ReportExportCommandPorts,
  input: ReportExportInputs["save"],
): Promise<ReportExportOutcome> {
  const final = finalReportOf(ports.state(), input.turnId)
  if (final.kind === "none") {
    return { kind: "refused", reason: FRAME_ERROR_REASON.reportExportNotFinal }
  }
  const now = ports.now()
  const document = buildReportExportDocument({
    bodyHtml: input.bodyHtml,
    css: input.css,
    masthead: mastheadOf(final, ports.localTimeAt),
    findImage: ports.findImage,
  })
  if (document.length > MAX_REPORT_EXPORT_DOCUMENT_LENGTH) {
    return { kind: "refused", reason: FRAME_ERROR_REASON.reportExportTooLarge }
  }
  const written = await ports.folder.write(document, (existingNames) =>
    reportExportFileName({
      ...(final.task === undefined ? {} : { taskId: final.task.id }),
      sessionTitle: firstLine(final.request ?? ""),
      now: ports.localTimeAt(now),
      existingNames,
    }),
  )
  return written.kind === "failed"
    ? { kind: "refused", reason: FRAME_ERROR_REASON.reportExportWriteFailed }
    : { kind: "saved", path: written.path, fileName: written.fileName }
}

/** 開く・表示するの行。書いていないパスと、開けなかったときは同じ理由で断る。 */
export function reportExportOpenCommands(folder: ReportExportFolder): {
  readonly openInBrowser: CallReceiver<ReportExportInputs["openInBrowser"]>
  readonly revealInFinder: CallReceiver<ReportExportInputs["revealInFinder"]>
} {
  return {
    openInBrowser: {
      kind: "call",
      receive: (input) => folder.openInBrowser(input.path),
      failure: FRAME_ERROR_REASON.reportExportOpenFailed,
    },
    revealInFinder: {
      kind: "call",
      receive: (input) => folder.revealInFinder(input.path),
      failure: FRAME_ERROR_REASON.reportExportOpenFailed,
    },
  }
}

type ReportRecord = Extract<SessionRecord, { readonly kind: "report" }>

/** 書き出すターンの最終レポートと、表紙の帯に引く値。 */
type FinalReport = {
  readonly kind: "final"
  readonly request?: string
  readonly requestedAt?: number
  readonly task?: Extract<ReportRecord["task"], { readonly kind: "task" }>
  readonly conclusion?: string
  readonly reportedAt?: number
}

const OUTCOME_TEXT = {
  finished: "完了",
  stopped: "止めた",
  "awaiting-answer": "答え待ち",
} as const satisfies Record<ReportTaskOutcome, string>

const MASTHEAD_KIND = "最終レポート"

/**
 * 画面の最終レポートと同じ選び方で選ぶ。`report` を1回でも呼んだターンは最後の `report`、呼ばなかったターンは最後の本文。
 * 断るのは、雑談のとき・ターンが無いとき・いちばん新しいターンがまだ閉じていない（ターンが動いているかバックグラウンドタスクが残る）とき・本文が1つも無いとき。
 */
function finalReportOf(
  state: SessionState,
  turnId: number,
): FinalReport | { readonly kind: "none" } {
  const none = { kind: "none" } as const
  if (state.chatMode) {
    return none
  }
  const turns = splitIntoTurns(state.records)
  const index = turns.findIndex((turn) => turnIdOf(turn) === turnId)
  const turn = turns[index]
  const open = index === turns.length - 1 && !isExchangeClosed(state)
  if (turn === undefined || open) {
    return none
  }
  const request = requestOf(turn)
  const report = turn.records.findLast((record) => record.kind === "report")
  if (report !== undefined) {
    const reportedAt = recordTimeAt(report.time)
    return {
      kind: "final",
      ...request,
      ...(report.task.kind === "task" ? { task: report.task } : {}),
      conclusion: report.conclusion,
      ...(reportedAt === undefined ? {} : { reportedAt }),
    }
  }
  const hasUtterance = turn.records.some(
    (record) => record.kind === "detail" && record.markdown.trim() !== "",
  )
  return hasUtterance ? { kind: "final", ...request } : none
}

function requestOf(turn: Turn<SessionRecord>): Pick<FinalReport, "request" | "requestedAt"> {
  if (turn.kind === "pre-request") {
    return {}
  }
  const requestedAt = recordTimeAt(turn.request.time)
  return {
    request: turn.request.text,
    ...(requestedAt === undefined ? {} : { requestedAt }),
  }
}

function mastheadOf(
  final: FinalReport,
  localTimeAt: ReportExportCommandPorts["localTimeAt"],
): ReportExportMasthead {
  const title =
    final.task?.name ??
    (firstLine(final.conclusion ?? "") || firstLine(final.request ?? "") || MASTHEAD_KIND)
  const at = final.reportedAt ?? final.requestedAt
  return {
    kind: MASTHEAD_KIND,
    title,
    ...(final.task === undefined
      ? {}
      : { taskId: final.task.id, outcome: OUTCOME_TEXT[final.task.outcome] }),
    ...(final.request === undefined ? {} : { request: firstLine(final.request) }),
    ...(at === undefined ? {} : { at: displayTime(localTimeAt(at)) }),
  }
}

function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  )
}

function displayTime(time: Temporal.PlainDateTime): string {
  return time.toString({ smallestUnit: "minute" }).replace("T", " ")
}
