// 畳んだイベント1件を、会話のアーカイブ・トークン消費・コンテキストの内訳・report と質問の使用記録へ渡す。
// どのイベントをどの記録口へ、どちらのモード・セッションIDが決まったあとかで渡すかの門がここにある。
// 復元した再生はここを通らない（呼ぶ側が呼ばない）。

import { shownCharacterPackName } from "../../../shared/character-pack/character.ts"
import { swallowedFailureFootprint } from "../../../shared/diagnostic/swallowed-failure.ts"
import { conclusionWithTaskName } from "../../../shared/report/report-task.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import {
  appendChatArchiveConclusion,
  appendChatArchiveEntry,
} from "../../chat/core/chat-archive-entry.ts"
import type { ChatArchiveOrder } from "../../chat/core/chat-archive-order.ts"
import type { ContextUsageRecorder } from "../../context-usage/core/context-usage.ts"
import type { DiagnosticBuffer } from "../../diagnostic/core/diagnostic.ts"
import { isMainImageFileRead, reportUsageEntryOf } from "../../report/core/report-usage.ts"
import type { GenerationTally } from "./session-generation.ts"
import type { SessionManagerOptions } from "./session-manager-port.ts"

type EventRecordPorts = Pick<
  SessionManagerOptions,
  "chatArchive" | "project" | "reportUsageLog" | "promptImageShelf" | "tokenUsageLog"
> & {
  readonly contextUsage: ContextUsageRecorder
  readonly diagnostic: DiagnosticBuffer
  readonly archiveOrder: ChatArchiveOrder
}

/** `state` は `event` を畳んだあとの姿。 */
export function recordSessionEvent(
  ports: EventRecordPorts,
  tally: GenerationTally,
  state: SessionState,
  event: SessionEvent,
  at: number,
): void {
  // 会話のアーカイブへ1行足す。パックがまだ決まっていない・名前が検査を通らないときは足さない。
  const packName = shownCharacterPackName(state.character)
  if (packName !== undefined) {
    const mode = state.chatMode ? "chat" : "work"
    ports.archiveOrder.run(() =>
      appendChatArchiveEntry(ports.chatArchive, packName, mode, ports.project, at, event, {
        find: ports.promptImageShelf.find,
        reportFailure: (error) => {
          ports.diagnostic.add(
            swallowedFailureFootprint(at, { feature: "chat", place: "archive-image-write" }, error),
          )
        },
      }),
    )
  }
  // 仕事のターンの結論を、代の勘定に預けて上書きする（`turn-finished` で読み出す）。
  if (event.kind === "report") {
    tally.pendingConclusion.hold(conclusionWithTaskName(event.conclusion, event.task))
  }
  if (event.kind === "request") {
    ports.tokenUsageLog.prefetchOpenTask(at)
  }
  // ターンの中の内訳（ツール別・持ち場別）を積む。
  tally.tokenUsage.tally(event)
  // そのターンのトークン消費を1行書く。
  if (event.kind === "token-usage") {
    tally.tokenUsage.append(event.cumulative, at, state)
  }
  // トークン消費の内訳を、1ターンぶんだけ持つところから捨てる（次のターンでまた0から数える）。
  // `token-usage` は `turn-finished` より先に届く（変換する側が `result` 1つをこの順に変換する）ので、書き終えたあとに捨てることになる。
  // セッションIDが決まる前の行は、どのセッションのものか分からなくなるので書かない。
  if (event.kind === "report" && state.session.kind !== "starting") {
    ports.reportUsageLog.append(
      reportUsageEntryOf(event, state.session.sessionId, at, tally.turnImageRead.peek()),
    )
  }
  if (event.kind === "tool-started" && isMainImageFileRead(event)) {
    tally.turnImageRead.mark()
  }
  if (
    (event.kind === "report-rejected" || event.kind === "report-counted") &&
    state.session.kind !== "starting"
  ) {
    ports.reportUsageLog.appendRejection({
      mode: event.kind === "report-rejected" ? "reject" : "count",
      at,
      sessionId: state.session.sessionId,
      reasons: event.reasons,
      argumentChars: event.argumentChars,
      inheritedFields: event.inheritedFields,
      toolErrorFields: event.kind === "report-rejected" ? event.toolErrorFields : [],
    })
  }
  if (event.kind === "turn-finished") {
    tally.turnImageRead.clear()
    tally.tokenUsage.finishTurn()
    // コンテキストの内訳はセッションに1行なので、まだ書いていなければ問い合わせる。
    // 待たずに次へ進む（ターンの終わりを遅らせない）。駆動がまだ無い回は次のターンで揃う。
    const driver = tally.liveDriver()
    if (driver !== undefined) {
      void ports.contextUsage.recordOnce(state, at, driver)
    }
    // 仕事のときだけ、預けておいた結論を1行書く。`report` 無しで終わったターンは何も足さない。
    const conclusion = tally.pendingConclusion.takeAndClear()
    if (!state.chatMode && conclusion !== undefined && packName !== undefined) {
      ports.archiveOrder.run(() => {
        appendChatArchiveConclusion(ports.chatArchive, packName, ports.project, at, conclusion)
        return undefined
      })
    }
  }
}
