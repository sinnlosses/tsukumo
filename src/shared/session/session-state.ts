// セッションの状態。サーバとブラウザの両方が同じものを回す。
// 型とフィールドの doc コメントが契約の置き場。
//
// ここが持つのは「状態そのもの」だけで、イベント1件でどう変わるか（`advanceSessionState`）や、姿から導くだけのもの（メインビューに出す形・`/` 補完の候補など）は置かない。

import type { CharacterInfo, CharacterPackEntry } from "../character-pack/character.ts"
import type { Expression } from "../character-pack/expression.ts"
import type { EffortLevel } from "../command.ts"
import type { DiaryWriting } from "../diary/diary.ts"
import type { WrittenReactionsState } from "../recommendation/reaction.ts"
import type { RecommendationCard } from "../recommendation/recommendation-card.ts"
import type { WelcomeGreetingState } from "../recommendation/welcome-greeting.ts"
import type { TaskSummaryResult } from "../repository/task-summary.ts"
import type { ApiTrouble } from "../session-driver/api-trouble.ts"
import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { StampedPendingAsk } from "../session-driver/pending-ask.ts"
import type { RateLimit } from "../session-driver/rate-limit.ts"
import type {
  PreviousUsageReview,
  UsageProposalRun,
  UsageReview,
} from "../usage-review/usage-review.ts"
import type { SessionChoice } from "./session-choice.ts"
import { BUILTIN_SESSION_DEFAULT, type SessionDefault } from "./session-default.ts"
import type { CommandDescription, ModelEffortSupport } from "./session-event.ts"
import type { SessionInfo } from "./session-info.ts"
import type { SessionRecord } from "./session-record.ts"
import { NO_SETTING_MARK, type SettingMarks } from "./setting-mark.ts"
import {
  INITIAL_SPEECH_EXPRESSION,
  NO_TURN_BODIES,
  type ReportDrafting,
  type TurnBodies,
  type TurnProgress,
} from "./turn-progress.ts"
import type { Speech } from "./turn-speech.ts"

/**
 * セッションの今の姿。イベントを1件ずつ畳んで作るので、ここに無い情報は画面にも出ない。
 *
 * `partialUtterance` は書きかけの本文で、完成した本文（`utterance`）が来たら空に戻る（断片と完成メッセージの両方が届いても二重に積まれない）。
 */
