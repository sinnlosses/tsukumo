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
import { swallowedFailureFootprint } from "../../../shared/diagnostic/swallowed-failure.ts"
import { FRAME_ERROR_REASON, PROTOCOL_VERSION, type ServerFrame } from "../../../shared/frame.ts"
import {
  type PlanUsageReport,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../shared/plan-usage/plan-usage.ts"
import { conclusionWithTaskName } from "../../../shared/report/report-task.ts"
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
import type { ChatArchive } from "../../chat/core/chat-archive-port.ts"
import type {
  ChatConsolidationOutcome,
  ChatConsolidationSource,
} from "../../chat/core/chat-consolidation-writer.ts"
import {
  type ContextUsageLog,
  createContextUsageRecorder,
} from "../../context-usage/core/context-usage.ts"
import type { DispatchResult } from "../../core/command-receiver.ts"
import { createDiagnosticBuffer, type DiagnosticLog } from "../../diagnostic/core/diagnostic.ts"
import {
  createExperienceMetricRecorder,
  type ExperienceMetricLog,
} from "../../experience-metric/core/experience-metric.ts"
import { questionImagePaths } from "../../report/core/question-image-path.ts"
import {
  type ReadReportImage,
  releasedImageToolUseIds,
  type ReportImageShelf,
  reportImagePaths,
} from "../../report/core/report-image-shelf.ts"
import { type ReportUsageLog, reportUsageEntryOf } from "../../report/core/report-usage.ts"
import {
  type PromptImageShelf,
  releasedPromptImageIds,
} from "../../session-driver/core/prompt-image-shelf.ts"
import {
  type QuestionUsageLog,
  questionUsageEntriesOf,
} from "../../session-driver/core/question-usage.ts"
import type { SessionDriver } from "../../session-driver/core/session-driver.ts"
import {
  createTokenUsageRecorder,
  type TokenUsageLog,
  type TokenUsageRecorder,
} from "../../token-usage/core/token-usage.ts"
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
   * いつ起こすか（駆動由来のターンの終わり。雑談・仕事とも）と、プロセスの中で1本に絞るのはここ。
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
  /** 体験の数の書き込み口。何を1行にするかは `createExperienceMetricRecorder` が返す係が決める。 */
  readonly experienceMetricLog: ExperienceMetricLog
  /** 診断ログの書き込み口。畳んだイベントの種類・時刻・駆動の代だけを1件ずつ渡す。 */
  readonly diagnosticLog: DiagnosticLog
  /** 描いた `report` 1回につき1行、塊の使われ方を書く口。 */
  readonly reportUsageLog: ReportUsageLog
  /** 答えが確定した質問1件につき1行、選択肢の数と preview の付いた数を書く口。 */
  readonly questionUsageLog: QuestionUsageLog
  /**
   * 依頼に添えた画像の原寸の棚。`/prompt-image/<id>` で配る側と同じ棚を渡すこと。
   * 置くのと捨てるのはここで、`prompt` を受けたときに置き、記録から依頼が消えたときに捨てる。
   */
  readonly promptImageShelf: PromptImageShelf
  /**
   * `image` の塊と質問の preview の画像の棚。`/report-image/` で配る側と同じ棚を渡すこと。
   * 駆動から届いた `report` と新しく積まれた質問を受けたときに置き（続きから復元した再生では置かない）、記録にも答え待ちにも無くなったときに捨てる。
   */
  readonly reportImageShelf: ReportImageShelf
  /** `image` の塊と質問の preview の画像のパスを読む口（cwd から解く）。 */
  readonly readReportImage: ReadReportImage
  /**
   * セッションを1つ起こす（起こし直しも含む）一続き。
   * 駆動を起こすだけでなく、パックを決めて続きを探し、復元した履歴を流すところまでを1つでやる（`createSessionLaunch` が実体）。
   * ここは駆動の種類（SDK か fake driver か）を知らない。
   *
   * 受け口は2つ。`onEvent` は駆動（と見張り）から新しく届くイベント、`onRestoredEvents` は前のセッションの記録を組み直した再生だけを、まとめて1回で受ける。
   *
   * 知らない名前のときに何を起こすかも、名前を覚えるかどうかも呼び出し側が決める。
   */
  readonly launchSession: (
    onEvent: (event: SessionEvent) => void,
    onRestoredEvents: (events: readonly SessionEvent[]) => void,
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
   * 作業ディレクトリのタスク一覧の見張りを起こす。起こし直しをまたいで1つだけ動き、閉じるまで続く。
   * 流すイベントは、そのときの代の駆動のイベントと同じ扱いで畳む。
   */
  readonly watchTasks: (onEvent: (event: SessionEvent) => void) => SessionWatcher
}

/** 閉じるまで生きている見張り。 */
type SessionWatcher = {
  readonly close: () => void
  /** 画面が1つでも購読しているあいだだけ真にする（動かすのは見張りが要るあいだだけ）。 */
  readonly setWatching: (watching: boolean) => void
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

/**
 * 駆動1代ぶんの勘定。
 * イベントを受けるときに見るのはここだけなので、届いたイベントは必ずそれを生んだ代の勘定に積まれる（起こし直しをまたいで混ざらない）。
 */
type GenerationTally = {
  /** プロセスを起こしてから何代目か（1から）。 */
  readonly generation: number
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

const CONSOLIDATION_FAILURE_PLACES = {
  aborted: "consolidation-aborted",
  threw: "consolidation-threw",
  "unreadable-result": "consolidation-unreadable-result",
  "summary-write": "consolidation-summary-write",
} as const satisfies Record<string, string>

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
  // 体験の数の記録。代をまたいで持つ（立ち直りまでの手数は起こし直しをまたいで数える）。
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
  const receive = (tally: GenerationTally, event: SessionEvent): void => {
    if (closed) {
      return
    }
    const at = options.now()
    // 画像はブラウザがこのレポートや質問を描く前に棚に無いといけないので、束に積む前に置く。
    if (event.kind === "report") {
      options.reportImageShelf.shelve(
        event.toolUseId,
        reportImagePaths(event.sections),
        options.readReportImage,
      )
    }
    if (event.kind === "pending-changed") {
      const known = new Set(state.pending.map((ask) => ask.id))
      for (const ask of event.pending) {
        if (ask.kind === "question" && !known.has(ask.id)) {
          options.reportImageShelf.shelve(
            ask.id,
            questionImagePaths(ask.questions),
            options.readReportImage,
          )
        }
      }
    }
    replaceState(applySessionEvent(state, event, at))
    tally.batch.add({ at, event })
    diagnostic.add({ flow: "session-event", at, generation: tally.generation, kind: event.kind })
    experienceMetric.observe(event, state, at)
    // 会話のアーカイブへ1行足す（パックが分かっているときだけ）。
    appendChatArchiveEntry(
      options.chatArchive,
      state.character?.pack,
      state.chatMode ? "chat" : "work",
      options.project,
      at,
      event,
    )
    // 仕事のターンの結論を、代の勘定に預けて上書きする（`turn-finished` で読み出す）。
    if (event.kind === "report") {
      tally.pendingConclusion.hold(conclusionWithTaskName(event.conclusion, event.task))
    }
    // ターンの中の内訳（ツール別・持ち場別）を積む。
    tally.tokenUsage.tally(event)
    // そのターンのトークン消費を1行書く。
    if (event.kind === "token-usage") {
      tally.tokenUsage.append(event.cumulative, at, state)
    }
    // トークン消費の内訳を、1ターンぶんだけ持つところから捨てる（次のターンでまた0から数える）。
    // `token-usage` は `turn-finished` より先に届く（変換する側が `result` 1つをこの順に変換する）ので、書き終えたあとに捨てることになる。
    // 見直しの結果を、次の起動でも「前回の提案」として配れるようにホームへ書く。
    if (event.kind === "usage-review-result") {
      options.writePreviousUsageReview(at, event.findings)
    }
    // セッションIDが決まる前の行は、どのセッションのものか分からなくなるので書かない。
    if (event.kind === "report" && state.session.kind !== "starting") {
      options.reportUsageLog.append(reportUsageEntryOf(event, state.session.sessionId, at))
    }
    if (event.kind === "question-answered" && state.session.kind !== "starting") {
      for (const entry of questionUsageEntriesOf(event.questions, state.session.sessionId, at)) {
        options.questionUsageLog.append(entry)
      }
    }
    if (event.kind === "turn-finished") {
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
    // 定着を起こす。ターンの終わり（雑談・仕事）で、走っていれば契機を捨てる。待たずに次へ進む。
    if (event.kind === "turn-finished") {
      startConsolidation(state.character?.pack)
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
    const reject = (error: unknown): ChatConsolidationOutcome => ({
      kind: "failed",
      reason: "threw",
      error,
    })
    void source
      .consolidate(packName, consolidationAbort.signal)
      .catch(reject)
      .then((outcome) => {
        consolidating = false
        if (outcome.kind === "failed") {
          diagnostic.add(
            swallowedFailureFootprint(
              options.now(),
              { feature: "chat", place: CONSOLIDATION_FAILURE_PLACES[outcome.reason] },
              outcome.reason === "threw" ? outcome.error : undefined,
            ),
          )
        }
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
    }
    const receiveIfCurrent = (event: SessionEvent): void => {
      if (born !== bornCount) {
        return
      }
      receive(tally, event)
    }
    /**
     * 前のセッションの記録を組み直した再生を、まとめて1回で畳む。
     * 再生は畳むだけで、アーカイブ・トークン・コンテキスト・report の記録・定着には数えない。
     * 時刻は1つだけ読む（記録の側は末尾の `history-restored` が「時刻が分からない」に書き換える）。
     *
     * 束には積まず、配るのは畳んだあとの姿の `hello`。束に残っていたぶんはその姿に入っているので捨てる。
     * 起こし直しの代は `announceGeneration` が `hello` を配るので、ここでは配らない。
     */
    const receiveRestoredIfCurrent = (events: readonly SessionEvent[]): void => {
      if (closed || born !== bornCount || events.length === 0) {
        return
      }
      const at = options.now()
      replaceState(events.reduce((next, event) => applySessionEvent(next, event, at), state))
      if (!held) {
        tally.batch.discard()
        publish(helloFrame(), subscribers)
      }
    }

    const driver = options.launchSession(
      (event) => {
        receiveIfCurrent(event)
      },
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
      resume: { by: "latest" },
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
      // `previousUsageReview`・タスク一覧・おすすめの札は起こし直しをまたいで残す。
      // どれも駆動1代の持ち物ではない（`usageReview` は起こし直すとふだんへ戻る）。
      replaceState({
        ...INITIAL_SESSION_STATE,
        previousUsageReview: state.previousUsageReview,
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
      } catch (error) {
        diagnostic.add(
          swallowedFailureFootprint(
            options.now(),
            { feature: "session", place: "read-context-usage" },
            error,
          ),
        )
        return UNAVAILABLE_CONTEXT_USAGE
      }
    },
    readPlanUsage: async () => {
      // 起こし直しの最中・起こせなかったときは駆動そのものが無い。
      try {
        const started = await generation.driver
        return await started.readPlanUsage()
      } catch (error) {
        diagnostic.add(
          swallowedFailureFootprint(
            options.now(),
            { feature: "session", place: "read-plan-usage" },
            error,
          ),
        )
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
      } catch (error) {
        diagnostic.add(
          swallowedFailureFootprint(
            options.now(),
            { feature: "session", place: "read-session-digest" },
            error,
          ),
        )
        return UNAVAILABLE_SESSION_DIGEST
      }
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
