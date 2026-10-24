// セッションを持つ係。駆動から届いたイベントに時刻を打ち、サーバ側でも同じ畳み込みを回し、まとめてフレームで配る。
//
// - 状態をサーバ側でも持つのは、接続してきたブラウザへ `hello` の snapshot を返すため
// - コマンドの分岐はここに無い。ここは受け手に見せる口（`CommandSession`）を作って出すだけ
// - 持つセッションは1つだけで、鍵を持たない。
//   キャラクター・雑談モード・セッションの切り替えはこの持ち物の中で駆動を起こし直す（`restart`）ので、古い側と新しい側を並べて持つことが無い
// - 代のあいだだけ意味のある勘定は `SessionGeneration` に集める。
//   起こし直しはそれを丸ごと作り直すことなので、勘定を1つ足しても `restart` に戻し忘れる場所が生まれない
//
// 会話の内容がイベントとして通るが、ログにもファイルにも書かない。配る先は購読しているブラウザだけ。

import {
  type CharacterPackName,
  shownCharacterPackName,
} from "../../../shared/character-pack/character.ts"
import { swallowedFailureFootprint } from "../../../shared/diagnostic/swallowed-failure.ts"
import { FRAME_ERROR_REASON, PROTOCOL_VERSION, type ServerFrame } from "../../../shared/frame.ts"
import { applyRestoredEvents } from "../../../shared/session/restored-event.ts"
import type { RestoredEvent, SessionEvent } from "../../../shared/session/session-event.ts"
import { applySessionEvent } from "../../../shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../shared/session/session-state.ts"
import { waitingLineDueAt } from "../../../shared/session/shown-reaction.ts"
import { createChatArchiveOrder } from "../../chat/core/chat-archive-order.ts"
import type { ChatConsolidationOutcome } from "../../chat/core/chat-consolidation-writer.ts"
import { createContextUsageRecorder } from "../../context-usage/core/context-usage.ts"
import type { DispatchResult } from "../../core/command-receiver.ts"
import { createDiagnosticBuffer } from "../../diagnostic/core/diagnostic.ts"
import {
  createExperienceMetricRecorder,
  splitEntry,
} from "../../experience-metric/core/experience-metric.ts"
import { releasedImageToolUseIds } from "../../report/core/report-image-shelf.ts"
import { releasedPromptImageIds } from "../../session-driver/core/prompt-image-shelf.ts"
import type { SessionDriver } from "../../session-driver/core/session-driver.ts"
import { createTokenUsageRecorder } from "../../token-usage/core/token-usage.ts"
import type { CommandSession, ModeSessions } from "./command-session.ts"
import { noteConsolidationOutcome } from "./consolidation-footprint.ts"
import { createEventBatch } from "./event-batch.ts"
import { shelveEventImages } from "./event-image-shelf.ts"
import { createReportChangeCounter } from "./report-change-count.ts"
import { shelveRestoredReportImages } from "./restored-report-image.ts"
import { createDriverRead } from "./session-driver-read.ts"
import { recordSessionEvent } from "./session-event-record.ts"
import {
  createConfirmedSettings,
  createPendingConclusion,
  createTurnImageRead,
  type GenerationTally,
  type SessionGeneration,
} from "./session-generation.ts"
import type { SessionLaunchRequest } from "./session-launch.ts"
import type { SessionManager, SessionManagerOptions } from "./session-manager-port.ts"
import { createWaitingLineAlarm } from "./waiting-line-alarm.ts"

