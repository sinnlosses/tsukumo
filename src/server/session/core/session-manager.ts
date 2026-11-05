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

import { swallowedFailureFootprint } from "../../../shared/diagnostic/swallowed-failure.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame-error-reason.ts"
import { PROTOCOL_VERSION, type ServerFrame } from "../../../shared/frame.ts"
import { INITIAL_SESSION_STATE } from "../../../shared/session/session-state.ts"
import { createChatArchiveOrder } from "../../chat/core/archive/chat-archive-order.ts"
import type { DispatchResult } from "../../core/command-receiver.ts"
import { createDiagnosticBuffer } from "../../diagnostic/core/diagnostic.ts"
import { createContextUsageRecorder } from "../../usage/core/context-usage.ts"
import {
  createExperienceMetricRecorder,
  splitEntry,
} from "../../usage/core/experience/experience-metric.ts"
import type { CommandSession, SessionLaunchRequest } from "./command-session-port.ts"
import { type ModeSessions, NO_MODE_SESSIONS, rememberedModeSessions } from "./command-session.ts"
import { createSessionConsolidation } from "./session-consolidation.ts"
import { createDriverRead } from "./session-driver-read.ts"
import { createGenerationStart } from "./session-generation-start.ts"
import type { SessionManager, SessionManagerOptions } from "./session-manager-port.ts"
import { createSessionStateBox } from "./session-state-box.ts"

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const subscribers = new Set<(frame: ServerFrame) => void>()
  // 前回の見直しの結果だけ、起こしたときにホームから読んで載せる。
  // `INITIAL_SESSION_STATE` は静的な定数なので、実行時の値をここで1回だけ差し込む。
  const stateBox = createSessionStateBox(
    {
      ...INITIAL_SESSION_STATE,
      previousUsageReview: options.readPreviousUsageReview(),
    },
    options,
  )
  // 閉じたあとに駆動が投げてくるイベントは捨てる（配る先がもう無いのにタイマーを立てない）。
  let closed = false
  // 起こし直しをまたいで持つ（状態に入れないのでブラウザへは配らない）。
  let modeSessions: ModeSessions = NO_MODE_SESSIONS
  // 診断ログの足跡。代をまたいで持ち、起こし直しで積み残しを捨てない。
  const diagnostic = createDiagnosticBuffer(options.diagnosticLog, options.batchIntervalMs)
  // 進行の計測値の記録。代をまたいで持つ（立ち直りまでの手数は起こし直しをまたいで数える）。
  const experienceMetric = createExperienceMetricRecorder(options.experienceMetricLog)
  const consolidation = createSessionConsolidation({
    source: options.chatConsolidation,
    diagnostic,
    now: options.now,
    state: stateBox.current,
    isClosed: () => closed,
    emit: (event) => {
      generation.emit(event)
    },
  })

  const helloFrame = (): ServerFrame => ({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    state: stateBox.current(),
  })
  const broadcast = (frame: ServerFrame): void => {
    publish(frame, subscribers)
  }

  const startGeneration = createGenerationStart({
    options,
    stateBox,
    isClosed: () => closed,
    broadcast,
    helloFrame,
    diagnostic,
    experienceMetric,
    // コンテキストの内訳の記録。代をまたいで持つ（世代の持ち物には入れない）。
    // 続きから起こして同じIDになったときは同じセッションなので、2行目を書かない。
    contextUsage: createContextUsageRecorder(options.contextUsageLog),
    archiveOrder: createChatArchiveOrder(),
    startConsolidation: consolidation.start,
  })

  // 起動時は覚えない。その回だけの指定（`TSUKUMO_CHARACTER`）や同梱の既定が次の起動の初期値として残らないように。
  let generation = startGeneration(
    {
      selection: { by: "initial" },
      chat: false,
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
      const state = stateBox.current()
      modeSessions = rememberedModeSessions(modeSessions, state, request)
      // ここに並べるものは起こし直しをまたいで残す。どれも駆動1代の持ち物ではない。
      stateBox.replace({
        ...INITIAL_SESSION_STATE,
        usageReview: state.usageReview,
        previousUsageReview: state.previousUsageReview,
        usageProposalRun: state.usageProposalRun,
        tasks: state.tasks,
        recommendation: state.recommendation,
        chatConsolidationHalt: state.chatConsolidationHalt,
      })
      generation = startGeneration(request, "after-hello")
      await generation.driver
      announceGeneration()
      return { kind: "ok" }
    } catch (error) {
      // 起こせなくても、組み直した姿（キャラクター・モード）は `hello` で配り、束も止めたままにしない。
      // 止めたままだと、見た目の編集などで積んだイベントが次の起こし直しまで届かなくなる。
      diagnostic.add(
        swallowedFailureFootprint(options.now(), { feature: "session", place: "restart" }, error),
      )
      announceGeneration()
      return { kind: "failed", reason: FRAME_ERROR_REASON.driverFailed }
    }
  }

  /** 起こし直した代の姿を `hello` で配り直し、それより前に積んだぶんは捨てて束を配り始める。 */
  const announceGeneration = (): void => {
    generation.batch.discard()
    broadcast(helloFrame())
    generation.announce()
  }

  // 受け手へ見せる口。代は呼ばれたその時点のものを返す（起こし直しをまたいで持ち回らない）。
  const commandSession: CommandSession = {
    state: stateBox.current,
    modeSession: (chat) => (chat ? modeSessions.chat : modeSessions.work),
    driver: () => generation.driver,
    restart,
    generation: () => ({
      emit: generation.emit,
      diarySignal: generation.diarySignal,
    }),
  }

  return {
    commandSession,
    ...createDriverRead({
      driver: () => generation.driver,
      state: stateBox.current,
      diagnostic,
      now: options.now,
    }),
    refreshTasks: () => taskWatcher.refresh(),
    recordSplit: (release) => {
      const state = stateBox.current()
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
      consolidation.abort()
      diagnostic.flush()
    },
  }
}

/** 購読者全員に配る。閉じかけている接続を無視するのは送る側の仕事。 */
function publish(frame: ServerFrame, subscribers: ReadonlySet<(frame: ServerFrame) => void>): void {
  for (const send of subscribers) {
    send(frame)
  }
}