export type SessionState = {
  /**
   * 吹き出しに並べて出す、今のターンのセリフ（古い→新しいの順。件数の上限は無く、ターンの境目だけで区切る）。
   * `request` の時点で空にする（前のターンの一言を消し、次のターンに移ったことが画面から分かるようにする）。
   * そのターンでまだ `speak` が呼ばれていなければ空配列。
   */
  readonly speeches: readonly Speech[]
  /** 直近のセリフ（`speak`）に添えられた表情。反応（`shownReaction`）の表情はここに書かない。 */
  readonly speechExpression: Expression
  /**
   * 今のターンで `speak` が呼ばれたか（前のターンのセリフを捨てて今のターンだけの並びにするか、今のターンに積み重ねるかの判定に使う）。
   * `request` で false に戻る。
   */
  readonly speechCalledInTurn: boolean
  /**
   * いま走っている SDK ターンで本文が届いたか（{@link TurnBodies}）。
   * やり取り（依頼）ではなく SDK のターンで区切る（claude が自分で始めたターンでも戻す）。
   * メインビューが「まだ伸びうる本文」を伏せるときに、前の SDK ターンで確定した本文まで巻き込まないために要る。
   */
  readonly bodiesInTurn: TurnBodies
  /**
   * いま走っている SDK ターンが脇の話（`aside`）で始まったか。
   * `aside` で true になり、依頼・記録を持たないターンの始まり・続きのターン・ターンの終わりで false に戻る。
   */
  readonly answeringAside: boolean
  /** 確定した記録。書きかけの本文は含まない。 */
  readonly records: readonly SessionRecord[]
  /** 書きかけの本文。完成した本文が来たら空に戻る。 */
  readonly partialUtterance: string
  /** 答え待ちの列（許可プロンプトと質問）。届いた時刻つき。 */
  readonly pending: readonly StampedPendingAsk[]
  /** `init` がまだ届いていないか、届いてセッションID・許可モードが分かっているか。 */
  readonly session: SessionInfo
  /**
   * いま動いているモデル。`session` の外に置く（{@link SessionInfo} を参照）。
   * まだどちらの口からも届いていなければ undefined（`init` 前に何を出すかは読む側が見た目上の既定へ畳む）。
   */
  readonly model: string | undefined
  /**
   * モデルごとの effort の対応（{@link ModelEffortSupport}）。帯の effort のドロップダウンが、いまのモデルで選べる段を絞るのに読む。
   * 源は `model-effort-support` だけ。まだ届いていなければ空で、読む側は「対応するかどうか分からない」に畳む。
   */
  readonly modelEffortSupport: readonly ModelEffortSupport[]
  /**
   * いま効いている effort（最後に届いた `effort-changed`）。
   *
   * まだ届いていなければ undefined（見た目上の既定へは畳まない）。
   */
  readonly effort: EffortLevel | undefined
  /** モデル・effort・許可モードの設定の点の元（{@link SettingMarks}）。 */
  readonly settingMarks: SettingMarks
  /**
   * 入力欄の `/` 補完に出せるコマンド名（`init` のたびに上書きされる）。端末専用（`terminal_slash_commands`）は除いてある。
   * `init` は最初の依頼を送るまで届かない（実測。SDK の `system`/`init` はターンのたびに届く仕組みで、セッション開始直後には来ない）ので、それまでは空配列のまま。
   */
  readonly slashCommands: readonly string[]
  /** SDK の `init` で届いたスキルの名前（`init` のたびに上書きされる）。`init` が届く前は空配列。 */
  readonly skillNames: readonly string[]
  /** SDK の `init` で届いたサブエージェントの名前（`init` のたびに上書きされる）。`init` が届く前は空配列。 */
  readonly agentNames: readonly string[]
  /**
   * SDK から届いたコマンドの説明（名前と説明の組）。端末専用のものも混ざったままの生の一覧。
   * `supportedCommands()` はセッション開始後すぐに届く（実測。`init` を待たない）。説明がまだ届いていなければ空配列。
   */
  readonly commandDescriptions: readonly CommandDescription[]
  /** セッションが終わった理由。動いている間は undefined。 */
  readonly endedReason: string | undefined
  /** ターンの進み具合（{@link TurnProgress}）。始まった時刻・終わった時刻もここが持つ。 */
  readonly turn: TurnProgress
  /**
   * ターンが終わった回数（`turn-finished` / `session-ended` が実際にターンを終わらせたときだけ増える）。
   * `turn` が `running` に移っても戻さない。
   * 使用量の行などはこれを取り直しの合図にする。時刻にすると、凍らせたサーバの時計の下でターンごとに同じ値になる。
   */
  readonly finishedTurnCount: number
  /**
   * 次に始まるターンに振る通し番号。ターンが始まるたびに1つ増え、記録が窓から落ちても
   * 戻らないので、同じターンはセッションが続くかぎり同じ番号になる。
   *
   * 番号を位置（何番目のターンか）で決めると、窓（`MAX_SESSION_STATE_TURNS`）がいっぱいになったあといちばん新しいターンの番号が止まる。
   * 描く側はその番号を React の `key` に使っているので、止まると別のターンが同じ部品として使い回され、書き上げる演出（マウント時にしか走らない）が二度と起動しなくなる（実測）。
   */
  readonly nextTurnId: number
  /**
   * タスク一覧。`tasks-changed` が届くまでは `{ kind: "loading" }`（{@link TaskSummaryResult}）。
   */
  readonly tasks: TaskSummaryResult
  /**
   * 始め方の一覧のおすすめの札（おすすめの順、`MAX_RECOMMENDATION_CARDS` 枚まで）。
   * 源は `recommendation-changed` だけで、届くたびに丸ごと置き換える。空は「まだ無い」で、画面は既定の並びを出す。
   * `tasks` と同じく起こし直しをまたいで残す。
   */
  readonly recommendation: readonly RecommendationCard[]
  /**
   * 迎えの挨拶（反応の行は持たない）。源は `welcome-greeting-changed` だけ。
   * `/clear` と起こし直しのどちらでも、いったん初期の `none` へ戻してから新しい代の挨拶が書き直される。
   */
  readonly welcomeGreeting: WelcomeGreetingState
  /**
   * 反応の行。源は `reactions-written` だけ。
   * `/clear` では戻さない（書き直さない）。起こし直すと初期の `none` へ戻り、新しい代が書き直す。
   */
  readonly writtenReactions: WrittenReactionsState
  /**
   * キャラビューが立ち絵を取りに行く先（`character-changed` が届くまでは undefined）。
   * 素材そのものは持たない（`portraits` の値は `/character/<pack>/<file>` の URL）。
   */
  readonly character: CharacterInfo | undefined
  /**
   * キャラクターパックの一覧。使用中以外のパックも姿ごと持つ。
   * `character-changed` と一緒に届く。まだ届いていないときは空。
   */
  readonly characterPacks: readonly CharacterPackEntry[]
  /**
   * 切り替え先として選べるセッションの一覧。
   * `sessions-changed` と一緒に届き、起こしたときの姿のまま変わらない（ターンのたびには引き直さない）。
   * まだ届いていない・印の付いたセッションが1つも無いときは空。
   */
  readonly sessions: readonly SessionChoice[]
  /**
   * 直近でツールが失敗した時刻（`tool-finished` の `isError` が true のときの `at`）。まだ一度も失敗していなければ undefined。
   * 立ち絵の「失敗でびくっ」の判定にだけ使う。
   * 次のターンが始まっても戻さない（時間の窓が過ぎれば判定の側で自然に「今は失敗直後ではない」に戻る）。
   */
  readonly lastToolFailureAt: number | undefined
  /**
   * メインがいま `report` の引数を書いているか。立ち絵の「書いている」の判定にだけ使う。
   * `report-drafting` で書き始め、同じ `toolUseId` の `report` か `tool-finished`（差し戻されて `report` が届かないときもこちらは届く）、ターンの境目で終わる。
   */
  readonly reportDrafting: ReportDrafting
  /**
   * 雑談モードに入っているか。入っている間はレポートを出さず、メインビューが立ち絵と会話のログになる。
   * 源は `chat-mode-changed` だけ。切り替えは駆動の起こし直しなので、起こし直したあとにサーバから流れ直す（起こし直しで状態が初期値へ戻るため）。
   */
  readonly chatMode: boolean
  /**
   * 雑談のサイドバーの「最近の話題」に出す見出し（新しい順）。要約の本文ではなく、写しから取り出した見出しだけ。
   * 源は `chat-topics-changed` だけで、届くたびに丸ごと置き換える。
   * 起こし直すと初期値の空へ戻り、雑談で起こしたときだけサーバから流れ直す（仕事のときは空のまま）。
   */
  readonly chatTopics: readonly string[]
  /**
   * 雑談のサイドバーの「覚えていること」に出す一覧（`persona.md` の `## 覚えたこと`）。`- ` を外した文面で、古い→新しいの順。
   * 源は `remembered-lines-changed` だけ。起こし直すと初期値の空へ戻る。
   */
  readonly rememberedLines: readonly string[]
  /**
   * 新しいセッションを起こすときの既定（帯の右端の歯車が読み書きする）。
   * いま動いているセッションの値ではない（そちらは {@link SessionState.model} と {@link SessionInfo} の `permissionMode` で、帯から変えてもここは変わらない）。
   * 源は `session-default-changed` だけ。起こし直すと状態が初期値へ戻るので、サーバから流れ直す（届くまでは同梱の既定）。
   */
  readonly sessionDefault: SessionDefault
  /**
   * 契約プラン。トークン消費の画面の題の右の札に出す。源は `plan` だけ。
   * まだ届いていない・取れなかったのどちらも同じ undefined（画面は区別しないので、型でも分けない）。
   */
  readonly plan: string | undefined
  /**
   * いま背景で動いているタスク。ターンの進み具合（{@link turn}）とは独立で、ターンが終わっても動いている間はここに残る。
   * 源は `background-tasks-changed` だけで、届くたびに丸ごと置き換える。
   * `session-ended` で空にする（claude のプロセスが終わればバックグラウンドタスクも一緒に終わる。SDK は起動時に何も流さないので、起こし直しで初期値の空へ戻るのもそのまま正しい）。
   */
  readonly backgroundTasks: readonly BackgroundTask[]
  /**
   * 見直しの状態。源は見直しのイベント（`UsageReviewEvent`）だけ。
   * 見直しは会話とは別の使い捨ての問い合わせで走るので、会話の `turn-finished` / `session-ended` では動かさず、起こし直しでも残す。
   * 前回の結果を出すのはこの状態ではない。
   */
  readonly usageReview: UsageReview
  /**
   * 前回の見直しの結果。{@link usageReview} とは別の状態で、起こし直しでもプロセスの再起動でも消えない
   * （源は `usage-review-result` が届くたびと、プロセスを起こしたとき1回だけホームのファイルを読む口）。
   * `usage-proposal-dismissed` が届くと、見送った提案をここからも取り除く（「前回の提案」を開き直したときに、見送ったはずの札が出ないようにするため）。
   */
  readonly previousUsageReview: PreviousUsageReview
  /**
   * 結果の提案の実行（「tsukumo に頼む」「タスクにする」）の状態。源は見直しのイベントだけで、{@link usageReview} と同じく会話のターンでは動かさない。
   */
  readonly usageProposalRun: UsageProposalRun
  /**
   * 成果の日記書きの進み。帯の「いまの作業」の「振り返り中」が読む。
   *
   * 源は `diary-requested` / `diary-drafting` / `diary-stage` / `diary-written` / `diary-failed` の5つ。
   * 振り返りは会話とは別の使い捨ての問い合わせで会話のターンと並んで進むので、会話の `turn-finished` / `session-ended` では動かさない。
   * `written` と `failed` は次の `diary-requested` まで持ち続ける。起こし直すと初期値の `idle` から始まる。
   */
  readonly diaryWriting: DiaryWriting
  /**
   * いまのターンで API が不調か（{@link ApiTrouble}。入力欄の経過時間の行に「再試行中」を出す
   * 材料と、失敗で終わったときの理由の材料）。源は `api-retry` / `api-error` で、ターンの
   * 境目と、モデルが何かを出したとき（`MODEL_OUTPUT_EVENT_KINDS`）に `none` へ戻る。
   */
  readonly apiTrouble: ApiTrouble
  /**
   * 利用上限の状態（{@link RateLimit}。入力欄の経過時間の行が出す）。源は `rate-limit-changed`
   * だけで、ターンの境目では戻さない（セッションを通した状態で、次の知らせが来るまで持つ）。
   */
  readonly rateLimit: RateLimit
}

