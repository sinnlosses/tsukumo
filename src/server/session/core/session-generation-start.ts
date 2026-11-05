// 駆動を1代起こし、その代の勘定を作って、届いたイベントを畳む係。
// 何代目まで起こしたかをここで持ち、閉じた駆動があとから投げてくるイベントを捨てる。

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import type { ServerFrame } from "../../../shared/frame.ts"
import type { RestoredEvent, SessionEvent } from "../../../shared/session/session-event.ts"
import { applySessionEvent } from "../../../shared/session/session-fold.ts"
import { waitingLineDueAt } from "../../../shared/session/shown-reaction.ts"
import type { ChatArchiveOrder } from "../../chat/core/archive/chat-archive-order.ts"
import type { DiagnosticBuffer } from "../../diagnostic/core/diagnostic.ts"
import type { SessionDriver } from "../../session-driver/core/session-driver.ts"
import type { ContextUsageRecorder } from "../../usage/core/context-usage.ts"
import type { ExperienceMetricRecorder } from "../../usage/core/experience/experience-metric.ts"
import { createTokenUsageRecorder } from "../../usage/core/token-usage.ts"
import type { SessionLaunchRequest } from "./command-session-port.ts"
import { createEventBatch } from "./event/event-batch.ts"
import { shelveEventImages } from "./event/event-image-shelf.ts"
import { consolidationPackToStart, isBatched } from "./event/event-judgement.ts"
import { createReportChangeCounter } from "./event/report-change-count.ts"
import { createReportVerifier } from "./event/report-verification.ts"
import { applyRestoredEvents } from "./event/restored-event.ts"
import {
  shelveRestoredPromptImages,
  unrecordedRestoredPromptImageIds,
} from "./event/restored-prompt-image.ts"
import { shelveRestoredReportImages } from "./event/restored-report-image.ts"
import { recordSessionEvent } from "./event/session-event-record.ts"
import {
  createConfirmedSettings,
  createPendingConclusion,
  createTurnImageRead,
  type GenerationTally,
  type SessionGeneration,
} from "./event/session-generation.ts"
import { createWaitingLineAlarm } from "./event/waiting-line-alarm.ts"
import type { SessionManagerOptions } from "./session-manager-port.ts"
import type { SessionStateBox } from "./session-state-box.ts"

/** 駆動を1代起こし、その代ぶんの勘定をまとめて作る。 */
export type StartGeneration = (
  request: SessionLaunchRequest,
  delivery: "immediate" | "after-hello",
) => SessionGeneration

type GenerationStartDeps = {
  readonly options: SessionManagerOptions
  readonly stateBox: SessionStateBox
  readonly isClosed: () => boolean
  readonly broadcast: (frame: ServerFrame) => void
  readonly helloFrame: () => ServerFrame
  readonly diagnostic: DiagnosticBuffer
  readonly experienceMetric: ExperienceMetricRecorder
  readonly contextUsage: ContextUsageRecorder
  readonly archiveOrder: ChatArchiveOrder
  /** そのパックの定着を起こす（走っていれば何もしない）。 */
  readonly startConsolidation: (packName: CharacterPackName) => void
}

