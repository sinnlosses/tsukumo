// セッションを持つ係 `createSessionManager` の入口（`SessionManagerOptions`）と出口（`SessionManager`）の型。

import type { ContextUsageReport } from "../../../shared/context-usage/context-usage.ts"
import type { ServerFrame } from "../../../shared/frame.ts"
import type { PlanUsageReport } from "../../../shared/plan-usage/plan-usage.ts"
import type { SessionDigest } from "../../../shared/session/session-digest.ts"
import type { RestoredEvent, SessionEvent } from "../../../shared/session/session-event.ts"
import type { PreviousUsageReview } from "../../../shared/usage-review/usage-review.ts"
import type { ChatArchive } from "../../chat/core/chat-archive-port.ts"
import type { ChatConsolidationSource } from "../../chat/core/chat-consolidation-writer.ts"
import type { ContextUsageLog } from "../../context-usage/core/context-usage.ts"
import type { ChangeCountGit } from "../../core/change-count-git.ts"
import type { DiagnosticLog } from "../../diagnostic/core/diagnostic.ts"
import type {
  ExperienceMetricLog,
  SplitRelease,
} from "../../experience-metric/core/experience-metric.ts"
import type { ReadReportImage, ReportImageShelf } from "../../report/core/report-image-shelf.ts"
import type { ReportUsageLog } from "../../report/core/report-usage.ts"
import type { PromptImageShelf } from "../../session-driver/core/prompt-image-shelf.ts"
import type { QuestionUsageLog } from "../../session-driver/core/question-usage.ts"
import type { SessionDriver } from "../../session-driver/core/session-driver.ts"
import type { TokenUsageLog } from "../../token-usage/core/token-usage.ts"
import type { CommandSession } from "./command-session.ts"
import type { SessionLaunchRequest } from "./session-launch.ts"

export type SessionManagerOptions = {
  /** 現在時刻（エポックミリ秒）を返す関数（呼び出し側が時計を渡す。テストは偽の時計を渡す）。 */
  readonly now: () => number
  /** イベントをまとめる間隔（ミリ秒）。既定は `EVENT_BATCH_INTERVAL_MS`。 */
  readonly batchIntervalMs: number
  /** 会話のアーカイブの書き込み口（雑談と仕事の両方が書く）。 */
  readonly chatArchive: ChatArchive
  /**
   * 仕事の行に付ける `project`（アーカイブの `docs/architecture/chat-mode.md`「会話のアーカイブ」）。
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
   * 前の `result` からの増分を出すのは `TokenUsageRecorder`（駆動1代ぶんの持ち物として前回の累計を覚えている）で、渡した先は「どこに・どんな形で書くか」しか持たない。
   */
  readonly tokenUsageLog: TokenUsageLog
  /**
   * コンテキストの内訳の書き込み口。
   * セッション1つにつき1行で、いつ書くか（＝そのセッションでまだ書いていない最初のターンの終わり）を決めるのは `createContextUsageRecorder` が返す係。
   * 渡した先は「どこに・どんな形で書くか」しか持たない。
   */
  readonly contextUsageLog: ContextUsageLog
  /** 進行の計測値の書き込み口。何を1行にするかは `createExperienceMetricRecorder` が返す係が決める。 */
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
   * 駆動から届いた `report` と新しく積まれた質問を受けたときに置き（続きから復元した再生では、記録の窓に残った時刻が分かり24時間以内の `report` の画像を、更新時刻がその時刻以前のものだけ読み直して置く）、記録にも答え待ちにも無くなったときに捨てる。
   */
  readonly reportImageShelf: ReportImageShelf
  /** `image` の塊と質問の preview の画像のパスを読む口（cwd から解く）。 */
  readonly readReportImage: ReadReportImage
  /**
   * セッションを1つ起こす（起こし直しも含む）一続き。
   * 駆動を起こすだけでなく、パックを決めて続きを探し、復元した履歴を流すところまでを1つでやる（`createSessionLaunch` が実体）。
   * ここは駆動の種類（SDK か fake driver か）を知らない。
   *
   * 受け口は2つ。`onEvent` は駆動（と見張り）から新しく届くイベントで、いまの代が受け取ったら `true`、閉じた代のものを捨てたら `false` を返す。
   * `onRestoredEvents` は前のセッションの記録を組み直した再生だけを、まとめて1回で受ける。
   *
   * 知らない名前のときに何を起こすかも、名前を覚えるかどうかも呼び出し側が決める。
   */
  readonly launchSession: (
    onEvent: (event: SessionEvent) => boolean,
    onRestoredEvents: (events: readonly RestoredEvent[]) => void,
    request: SessionLaunchRequest,
  ) => Promise<SessionDriver>
  /**
   * ホームに残っている前回の見直しの結果。
   * 起こしたときに1回だけ読み、初期の姿（`SessionState.previousUsageReview`）に載せる。
   */
  readonly readPreviousUsageReview: () => PreviousUsageReview
  /**
   * 作業ディレクトリのタスク一覧の見張りを起こす。起こし直しをまたいで1つだけ動き、閉じるまで続く。
   * 流すイベントは、そのときの代の駆動のイベントと同じ扱いで畳む。
   */
  readonly watchTasks: (onEvent: (event: SessionEvent) => void) => SessionWatcher
  /** 最終レポートの変更の札を数える、作業ディレクトリの git の口。 */
  readonly changeCountGit: ChangeCountGit
}

/** 閉じるまで生きている見張り。 */
type SessionWatcher = {
  readonly close: () => void
  /** 画面が1つでも購読しているあいだだけ真にする（動かすのは見張りが要るあいだだけ）。 */
  readonly setWatching: (watching: boolean) => void
  /** 次の見回りを待たず今すぐ1回読み、読み終えてから解決する。 */
  readonly refresh: () => Promise<void>
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
   * いまのプラン使用量を駆動から取る。
   * 押すのではなく引くので、状態にもフレームにも乗らない。取れなかったときは「取れない」。
   */
  readonly readPlanUsage: () => Promise<PlanUsageReport>
  /** タスク一覧を今すぐ1回読み直し、読み終えてから解決する。 */
  readonly refreshTasks: () => Promise<void>
  /** 仕切りを離した1回を体験の記録へ書く。セッションIDがまだ無いときは書かない。 */
  readonly recordSplit: (release: SplitRelease) => void
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