export const INITIAL_SESSION_STATE: SessionState = {
  speeches: [],
  speechExpression: INITIAL_SPEECH_EXPRESSION,
  speechCalledInTurn: false,
  bodiesInTurn: NO_TURN_BODIES,
  answeringAside: false,
  records: [],
  partialUtterance: "",
  pending: [],
  session: { kind: "starting" },
  model: undefined,
  modelEffortSupport: [],
  effort: undefined,
  settingMarks: {
    model: NO_SETTING_MARK,
    effort: NO_SETTING_MARK,
    permissionMode: NO_SETTING_MARK,
  },
  slashCommands: [],
  skillNames: [],
  agentNames: [],
  commandDescriptions: [],
  endedReason: undefined,
  turn: { kind: "idle" },
  finishedTurnCount: 0,
  nextTurnId: 0,
  tasks: { kind: "loading" },
  recommendation: [],
  welcomeGreeting: { kind: "none" },
  writtenReactions: { kind: "none" },
  character: undefined,
  characterPacks: [],
  sessions: [],
  lastToolFailureAt: undefined,
  reportDrafting: { kind: "idle" },
  chatMode: false,
  chatTopics: [],
  rememberedLines: [],
  sessionDefault: BUILTIN_SESSION_DEFAULT,
  plan: undefined,
  backgroundTasks: [],
  usageReview: { kind: "idle" },
  previousUsageReview: { kind: "none" },
  usageProposalRun: { kind: "idle" },
  diaryWriting: { kind: "idle" },
  apiTrouble: { kind: "none" },
  rateLimit: { kind: "clear" },
}

/** 駆動を起こし直すコマンドを断るべきか。ターンが進行中か、委譲先（`backgroundTasks`）が動いている間は断る。 */
export function restartRefused(state: SessionState): boolean {
  return state.turn.kind === "running" || state.backgroundTasks.length > 0
}
