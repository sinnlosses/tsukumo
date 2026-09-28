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
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../shared/context-usage/context-usage.ts"
import { FRAME_ERROR_REASON, PROTOCOL_VERSION, type ServerFrame } from "../../../shared/frame.ts"
import {
  type PlanUsageReport,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../shared/plan-usage/plan-usage.ts"
import {
  type SessionDigest,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../shared/session/session-state.ts"
import type {
  PreviousUsageReview,
  UsageReviewFindings,
} from "../../../shared/usage-review/usage-review.ts"
import {
  appendChatArchiveConclusion,
  appendChatArchiveEntry,
} from "../../chat/core/chat-archive-entry.ts"
import type { ChatConsolidationSource } from "../../chat/core/chat-consolidation-writer.ts"
import {
  type ContextUsageLog,
  createContextUsageRecorder,
} from "../../context-usage/core/context-usage.ts"
import type { DispatchResult } from "../../core/command-receiver.ts"
import { type ReportUsageLog, reportUsageEntryOf } from "../../report/core/report-usage.ts"
import {
  type PromptImageShelf,
  releasedPromptImageIds,
} from "../../session-driver/core/prompt-image-shelf.ts"
import type { ChatArchive, SessionDriver } from "../../session-driver/core/session-driver.ts"
import {
  createTokenUsageRecorder,
  type TokenUsageLog,
  type TokenUsageRecorder,
} from "../../token-usage/core/token-usage.ts"
import { createVisitWatch, type VisitPorts, type VisitWatch } from "../../visit/core/visit-watch.ts"
import type { CommandSession } from "./command-session.ts"
import { createEventBatch, type EventBatch } from "./event-batch.ts"
import type { SessionLaunchRequest } from "./session-launch.ts"

export type SessionManagerOptions = {
  /** 現在時刻（エポックミリ秒）を返す関数（呼び出し側が時計を渡す。テストは偽の時計を渡す）。 */
  readonly now: () => number
  /** イベントをまとめる間隔（ミリ秒）。既定は `EVENT_BATCH_INTERVAL_MS`。 */
  readonly batchIntervalMs: number
  /** 会話のアーカイブの書き込み口（雑談と仕事の両方が書く）。 */
  readonly chatArchive: ChatArchive
  /**
   * 仕事の行に付ける `project`（アーカイブの `docs/architecture/chat-mode.md`「雑談の会話のアーカイブ」）。
   * リポジトリの名前だけで、パスは持たない。起動時に1回だけ配線層が取って渡す。
   */
  readonly project: string
  /**
   * 定着の出どころ（`ChatConsolidationSource`）。疑似セッションでは `dont-consolidate`。
   * いつ起こすか（雑談の駆動由来のターンの終わり）と、同時に1本に絞るのはここ。
   */
  readonly chatConsolidation: ChatConsolidationSource
  /**
   * トークン消費の書き込み口。
   * 前の `result` からの増分を出すのは {@link TokenUsageRecorder}（駆動1代ぶんの持ち物として前回の累計を覚えている）で、渡した先は「どこに・どんな形で書くか」しか持たない。
   */
  readonly tokenUsageLog: TokenUsageLog
  /**
   * コンテキストの内訳の書き込み口。
   * セッション1つにつき1行で、いつ書くか（＝そのセッションでまだ書いていない最初のターンの終わり）を決めるのは `createContextUsageRecorder` が返す係。
   * 渡した先は「どこに・どんな形で書くか」しか持たない。
   */
  readonly contextUsageLog: ContextUsageLog
  /** 描いた `report` 1回につき1行、塊の使われ方を書く口。 */
  readonly reportUsageLog: ReportUsageLog
  /**
   * 依頼に添えた画像の原寸の棚。`/prompt-image/<id>` で配る側と同じ棚を渡すこと。
   * 置くのと捨てるのはここで、`prompt` を受けたときに置き、記録から依頼が消えたときに捨てる。
   */
  readonly promptImageShelf: PromptImageShelf
  /**
   * セッションを1つ起こす（起こし直しも含む）一続き。
   * 駆動を起こすだけでなく、パックを決めて続きを探し、復元した履歴を流すところまでを1つでやる（`createSessionLaunch` が実体）。
   * ここは駆動の種類（SDK か fake driver か）を知らない。
   *
   * 受け口は2つ。`onEvent` は駆動（と見張り）から新しく届くイベント、`onRestoredEvent` は前のセッションの記録を組み直した再生だけが通る。
   *
   * 知らない名前のときに何を起こすかも、名前を覚えるかどうかも呼び出し側が決める。
   */
  readonly launchSession: (
    onEvent: (event: SessionEvent) => void,
    onRestoredEvent: (event: SessionEvent) => void,
    request: SessionLaunchRequest,
  ) => Promise<SessionDriver>
  /**
   * ホームに残っている前回の見直しの結果。
   * 起こしたときに1回だけ読み、初期の姿（{@link SessionState.previousUsageReview}）に載せる。
   */
  readonly readPreviousUsageReview: () => PreviousUsageReview
  /**
   * 見直しの結果を、次の起動でも「前回の提案」として配れるようにホームへ書く。
   * 駆動由来（`"driver"`）の `usage-review-result` を畳んだときだけ呼ぶ。
   */
  readonly writePreviousUsageReview: (reviewedAt: number, findings: UsageReviewFindings) => void
  /**
   * 訪問の見張りに渡す口（しきい値・時計・客の候補・乱数。`VisitPorts`）。
   * 見張りは代ごとに1つ作る（{@link GenerationTally.visit}）。
   */
  readonly visit: VisitPorts
}

/**
 * セッション1つぶんの持ち物。起こした時点で駆動も起こし始める。
 * `create` の段は無い（1プロセスが持つセッションは1つで、切り替えは中で起こし直す）。
 */
export type SessionManager = {
  /** コマンドの受け手に見せる口。代は呼ばれたその時点のものを返す。 */
  readonly commandSession: CommandSession
  /**
   * いまのコンテキストの内訳を駆動から取る。
   * 押すのではなく引くので、状態にもフレームにも乗らない。取れなかったときは「取れない」。
   */
  readonly readContextUsage: () => Promise<ContextUsageReport>
  /**
   * いまの利用枠を駆動から取る。
   * 押すのではなく引くので、状態にもフレームにも乗らない。取れなかったときは「取れない」。
   */
  readonly readPlanUsage: () => Promise<PlanUsageReport>
  /**
   * セッション1件の中身を駆動から取る。
   * 読んでよいのは、いま配っている一覧（`sessions-changed`）に載ったものと、いま出しているセッションだけ。
   * 画面から届いたIDでよその transcript を読まない。
   * それ以外と、取れなかったときは「読めない」。
   */
  readonly readSessionDigest: (sessionId: string) => Promise<SessionDigest>
  /** 接続を購読に加える。まず `hello` を1つ送ってから加え、外すための関数を返す。 */
  readonly subscribe: (send: (frame: ServerFrame) => void) => () => void
  /** 駆動を閉じる（プロセスを終えるとき。claude の子プロセスを残さないため必ず呼ぶ）。 */
  readonly close: () => void
}

/** `receive` に渡るイベントが「駆動から新しく届いたか（`"driver"`）、復元の再生か（`"restored"`）」の印。 */
type EventOrigin = "driver" | "restored"

/**
 * 駆動1代ぶんの勘定。
 * イベントを受けるときに見るのはここだけなので、届いたイベントは必ずそれを生んだ代の勘定に積まれる（起こし直しをまたいで混ざらない）。
 */
type GenerationTally = {
  /** まとめて配る束（代をまたいで積み残しを配らない）。 */
  readonly batch: EventBatch
  /** トークンの累計と、いま進んでいるターンの内訳。 */
  readonly tokenUsage: TokenUsageRecorder
  /**
   * 起き上がった駆動。閉じるのを待たないために値でも持つ。
   * プロセスの終了は `process.exit` ですぐ進むので、待っていると claude の子プロセスが閉じられずに残る。
   * まだ起き上がっていない・起こせなかったときは `undefined`。
   */
  readonly liveDriver: () => SessionDriver | undefined
  /** 訪問の見張り（待ちの勘定と掛けた時計。起こし直すと一緒に捨てる）。 */
  readonly visit: VisitWatch
  /** 振り返りの書き手を中断する信号。起こし直しで代を閉じたら、書いている最中の問い合わせも中断する。 */
  readonly diarySignal: AbortSignal
  /** そのターンで最後に届いた `report` の結論を預かる入れ物（仕事のときだけ使う）。 */
  readonly pendingConclusion: PendingConclusion
}

/**
 * そのターンで最後に届いた `report` の結論を代の勘定に預ける入れ物。
 * 途中の `report` は上書きするだけで、`turn-finished` で読み出して空に戻す
 * （`report` 無しで終わったターンは預けたものが残らず、次のターンへ持ち越さない）。
 */
type PendingConclusion = {
  readonly hold: (conclusion: string) => void
  readonly takeAndClear: () => string | undefined
}

function createPendingConclusion(): PendingConclusion {
  let current: string | undefined = undefined
  return {
    hold: (conclusion) => {
      current = conclusion
    },
    takeAndClear: () => {
      const conclusion = current
      current = undefined
      return conclusion
    },
  }
}

/**
 * 駆動1代ぶんの持ち物。起こし直しはこれを丸ごと作り直すことで、代のあいだだけ意味のある勘定を1つずつ手で空へ戻さない。
 * 代をまたいで残るもの（購読者・棚・コンテキストの内訳を書いたセッションID）はここに入れない。
 */
type SessionGeneration = GenerationTally & {
  /** 駆動が起き上がるのを待つ口（コマンドを渡す側が待つ）。 */
  readonly driver: Promise<SessionDriver>
  /** 駆動を閉じ、積み残したイベントを捨てる。 */
  readonly close: () => void
  /** 新しい `hello` を配り終えたと知らせ、束を配り始める（起こし直しの代だけが待っている）。 */
  readonly announce: () => void
  /**
   * この代が生きているあいだだけイベントを畳む（駆動由来と同じ扱い）。代を閉じたあとに呼んでも黙って捨てる。
   * 長く続く非同期の処理が、あとから届いたイベントをこの代に固定して流すための口。
   */
  readonly emit: (event: SessionEvent) => void
}

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
  // 何代目まで起こしたか。閉じた駆動があとから投げてくるイベントを捨てるための印。
  // 起こし直したとき、前の駆動の最後のイベントが新しい状態に混ざらない。
  let bornCount = 0
  // コンテキストの内訳の記録。代をまたいで持つ（世代の持ち物には入れない）。
  // 続きから起こして同じIDになったときは同じセッションなので、2行目を書かない。
  const contextUsage = createContextUsageRecorder(options.contextUsageLog)
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
   * 記録から消えた依頼の原寸は、ここで棚から捨てる（窓から落ちた・起こし直して空に戻った。`releasedPromptImageIds`）。
   * 状態を書き換えるのはここだけにして、棚の寿命が記録の窓から外れないようにする。
   */
  const replaceState = (next: SessionState): void => {
    if (next.records !== state.records) {
      options.promptImageShelf.release(releasedPromptImageIds(state.records, next.records))
    }
    state = next
  }

  /**
   * イベント1件を畳んで、それを生んだ代の勘定に積む。
   * 駆動から届いたものと、見た目の編集で起こした `character-changed` の両方がここを通る（サーバ側の状態とブラウザへ配る内容を1本にする）。
   *
   * 畳み方と配り方は `origin` によらず同じ。
   * 分かれているのは、会話のアーカイブへ書くのを駆動由来の依頼・セリフ・結論だけに絞るため（復元で流し直されたぶんまで書くと、起こし直すたびに同じ行が二重に積まれる）。
   */
  const receive = (tally: GenerationTally, event: SessionEvent, origin: EventOrigin): void => {
    if (closed) {
      return
    }
    const at = options.now()
    replaceState(applySessionEvent(state, event, at))
    tally.batch.add({ at, event })
    // 会話のアーカイブへ1行足す。駆動由来（`"driver"`）・パックが分かっているときだけ。
    if (origin === "driver") {
      appendChatArchiveEntry(
        options.chatArchive,
        state.character?.pack,
        state.chatMode ? "chat" : "work",
        options.project,
        at,
        event,
      )
    }
    // 仕事のターンの結論を、代の勘定に預けて上書きする（`turn-finished` で読み出す）。
    if (origin === "driver" && event.kind === "report") {
      tally.pendingConclusion.hold(event.conclusion)
    }
    // ターンの中の内訳（ツール別・持ち場別）を積む。駆動由来（`"driver"`）だけ。
    // 復元の再生は前のセッションで使ったぶんなので、いまのターンに数えない。
    if (origin === "driver") {
      tally.tokenUsage.tally(event)
    }
    // そのターンのトークン消費を1行書く。駆動由来（`"driver"`）だけ。
    // 復元の再生には使用量が乗らないし、乗せても同じターンを二度数えることになる。
    if (origin === "driver" && event.kind === "token-usage") {
      tally.tokenUsage.append(event.cumulative, at, state)
    }
    // トークン消費の内訳を、1ターンぶんだけ持つところから捨てる（次のターンでまた0から数える）。
    // `token-usage` は `turn-finished` より先に届く（変換する側が `result` 1つをこの順に変換する）ので、書き終えたあとに捨てることになる。
    // 見直しの結果を、次の起動でも「前回の提案」として配れるようにホームへ書く。駆動由来（`"driver"`）だけ。
    if (origin === "driver" && event.kind === "usage-review-result") {
      options.writePreviousUsageReview(at, event.findings)
    }
    // 復元の再生は前のセッションで描いたぶんなので数えない。
    // セッションIDが決まる前の行は、どのセッションのものか分からなくなるので書かない。
    if (origin === "driver" && event.kind === "report" && state.session.kind !== "starting") {
      options.reportUsageLog.append(reportUsageEntryOf(event, state.session.sessionId, at))
    }
    if (origin === "driver" && event.kind === "turn-finished") {
      tally.tokenUsage.finishTurn()
      // コンテキストの内訳はセッションに1行なので、まだ書いていなければ問い合わせる。
      // 待たずに次へ進む（ターンの終わりを遅らせない）。駆動がまだ無い回は次のターンで揃う。
      const driver = tally.liveDriver()
      if (driver !== undefined) {
        void contextUsage.recordOnce(state, at, driver)
      }
      // 仕事のときだけ、預けておいた結論を1行書く。`report` 無しで終わったターンは何も足さない。
      const conclusion = tally.pendingConclusion.takeAndClear()
      if (!state.chatMode && conclusion !== undefined) {
        appendChatArchiveConclusion(
          options.chatArchive,
          state.character?.pack,
          options.project,
          at,
          conclusion,
        )
      }
    }
    // 定着を起こす。雑談の駆動由来のターンの終わりだけで、走っていれば契機を捨てる。待たずに次へ進む。
    if (origin === "driver" && event.kind === "turn-finished" && state.chatMode) {
      startConsolidation(state.character?.pack)
    }
    // 訪問の出入りを決める。駆動由来だけ（復元の再生は前のセッションの待ち）。
    // 見張りが出した訪問のイベントもこの受け口へ戻ってくる（`createVisitWatch`）。
    if (origin === "driver") {
      tally.visit.observe(event, at)
    }
  }

  /**
   * そのパックの定着を1本起こす（走っていれば何もしない）。
   * 書くのは起こした時点のパックのファイルで、書けたときの話題の見出しは、そのときの状態が雑談で同じパックのときだけ今の代へ流す。
   * 起こし直しのあとに遅れて届いた結果が、別のパックの画面に混ざらないため。
   */
  const startConsolidation = (packName: string | undefined): void => {
    const source = options.chatConsolidation
    if (source.kind === "dont-consolidate" || packName === undefined || consolidating) {
      return
    }
    consolidating = true
    void source.consolidate(packName, consolidationAbort.signal).then((outcome) => {
      consolidating = false
      if (
        outcome.kind === "written" &&
        !closed &&
        state.chatMode &&
        state.character?.pack === packName
      ) {
        generation.emit({ kind: "chat-topics-changed", topics: outcome.topics })
      }
    })
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
    // 駆動が起き上がるまでの数秒に流れたイベント（`chat-mode-changed` など）を先に配ると、ブラウザは前のセッションの姿のまま雑談 / 仕事へ切り替わり、前の立ち絵が一瞬出てから `hello` で入れ替わる。
    // その間の姿は `hello` に入るので、配らずに捨ててよい。
    let held = delivery === "after-hello"
    const diaryAbort = new AbortController()
    const tally: GenerationTally = {
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
      visit: createVisitWatch({
        ...options.visit,
        now: options.now,
        readState: () => state,
        emit: (event) => {
          receiveIfCurrent(event, "driver")
        },
      }),
      diarySignal: diaryAbort.signal,
      pendingConclusion: createPendingConclusion(),
    }
    const receiveIfCurrent = (event: SessionEvent, origin: EventOrigin): void => {
      if (born !== bornCount) {
        return
      }
      receive(tally, event, origin)
    }

    const driver = options.launchSession(
      (event) => {
        receiveIfCurrent(event, "driver")
      },
      (event) => {
        receiveIfCurrent(event, "restored")
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
        tally.visit.close()
        diaryAbort.abort()
      },
      announce: () => {
        held = false
      },
      emit: (event) => {
        receiveIfCurrent(event, "driver")
      },
    }
  }

  // 起動時は覚えない。その回だけの指定（`TSUKUMO_CHARACTER`）や同梱の既定が次の起動の初期値として残らないように。
  let generation = startGeneration(
    {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    },
    "immediate",
  )

  /**
   * 駆動を起こし直す。会話が繋がるかどうかは、起こす側が `resume` に何を渡すかで決まる。
   * 画面は初期状態に戻す。吹き出し・立ち絵・メインビューの3つを消して、新しい `hello` を配り直す。
   * 起こし直しの間に届いたイベント（新しい `character-changed`・組み直した履歴など）はその `hello` の状態に入っているので、二重に配らない。
   * 起こし直しに失敗しても常駐プロセスは落とさず、定型文の理由を返すだけ。
   */
  const restart = async (request: SessionLaunchRequest): Promise<DispatchResult> => {
    try {
      generation.close()
      // `previousUsageReview` だけは起こし直しをまたいで残す。
      // ホームのファイルに残る記録であって、駆動1代の持ち物ではない（`usageReview` は起こし直すとふだんへ戻る）。
      replaceState({ ...INITIAL_SESSION_STATE, previousUsageReview: state.previousUsageReview })
      generation = startGeneration(request, "after-hello")
      await generation.driver
      announceGeneration()
      return { ok: true }
    } catch {
      // 起こせなくても、組み直した姿（キャラクター・モード）は `hello` で配り、束も止めたままにしない。
      // 止めたままだと、見た目の編集などで積んだイベントが次の起こし直しまで届かなくなる。
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
    driver: () => generation.driver,
    restart,
    generation: () => ({ emit: generation.emit, diarySignal: generation.diarySignal }),
  }

  return {
    commandSession,
    readContextUsage: async () => {
      // 起こし直しの最中・起こせなかったときは駆動そのものが無い。画面の札が1枚出ないだけで、常駐プロセスは落とさない。
      try {
        const started = await generation.driver
        return await started.readContextUsage()
      } catch {
        return UNAVAILABLE_CONTEXT_USAGE
      }
    },
    readPlanUsage: async () => {
      // 起こし直しの最中・起こせなかったときは駆動そのものが無い。
      try {
        const started = await generation.driver
        return await started.readPlanUsage()
      } catch {
        return UNAVAILABLE_PLAN_USAGE
      }
    },
    readSessionDigest: async (sessionId) => {
      if (!isReadableSession(state, sessionId)) {
        return UNAVAILABLE_SESSION_DIGEST
      }
      try {
        const started = await generation.driver
        return await started.readSessionDigest(sessionId)
      } catch {
        return UNAVAILABLE_SESSION_DIGEST
      }
    },
    subscribe: (send) => {
      send(helloFrame())
      subscribers.add(send)
      return () => {
        subscribers.delete(send)
      }
    },
    close: () => {
      closed = true
      subscribers.clear()
      generation.close()
      consolidationAbort.abort()
    },
  }
}

/** 画面から中身を頼まれてよいセッションか（一覧に載ったものか、いま出しているもの）。 */
function isReadableSession(state: SessionState, sessionId: string): boolean {
  return (
    state.sessions.some((session) => session.sessionId === sessionId) ||
    (state.session.kind !== "starting" && state.session.sessionId === sessionId)
  )
}

/** 購読者全員に配る。閉じかけている接続を無視するのは送る側の仕事。 */
function publish(frame: ServerFrame, subscribers: ReadonlySet<(frame: ServerFrame) => void>): void {
  for (const send of subscribers) {
    send(frame)
  }
}