const NO_MODE_SESSIONS: ModeSessions = { work: { kind: "none" }, chat: { kind: "none" } }

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const subscribers = new Set<(frame: ServerFrame) => void>()
  // 前回の見直しの結果だけ、起こしたときにホームから読んで載せる。
  // `INITIAL_SESSION_STATE` は静的な定数なので、実行時の値をここで1回だけ差し込む。
  let state: SessionState = {
    ...INITIAL_SESSION_STATE,
    previousUsageReview: options.readPreviousUsageReview(),
  }
  // 閉じたあとに駆動が投げてくるイベントは捨てる（配る先がもう無いのにタイマーを立てない）。
  let closed = false
  // 起こし直しをまたいで持つ（状態に入れないのでブラウザへは配らない）。
  let modeSessions: ModeSessions = NO_MODE_SESSIONS
  // 何代目まで起こしたか。閉じた駆動があとから投げてくるイベントを捨てるための印。
  // 起こし直したとき、前の駆動の最後のイベントが新しい状態に混ざらない。
  let bornCount = 0
  // コンテキストの内訳の記録。代をまたいで持つ（世代の持ち物には入れない）。
  // 続きから起こして同じIDになったときは同じセッションなので、2行目を書かない。
  const contextUsage = createContextUsageRecorder(options.contextUsageLog)
  const archiveOrder = createChatArchiveOrder()
  // 進行の計測値の記録。代をまたいで持つ（立ち直りまでの手数は起こし直しをまたいで数える）。
  const experienceMetric = createExperienceMetricRecorder(options.experienceMetricLog)
  // 診断ログの足跡。代をまたいで持ち、起こし直しで積み残しを捨てない。
  const diagnostic = createDiagnosticBuffer(options.diagnosticLog, options.batchIntervalMs)
  // 定着が走っているか。代ではなくここに持つ。
  // 起こし直しをまたいでも同時に1本のまま（同じパックへ起こし直した直後に、同じ未定着の行を2本で畳まない）。
  // 走っているあいだの契機は捨てる。
  let consolidating = false
  // プロセスを終えるときに走っている1本を中断する（待たない。書きかけで止まれば追記済みまでが定着）。
  const consolidationAbort = new AbortController()

  const helloFrame = (): ServerFrame => ({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    state,
  })

  /**
   * 状態を差し替える。
   * 記録から消えた依頼の原寸とレポートの画像は、ここで棚から捨てる（窓から落ちた・起こし直して空に戻った）。
   * 状態を書き換えるのはここだけにして、棚の寿命が記録の窓から外れないようにする。
   */
  const replaceState = (next: SessionState): void => {
    if (next.records !== state.records) {
      options.promptImageShelf.release(releasedPromptImageIds(state.records, next.records))
    }
    if (next.records !== state.records || next.pending !== state.pending) {
      options.reportImageShelf.release(releasedImageToolUseIds(state, next))
    }
    state = next
  }

  /**
   * 駆動から届いたイベント1件を畳んで、それを生んだ代の勘定に積む。
   * 見た目の編集で起こした `character-changed` もここを通る（サーバ側の状態とブラウザへ配る内容を1本にする）。
   */
  const receive = (tally: GenerationTally, driven: SessionEvent): void => {
    if (closed || tally.confirmedSettings.isRepeat(driven, state)) {
      return
    }
    tally.confirmedSettings.note(driven)
    const at = options.now()
    // 画像はブラウザがこのレポートや質問を描く前に棚に無いといけないので、束に積む前に置く。
    const event = shelveEventImages(options, state, driven)
    replaceState(applySessionEvent(state, event, at))
    tally.waitingLineAlarm.set(waitingLineDueAt(state))
    if (event.kind !== "token-usage") {
      tally.batch.add({ at, event })
    }
    diagnostic.add({ flow: "session-event", at, generation: tally.generation, kind: event.kind })
    experienceMetric.observe(event, state, at)
    tally.reportChangeCounter.observe(event)
    recordSessionEvent(
      { ...options, contextUsage, diagnostic, archiveOrder },
      tally,
      state,
      event,
      at,
    )
    // 定着を起こす。ターンの終わり（雑談・仕事）で、走っていれば契機を捨てる。待たずに次へ進む。
    const packName = shownCharacterPackName(state.character)
    if (event.kind === "turn-finished" && packName !== undefined) {
      startConsolidation(packName)
    }
  }

  /**
   * そのパックの定着を1本起こす（走っていれば何もしない）。
   * 書くのは起こした時点のパックのファイルで、書けたときの話題の見出しは、そのときの状態が雑談で同じパックのときだけ今の代へ流す。
   * 起こし直しのあとに遅れて届いた結果が、別のパックの画面に混ざらないため。
   */
  const startConsolidation = (packName: CharacterPackName): void => {
    const source = options.chatConsolidation
    if (source.kind === "dont-consolidate" || consolidating) {
      return
    }
    consolidating = true
    const settle = (outcome: ChatConsolidationOutcome): void => {
      consolidating = false
      noteConsolidationOutcome(outcome, diagnostic, options.now)
      if (
        outcome.kind === "written" &&
        !closed &&
        state.chatMode &&
        state.character?.pack === packName
      ) {
        generation.emit({ kind: "chat-topics-changed", topics: outcome.topics })
      }
    }
    const run = async (): Promise<void> => {
      try {
        settle(
          await source.consolidate(packName, consolidationAbort.signal).catch(consolidationThrew),
        )
      } catch (error) {
        consolidating = false
        diagnostic.add(
          swallowedFailureFootprint(
            options.now(),
            { feature: "chat", place: "consolidation-threw" },
            error,
          ),
        )
      }
    }
    void run()
  }

  /** 駆動を1代起こし、その代ぶんの勘定をまとめて作る。 */
  const startGeneration = (
    request: SessionLaunchRequest,
    delivery: "immediate" | "after-hello",
  ): SessionGeneration => {
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
            publish({ type: "events", events }, subscribers)
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
      if (closed || born !== bornCount || events.length === 0) {
        return
      }
      const restoredAt = options.now()
      replaceState(applyRestoredEvents(state, events, restoredAt))
      tally.waitingLineAlarm.set(waitingLineDueAt(state))
      replaceState(shelveRestoredReportImages(options, state, events, restoredAt))
      if (!held) {
        tally.batch.discard()
        publish(helloFrame(), subscribers)
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
        if (closed || born !== bornCount) {
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

  // 起動時は覚えない。その回だけの指定（`TSUKUMO_CHARACTER`）や同梱の既定が次の起動の初期値として残らないように。
  let generation = startGeneration(
    {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "new" },
    },
    "immediate",
  )
  const taskWatcher = options.watchTasks((event) => {
    generation.emit(event)
  })

  /**
   * 駆動を起こし直す。会話が繋がるかどうかは、起こす側が `resume` に何を渡すかで決まる。
   * 画面は初期状態に戻す。吹き出し・立ち絵・メインビューの3つを消して、新しい `hello` を配り直す。
   * 起こし直しの間に届いたイベント（新しい `character-changed`・組み直した履歴など）はその `hello` の状態に入っているので、二重に配らない。
   * 起こし直しに失敗しても常駐プロセスは落とさず、定型文の理由を返すだけ。
   */
  const restart = async (request: SessionLaunchRequest): Promise<DispatchResult> => {
    try {
      generation.close()
      experienceMetric.noteRestart()
      modeSessions = rememberedModeSessions(modeSessions, state, request)
      // 見直しの欄・タスク一覧・おすすめの札は起こし直しをまたいで残す。どれも駆動1代の持ち物ではない。
      replaceState({
        ...INITIAL_SESSION_STATE,
        usageReview: state.usageReview,
        previousUsageReview: state.previousUsageReview,
        usageProposalRun: state.usageProposalRun,
        tasks: state.tasks,
        recommendation: state.recommendation,
      })
      generation = startGeneration(request, "after-hello")
      await generation.driver
      announceGeneration()
      return { ok: true }
    } catch (error) {
      // 起こせなくても、組み直した姿（キャラクター・モード）は `hello` で配り、束も止めたままにしない。
      // 止めたままだと、見た目の編集などで積んだイベントが次の起こし直しまで届かなくなる。
      diagnostic.add(
        swallowedFailureFootprint(options.now(), { feature: "session", place: "restart" }, error),
      )
      announceGeneration()
      return { ok: false, reason: FRAME_ERROR_REASON.driverFailed }
    }
  }

  /** 起こし直した代の姿を `hello` で配り直し、それより前に積んだぶんは捨てて束を配り始める。 */
  const announceGeneration = (): void => {
    generation.batch.discard()
    publish(helloFrame(), subscribers)
    generation.announce()
  }

  // 受け手へ見せる口。代は呼ばれたその時点のものを返す（起こし直しをまたいで持ち回らない）。
  const commandSession: CommandSession = {
    state: () => state,
    modeSession: (chat) => (chat ? modeSessions.chat : modeSessions.work),
    driver: () => generation.driver,
    restart,
    generation: () => ({ emit: generation.emit, diarySignal: generation.diarySignal }),
  }

  return {
    commandSession,
    ...createDriverRead({
      driver: () => generation.driver,
      state: () => state,
      diagnostic,
      now: options.now,
    }),
    refreshTasks: () => taskWatcher.refresh(),
    recordSplit: (release) => {
      if (state.session.kind === "starting") {
        return
      }
      options.experienceMetricLog.append(
        splitEntry(release, state.session.sessionId, options.now()),
      )
    },
    subscribe: (send) => {
      send(helloFrame())
      subscribers.add(send)
      taskWatcher.setWatching(true)
      return () => {
        subscribers.delete(send)
        taskWatcher.setWatching(subscribers.size > 0)
      }
    },
    close: () => {
      closed = true
      subscribers.clear()
      generation.close()
      taskWatcher.close()
      consolidationAbort.abort()
      diagnostic.flush()
    },
  }
}

/**
 * モードを切り替える起こし直しのときだけ、いま出しているセッションをいまのモードの欄へ書く。
 * パックを名指しする起こし直しでは捨てる（セッションの印はパックごとなので、別のパックで続きにできない）。
 */
function rememberedModeSessions(
  modeSessions: ModeSessions,
  state: SessionState,
  request: SessionLaunchRequest,
): ModeSessions {
  if (request.selection.by === "name") {
    return NO_MODE_SESSIONS
  }
  if (
    request.chat === undefined ||
    request.chat === state.chatMode ||
    state.session.kind === "starting"
  ) {
    return modeSessions
  }
  const remembered = { kind: "remembered", sessionId: state.session.sessionId } as const
  return state.chatMode
    ? { ...modeSessions, chat: remembered }
    : { ...modeSessions, work: remembered }
}

function consolidationThrew(error: unknown): ChatConsolidationOutcome {
  return { kind: "failed", reason: "threw", error }
}

/** 購読者全員に配る。閉じかけている接続を無視するのは送る側の仕事。 */
function publish(frame: ServerFrame, subscribers: ReadonlySet<(frame: ServerFrame) => void>): void {
  for (const send of subscribers) {
    send(frame)
  }
}