export function createGenerationStart(deps: GenerationStartDeps): StartGeneration {
  const { options, stateBox, diagnostic, experienceMetric, contextUsage, archiveOrder } = deps
  // 何代目まで起こしたか。起こし直したとき、前の駆動の最後のイベントが新しい状態に混ざらない。
  let bornCount = 0

  /**
   * 駆動から届いたイベント1件を畳んで、それを生んだ代の勘定に積む。
   * 見た目の編集で起こした `character-changed` もここを通る（サーバ側の状態とブラウザへ配る内容を1本にする）。
   */
  const receive = (tally: GenerationTally, driven: SessionEvent): void => {
    if (deps.isClosed() || tally.confirmedSettings.isRepeat(driven, stateBox.current())) {
      return
    }
    tally.confirmedSettings.note(driven)
    const at = options.now()
    // 画像はブラウザがこのレポートや質問を描く前に棚に無いといけないので、束に積む前に置く。
    const event = shelveEventImages(options, stateBox.current(), driven)
    stateBox.replace(applySessionEvent(stateBox.current(), event, at))
    tally.waitingLineAlarm.set(waitingLineDueAt(stateBox.current()))
    if (isBatched(event)) {
      tally.batch.add({ at, event })
    }
    diagnostic.add({
      flow: "session-event",
      at,
      generation: tally.generation,
      kind: event.kind,
    })
    experienceMetric.observe(event, stateBox.current(), at)
    tally.reportChangeCounter.observe(event)
    tally.reportVerifier.observe(event)
    recordSessionEvent(
      { ...options, contextUsage, diagnostic, archiveOrder },
      tally,
      stateBox.current(),
      event,
      at,
    )
    // 定着を起こす。ターンの終わり（雑談・仕事）で、走っていれば契機を捨てる。待たずに次へ進む。
    const packName = consolidationPackToStart(event, stateBox.current())
    if (packName !== undefined) {
      deps.startConsolidation(packName)
    }
  }

  return (request, delivery) => {
    bornCount += 1
    const born = bornCount
    // 起き上がった駆動を入れる可変の入れ物（起き上がるまでは空）。
    let live: SessionDriver | undefined = undefined
    // 起こし直しの代は、新しい `hello` を配るまで束を配らない。
    // 駆動が起き上がるまでの数秒に流れたイベント（`chat-mode-changed` など）を先に配ると、ブラウザは前のセッションの状態のまま雑談 / 仕事へ切り替わり、前の立ち絵が一瞬出てから `hello` で入れ替わる。
    // その間の姿は `hello` に入るので、配らずに捨ててよい。
    let held = delivery === "after-hello"
    const diaryAbort = new AbortController()
    const tally: GenerationTally = {
      generation: born,
      batch: createEventBatch({
        intervalMs: options.batchIntervalMs,
        deliver: (events) => {
          if (!held) {
            deps.broadcast({ type: "events", events })
          }
        },
      }),
      tokenUsage: createTokenUsageRecorder(options.tokenUsageLog),
      liveDriver: () => live,
      diarySignal: diaryAbort.signal,
      pendingConclusion: createPendingConclusion(),
      turnImageRead: createTurnImageRead(),
      confirmedSettings: createConfirmedSettings(),
      waitingLineAlarm: createWaitingLineAlarm({
        now: options.now,
        ring: () => {
          receiveIfCurrent({ kind: "waiting-line-due" })
        },
      }),
      reportChangeCounter: createReportChangeCounter(options.changeCountGit, (event) => {
        receiveIfCurrent(event)
      }),
      reportVerifier: createReportVerifier(options.checkRecordSource, (event) => {
        receiveIfCurrent(event)
      }),
    }
    const receiveIfCurrent = (event: SessionEvent): boolean => {
      if (born !== bornCount) {
        return false
      }
      receive(tally, event)
      return true
    }
    /**
     * 前のセッションの記録を組み直した再生を、まとめて1回で畳む。
     * 再生は畳むだけで、アーカイブ・トークン・コンテキスト・report の記録・定着には数えない。
     * 出来事の時刻は transcript から戻したもので、読めないものは `applyRestoredEvents` が「時刻が分からない」にする。
     *
     * 束には積まず、配るのは畳んだあとの姿の `hello`。束に残っていたぶんはその姿に入っているので捨てる。
     * 起こし直しの代は `announceGeneration` が `hello` を配るので、ここでは配らない。
     */
    const receiveRestoredIfCurrent = (events: readonly RestoredEvent[]): void => {
      if (deps.isClosed() || born !== bornCount || events.length === 0) {
        return
      }
      const restoredAt = options.now()
      const shelved = shelveRestoredPromptImages(options.promptImageShelf, events)
      stateBox.replace(applyRestoredEvents(stateBox.current(), shelved, restoredAt))
      options.promptImageShelf.release(
        unrecordedRestoredPromptImageIds(shelved, stateBox.current().records),
      )
      tally.waitingLineAlarm.set(waitingLineDueAt(stateBox.current()))
      stateBox.replace(shelveRestoredReportImages(options, stateBox.current(), events, restoredAt))
      if (!held) {
        tally.batch.discard()
        deps.broadcast(deps.helloFrame())
      }
    }

    const driver = options.launchSession(
      (event) => receiveIfCurrent(event),
      (events) => {
        receiveRestoredIfCurrent(events)
      },
      request,
    )
    void driver.then(
      (started) => {
        // 起き上がる前に閉じた・起こし直したときは、その場で閉じる（駆動を取り残さない）。
        if (deps.isClosed() || born !== bornCount) {
          started.close()
          return
        }
        live = started
      },
      () => {
        // 起こせなかったことは、待っている側（restart / askDriver）が拾う。
      },
    )

    return {
      ...tally,
      driver,
      close: () => {
        live?.close()
        tally.batch.discard()
        tally.waitingLineAlarm.cancel()
        diaryAbort.abort()
      },
      announce: () => {
        held = false
      },
      emit: (event) => {
        receiveIfCurrent(event)
      },
    }
  }
}
