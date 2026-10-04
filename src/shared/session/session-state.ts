// セッションの状態と、イベント1件を畳み込む純粋関数。サーバとブラウザの両方が同じものを回す。
// 型とフィールドの doc コメントが契約の置き場。
//
// 時刻は畳み込みの中で時計を読まず、イベントに打たれた `at`（エポックミリ秒）を受け取る（両側の状態が同じになるように、時刻はイベントの発生側が決める）。
//
// ここが持つのは「状態そのもの」と「イベント1件でどう変わるか」だけで、姿から導くだけのもの（メインビューに出す形・`/` 補完の候補など）は置かない。

import type { CharacterInfo, CharacterPackEntry } from "../character-pack/character.ts"
import type { Expression } from "../character-pack/expression.ts"
import { type EffortLevel, isModelAlias } from "../command.ts"
import { applyDiaryEvent, type DiaryWriting } from "../diary/diary.ts"
import type { RecommendationCard } from "../recommendation/recommendation-card.ts"
import type { WelcomeGreetingState } from "../recommendation/welcome-greeting.ts"
import type { ReportSection } from "../report/report-block.ts"
import type { ReportCheck } from "../report/report-check.ts"
import type { ReportTask } from "../report/report-task.ts"
import type { TaskSummaryResult } from "../repository/task-summary.ts"
import type { ApiTrouble } from "../session-driver/api-trouble.ts"
import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { PendingAsk, StampedPendingAsk } from "../session-driver/pending-ask.ts"
import type { RecordedPromptImage } from "../session-driver/prompt-image.ts"
import type { Question, QuestionAnswer } from "../session-driver/question.ts"
import type { RateLimit } from "../session-driver/rate-limit.ts"
import type {
  TurnEnding,
  TurnFailure,
  TurnFailureCause,
  TurnOutcome,
} from "../session-driver/turn-failure.ts"
import {
  applyUsageReviewEvent,
  type PreviousUsageReview,
  settleUsageReview,
  type UsageReview,
} from "../usage-review/usage-review.ts"
import { isBlankText } from "../utils/blank-text.ts"
import { clipText, type ClippedText } from "../utils/clip-text.ts"
import {
  applyVisitEvent,
  DEFAULT_VISIT_ENABLED,
  INITIAL_VISIT_STATE,
  type VisitState,
} from "../visit/visit.ts"
import { commandCandidates } from "./command-suggestion.ts"
import type { SessionChoice } from "./session-choice.ts"
import { BUILTIN_SESSION_DEFAULT, type SessionDefault } from "./session-default.ts"
import type { CommandDescription, ModelEffortSupport, SessionEvent } from "./session-event.ts"
import { splitIntoTurns } from "./turn.ts"
import { delegatedWorkPlan, isWorkPlanRecord, workPlanOf } from "./work-plan.ts"

/**
 * メインビューに残す記録の窓（直近何ターンぶんを持ち続けるか）。常駐プロセスが動き続ける以上、記録自体も無限に増やさない。
 * `work` は `MAX_MAIN_VIEW_TURNS` の導出元。
 * 雑談の1ターンはセリフ1〜2件で軽く、仕事と同じ往復数では会話として短すぎるため、雑談だけ多く持つ。
 */
export const MAX_SESSION_STATE_TURNS = {
  work: 20,
  chat: 100,
} satisfies Record<"work" | "chat", number>

/** 依頼の手順で読めるツールの文面の上限（字数）。記録に入れる失敗の出力も、画面の切り詰めもこれで切る。 */
export const MAX_TOOL_TEXT_LENGTH = 8000

/**
 * ツールの実行がどこまで進んだか。結果が届くまでは `running` で、届いたら `finished` に
 * 結果を持つ（結果の無い `finished` も、結果のある `running` も起きない）。
 * 成功した結果の本文は持たない。失敗した出力は先頭 {@link MAX_TOOL_TEXT_LENGTH} 字と落とした字数だけ持つ。
 */
export type ToolRunStatus =
  | { readonly kind: "running" }
  | {
      readonly kind: "finished"
      /** 終わった時刻（{@link RecordTime}）。復元で読み戻したときの扱いはそちらを参照。 */
      readonly finishedAt: RecordTime
      readonly result:
        | { readonly kind: "succeeded" }
        | { readonly kind: "failed"; readonly output: ClippedText }
    }

/**
 * 依頼とセリフの記録が起きた時刻。雑談のログが行ごとの時刻と日の区切りに使う。
 *
 * - `stamped`: 起きた時刻が分かっている。`at` はそのイベントに打たれた時刻（`StampedEvent.at`。
 *   エポックミリ秒）
 * - `restored`: 前のセッションの記録を組み直したもので、起きた時刻が分からない（`history-restored`）。
 *   流し直した時刻を代わりに入れると、昨日の一言が「いま」に見える
 */
export type RecordTime =
  | { readonly kind: "stamped"; readonly at: number }
  | { readonly kind: "restored" }

/**
 * セッションの中で起きたことを起きた順に並べたもの。
 * ツールは `toolUseId` を持つ（あとから届く結果を突き合わせるため。表示には使わない）。
 * `speech` はメインビューには出さない（セリフは吹き出しだけに出す）が、過去のターンの吹き出しを引き直せるように記録には残す。
 */
export type SessionRecord =
  /**
   * 利用者の依頼。`images` は添えた画像の控えと、棚の原寸を指す id の組。
   * 原寸は記録に入らない（`hello` に載せない）。拡大して見るときは id で棚から取りに行く（`promptImagePath`）。
   *
   * `turnId` はそのターンの通し番号（{@link SessionState.nextTurnId}）。
   * 窓から古い記録が落ちても番号は振り直されないので、同じターンはセッションが続くかぎり同じ番号になる。
   */
  | {
      readonly kind: "request"
      readonly turnId: number
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
      readonly time: RecordTime
    }
  | { readonly kind: "detail"; readonly markdown: string }
  /**
   * `report` ツールで受け取ったレポート。引数をそのまま持ち、1つの本文に組むのはメインビューの導出。
   * 本文（`detail`）とは別の種類にしてあるのは、このレポートがあるターンでは本文を出さないという判定に、どちらから来たかが要るため。
   * `toolUseId` は `image` の塊の画像を棚から引く鍵（`reportImagePath`）。
   */
  | {
      readonly kind: "report"
      readonly toolUseId: string
      readonly conclusion: string
      readonly sections: readonly ReportSection[]
      readonly favor: string
      readonly checks: readonly ReportCheck[]
      readonly task: ReportTask
    }
  /**
   * `work_plan` ツールで受け取った段取り。届いた位置に積むだけで、今の段取りは `latestWorkPlan`、手順ごとの段は `currentTurnSteps` が記録から導く。
   */
  | {
      readonly kind: "work-plan"
      readonly phases: readonly string[]
      readonly current: number
      readonly phaseSummary: string
      /**
       * 誰の段取りか。`main` はメインの `work_plan` の呼び出し、`delegate-signal` は委譲の合図から引いたもの。
       * `delegate-ended` は、委譲先が背景から居なくなったときに、合図から引いた段取りをそのまま積み直したもの。
       */
      readonly source: "main" | "delegate-signal" | "delegate-ended"
    }
  /**
   * 答え終わった質問（`question-answered`）。積むのは答えが確定した1回だけで、あとから書き換えない。
   * 形は `MainViewEntry` の `question` と同じに揃える（メインビューはそのまま通す）。
   */
  | {
      readonly kind: "question"
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
    }
  | {
      readonly kind: "speech"
      readonly text: string
      readonly expression: Expression
      readonly time: RecordTime
    }
  | {
      readonly kind: "tool"
      readonly toolUseId: string
      readonly name: string
      readonly input: unknown
      readonly nested: boolean
      /** 始まった時刻（{@link RecordTime}）。所要時間は帯の「依頼の手順」が導く。 */
      readonly startedAt: RecordTime
      readonly status: ToolRunStatus
    }
  /**
   * 圧縮の区切り（`compact-boundary`）。中身を持たない（画面に出すのは細い線1本だけで、文言も数値も添えない）。
   * {@link trimToRecentTurns} の数え方（`request` の数）は変えない（他の記録と同じく、窓から外れれば一緒に落ちる）。
   */
  | { readonly kind: "compact-boundary" }
  /**
   * 失敗で終わったターンの理由（`turn-finished` の `outcome` が `failed`）。そのターンの記録の末尾に1つだけ積む。
   * メインビューがターンの末尾に「失敗で終わった」と理由を出すので、過去のターンを遡っても成功と見分けられる。
   * 雑談のログ・依頼の手順・吹き出しは拾わない。
   */
  | { readonly kind: "turn-failure"; readonly failure: TurnFailure }

/**
 * `init`（`session-info`）と、続きから始めたときの `sessions-changed` がどこまで届いたか。
 * `sessionId` が分かる口は2つ（`init` と `sessions-changed`）、`permissionMode` は1つ（`init`）なので、どこまで届いたかが3つの状態になる。
 *
 * - `starting`: セッションがまだ起こったばかりで、`init` も `sessions-changed`（続きから始めたときの居場所）もまだ届いていない
 * - `identified`: `sessionId` だけ分かっている。続きから始めたときに `sessions-changed` が `init` より先に届く経路があるので実在する状態
 * - `running`: `sessionId` / `permissionMode` の両方が分かっている。
 *   `permissionMode` を決める口は `init` だけ（`session.setPermissionMode` には確定の合図が無い）で、その `init` は必ず `sessionId` も連れてくるので、`permissionMode` だけ分かっている状態は実在しない
 *
 * `model` はここに入れない（{@link SessionState.model} に外へ出してある）。
 * `model` は `init` に加えて `model-changed` でも決まり、`sessionId` より先に分かることがある（`init` が来る前の `identified`/`starting` の間にモデルを切り替える経路が実機にある）。
 * ここへ押し込めると `model-changed` が `running` 以外では効かなくなり、切り替えても数秒で古い値に戻って見える（実機で確認）。
 */
export type SessionInfo =
  | { readonly kind: "starting" }
  | { readonly kind: "identified"; readonly sessionId: string }
  | { readonly kind: "running"; readonly sessionId: string; readonly permissionMode: string }

/**
 * ターンの進み具合。`request` で `running` になり、`turn-finished` / `session-ended` で `finished` になる（入力欄が送信と中断を切り替える判断材料）。
 *
 * - `idle`: まだ一度も依頼が無い
 * - `running`: 依頼を送って、まだ終わっていない。
 *   委譲した続きを claude が自分で始めたとき（`turn-resumed`）も `startedAt` は付け直さず、依頼を送った時刻のまま引き継ぐ（{@link resumeTurn}）
 * - `finished`: 終わった。`startedAt` は次の `request` まで持ち続ける（入力欄の経過時間表示が「所要」として出し続ける）。
 *   `ending` は失敗で終わったか（{@link TurnEnding}。入力欄の「失敗」の字と、立ち絵の「失敗でびくっ」の材料。`session-ended` で終わったときは `ended`）。
 *   ここが `finished` でも {@link SessionState.backgroundTasks} が残っていれば、入力欄は「経過」のまま数え続ける
 */
export type TurnProgress =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly startedAt: number }
  | {
      readonly kind: "finished"
      readonly startedAt: number
      readonly finishedAt: number
      readonly ending: TurnEnding
    }

/**
 * いま走っている SDK ターンで届いた本文の種類（{@link SessionState.bodiesInTurn}）。`report` は
 * `report` ツールの呼び出し、`utterance` はツールの外に書いた本文（空白だけのものは数えない）。
 */
export type TurnBodies = { readonly report: boolean; readonly utterance: boolean }

const NO_TURN_BODIES = { report: false, utterance: false } as const satisfies TurnBodies

/** メインが `report` の引数を書いている途中か（{@link SessionState.reportDrafting}）。 */
export type ReportDrafting =
  | { readonly kind: "idle" }
  | { readonly kind: "drafting"; readonly toolUseId: string }

/** `speak` で来た1件のセリフと、そのときの表情。吹き出し・セリフのログが押して遡る先の材料になる。 */
export type Speech = {
  readonly text: string
  readonly expression: Expression
}

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
  /**
   * 入力欄の `/` 補完に出せるコマンド名（`init` のたびに上書きされる）。端末専用（`terminal_slash_commands`）は除いてある。
   * `init` は最初の依頼を送るまで届かない（実測。SDK の `system`/`init` はターンのたびに届く仕組みで、セッション開始直後には来ない）ので、それまでは空配列のまま。
   */
  readonly slashCommands: readonly string[]
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
   * 直近でターンが終わった時刻（`turn-finished` / `session-ended` の `at`）。まだ一度もターンが終わっていなければ undefined。
   * `turn` が `running` に移っても戻さない。
   * `turn.finished.finishedAt` は次の依頼が始まると読めなくなる（{@link TurnProgress}）が、ターンの途中も「直前に終わったときの取り直しの合図」を必要とする読み手（使用量の行など）がいる。
   */
  readonly lastTurnFinishedAt: number | undefined
  /**
   * 次に始まるターンに振る通し番号。ターンが始まるたびに1つ増え、記録が窓から落ちても
   * 戻らないので、同じターンはセッションが続くかぎり同じ番号になる。
   *
   * 番号を位置（何番目のターンか）で決めると、窓（{@link MAX_SESSION_STATE_TURNS}）がいっぱいになったあといちばん新しいターンの番号が止まる。
   * 描く側はその番号を React の `key` に使っているので、止まると別のターンが同じ部品として使い回され、書き上げる演出（マウント時にしか走らない）が二度と起動しなくなる（実測）。
   */
  readonly nextTurnId: number
  /**
   * タスク一覧。`tasks-changed` が届くまでは `{ kind: "unknown" }`
   * （読めない・まだ読んでいないのどちらも同じ「不明」にする理由は {@link TaskSummaryResult} を参照）。
   * タスク運用が無いと分かれば `{ kind: "none" }`。
   */
  readonly tasks: TaskSummaryResult
  /**
   * 迎える口のおすすめの札（おすすめの順、`MAX_RECOMMENDATION_CARDS` 枚まで）。
   * 源は `recommendation-changed` だけで、届くたびに丸ごと置き換える。空は「まだ無い」で、画面は既定の並びを出す。
   * `tasks` と同じく起こし直しをまたいで残す。
   */
  readonly recommendation: readonly RecommendationCard[]
  /**
   * 迎えの挨拶。源は `welcome-greeting-changed` だけ。
   * `/clear` と起こし直しのどちらでも、いったん初期の `none` へ戻してから新しい代の挨拶が書き直される。
   */
  readonly welcomeGreeting: WelcomeGreetingState
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
   * 歯車の「訪問」のオン・オフ。覚え方は `sessionDefault` と同じ（`~/.tsukumo/state.json`）だが、効き方は違う。
   * `visit.setEnabled` はいま動いているセッションにも即座に効く（オフなら来ない・訪問中にオフにしたらその場で帰る）。
   * 源は `visit-enabled-changed` だけ。起こすたびに覚えた値へ流れ直す（届くまでは同梱の既定 {@link DEFAULT_VISIT_ENABLED}）。
   */
  readonly visitEnabled: boolean
  /**
   * 契約プラン。トークン消費の画面の題の右の札に出す。源は `plan` だけ。
   * まだ届いていない・取れなかったのどちらも同じ undefined（画面は区別しないので、型でも分けない）。
   */
  readonly plan: string | undefined
  /**
   * いま背景で動いているタスク。ターンの進み具合（{@link turn}）とは独立で、ターンが終わっても動いている間はここに残る。
   * 源は `background-tasks-changed` だけで、届くたびに丸ごと置き換える。
   * `session-ended` で空にする（claude のプロセスが終われば背景のタスクも一緒に終わる。SDK は起動時に何も流さないので、起こし直しで初期値の空へ戻るのもそのまま正しい）。
   */
  readonly backgroundTasks: readonly BackgroundTask[]
  /**
   * 見直しの状態。源は `usage-review-stage` / `usage-review-result` の2つ（ツールが受け付けた呼び出し）。
   * 見直し中のままターンが終わったら（止めた・失敗したも同じ）ふだんへ戻す。
   * 起こし直すと初期値のふだんから始まる（前回の結果を出すのはこの状態ではない）。
   */
  readonly usageReview: UsageReview
  /**
   * 前回の見直しの結果。{@link usageReview} とは別の状態で、起こし直しでもプロセスの再起動でも消えない
   * （源は `usage-review-result` が届くたびと、起こしたとき1回だけホームのファイルを読む口）。
   * `usage-proposal-dismissed` が届くと、見送った提案をここからも取り除く（「前回の提案」を開き直したときに、見送ったはずの札が出ないようにするため）。
   */
  readonly previousUsageReview: PreviousUsageReview
  /**
   * 成果の振り返りの進み。帯の「いまの作業」の「振り返り中」が読む。
   *
   * 源は `diary-requested` / `diary-drafting` / `diary-stage` / `diary-written` / `diary-failed` の5つ。
   * 振り返りは会話とは別の使い捨ての問い合わせで会話のターンと並んで進むので、会話の `turn-finished` / `session-ended` では動かさない。
   * `written` と `failed` は次の `diary-requested` まで持ち続ける。起こし直すと初期値の `idle` から始まる。
   */
  readonly diaryWriting: DiaryWriting
  /**
   * いまのターンで API が不調か（{@link ApiTrouble}。入力欄の経過時間の行に「再試行中」を出す
   * 材料と、失敗で終わったときの理由の材料）。源は `api-retry` / `api-error` で、ターンの
   * 境目と、モデルが何かを出したとき（{@link MODEL_OUTPUT_EVENT_KINDS}）に `none` へ戻る。
   */
  readonly apiTrouble: ApiTrouble
  /**
   * 利用上限の状態（{@link RateLimit}。入力欄の経過時間の行が出す）。源は `rate-limit-changed`
   * だけで、ターンの境目では戻さない（セッションを通した状態で、次の知らせが来るまで持つ）。
   */
  readonly rateLimit: RateLimit
  /**
   * 訪問（{@link VisitState}）。源は訪問の3つのイベントだけ。
   * 台本の表情はここにだけ持ち、`speechExpression` と `records` には書かない。起こし直すと初期値の `none` へ戻る。
   */
  readonly visit: VisitState
}

export const INITIAL_SESSION_STATE: SessionState = {
  speeches: [],
  speechExpression: "default",
  speechCalledInTurn: false,
  bodiesInTurn: NO_TURN_BODIES,
  records: [],
  partialUtterance: "",
  pending: [],
  session: { kind: "starting" },
  model: undefined,
  modelEffortSupport: [],
  effort: undefined,
  slashCommands: [],
  commandDescriptions: [],
  endedReason: undefined,
  turn: { kind: "idle" },
  lastTurnFinishedAt: undefined,
  nextTurnId: 0,
  tasks: { kind: "unknown" },
  recommendation: [],
  welcomeGreeting: { kind: "none" },
  character: undefined,
  characterPacks: [],
  sessions: [],
  lastToolFailureAt: undefined,
  reportDrafting: { kind: "idle" },
  chatMode: false,
  chatTopics: [],
  rememberedLines: [],
  sessionDefault: BUILTIN_SESSION_DEFAULT,
  visitEnabled: DEFAULT_VISIT_ENABLED,
  plan: undefined,
  backgroundTasks: [],
  usageReview: { kind: "idle" },
  previousUsageReview: { kind: "none" },
  diaryWriting: { kind: "idle" },
  apiTrouble: { kind: "none" },
  rateLimit: { kind: "clear" },
  visit: INITIAL_VISIT_STATE,
}

/**
 * モデルが何かを出したと言えるイベント。届いたら {@link SessionState.apiTrouble} を下ろす
 * （呼び直しが実った・API のエラーから立て直した合図は別に来ないため）。`step-usage` は
 * 思考だけのステップでも届くので、本文が出る前に「再試行中」を下ろせる。
 */
const MODEL_OUTPUT_EVENT_KINDS: ReadonlySet<SessionEvent["kind"]> = new Set([
  "partial-utterance",
  "utterance",
  "speech",
  "report-drafting",
  "report",
  "work-plan",
  "tool-started",
  "step-usage",
] satisfies SessionEvent["kind"][])

/**
 * イベント1件を畳み込んで次の姿を返す。知らない状況でも必ず姿を返す（落ちない）。
 * `at` はイベントが起きた時刻（`StampedEvent.at`）。時計をここで読まない（サーバとブラウザで同じ結果になるようにするため）。
 */
export function applySessionEvent(
  state: SessionState,
  event: SessionEvent,
  at: number,
): SessionState {
  return foldSessionEvent(
    MODEL_OUTPUT_EVENT_KINDS.has(event.kind) ? { ...state, apiTrouble: { kind: "none" } } : state,
    event,
    at,
  )
}

/** {@link applySessionEvent} の本体（API の不調を下ろしたあとの姿に、イベント1件を畳む）。 */
function foldSessionEvent(state: SessionState, event: SessionEvent, at: number): SessionState {
  switch (event.kind) {
    case "session-info":
      return {
        ...state,
        session:
          event.permissionMode !== undefined
            ? { kind: "running", sessionId: event.sessionId, permissionMode: event.permissionMode }
            : { kind: "identified", sessionId: event.sessionId },
        // `model` は `session` とは独立に更新する（`SessionInfo` の doc コメント）。
        model: event.model,
        slashCommands: commandCandidates(event.slashCommands, event.terminalSlashCommands),
      }
    case "command-descriptions":
      return { ...state, commandDescriptions: event.descriptions }
    case "plan":
      return { ...state, plan: event.plan }
    case "model-changed":
      // `MODEL_ALIASES` に完全一致するときだけ先回りで更新する（`/model best` のような tsukumo が知らない値では状態を変えず、次の `init` を待つ）。
      // `session.kind` は見ない（`running` に絞ると、切り替えても数秒で古い値に戻って見える。`SessionInfo` の doc コメント）。
      return isModelAlias(event.model) ? { ...state, model: event.model } : state
    case "model-effort-support":
      return { ...state, modelEffortSupport: event.models }
    case "effort-changed":
      return { ...state, effort: event.effort }
    case "request":
      return {
        ...beginTurn(state, at),
        records: trimToRecentTurns(
          [
            ...state.records,
            {
              kind: "request",
              turnId: state.nextTurnId,
              text: event.text,
              images: event.images,
              time: { kind: "stamped", at },
            },
          ],
          state.chatMode,
        ),
      }
    case "turn-started":
      // 記録を持たないターンの始まり。積むものが無いだけで、吹き出し・表情・進行中の印は `request` と同じに動かす。
      return beginTurn(state, at)
    case "turn-resumed":
      return resumeTurn(state, at)
    case "partial-utterance":
      return { ...state, partialUtterance: state.partialUtterance + event.text }
    case "utterance":
      return settleUtterance({
        ...state,
        partialUtterance: event.text,
        bodiesInTurn: isBlankText(event.text)
          ? state.bodiesInTurn
          : { ...state.bodiesInTurn, utterance: true },
      })
    case "speech":
      return {
        ...state,
        // 記録は積みっぱなし（`speeches` と違ってターンの境目で捨てない）。過去のターンの吹き出しと表情をここから引き直す。
        records: [
          ...state.records,
          {
            kind: "speech",
            text: event.text,
            expression: event.expression,
            time: { kind: "stamped", at },
          },
        ],
        // 前のターンのセリフが残っているなら、ここで捨てて今のターンだけの並びにする。
        speeches: [
          ...(state.speechCalledInTurn ? state.speeches : []),
          { text: event.text, expression: event.expression },
        ],
        speechExpression: event.expression,
        speechCalledInTurn: true,
      }
    // サーバの中で `speech` に変わってから届く（`SpeechReview`）。
    case "speak-called":
      return state
    case "report-drafting":
      return { ...state, reportDrafting: { kind: "drafting", toolUseId: event.toolUseId } }
    case "report":
      // `tool-started` と同じく、届いた位置に積むだけ（吹き出しにも帯の「いまの作業」にも出さない）。
      return {
        ...settleReportDrafting(state, event.toolUseId),
        bodiesInTurn: { ...state.bodiesInTurn, report: true },
        records: [
          ...state.records,
          {
            kind: "report",
            toolUseId: event.toolUseId,
            conclusion: event.conclusion,
            sections: event.sections,
            favor: event.favor,
            checks: event.checks,
            task: event.task,
          },
        ],
      }
    case "work-plan":
      return { ...state, records: [...state.records, ...mainWorkPlanRecords(state.records, event)] }
    case "delegate-signal":
      return {
        ...state,
        records: [...state.records, ...delegateSignalRecords(state.records, event)],
      }
    case "tool-started": {
      const nested = event.parentToolUseId !== undefined
      return {
        ...state,
        records: [
          ...state.records,
          {
            kind: "tool",
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            nested,
            startedAt: { kind: "stamped", at },
            status: { kind: "running" },
          },
        ],
      }
    }
    case "tool-finished":
      return finishTool(
        settleReportDrafting(state, event.toolUseId),
        event.toolUseId,
        event.content,
        event.isError,
        at,
      )
    case "pending-changed":
      return { ...state, pending: stampPending(state.pending, event.pending, at) }
    case "question-answered":
      // 答えが確定した1回だけ積む（未回答の質問は記録に残さない）。
      // 窓の切り詰めは要らない（質問はやり取りの境目にならないので、次の `request` が来たときに一緒に古いぶんが落ちる）。
      return {
        ...state,
        records: [
          ...state.records,
          { kind: "question", questions: event.questions, answers: event.answers },
        ],
      }
    // 書きかけのまま終わったターン（中断など）の本文を捨てず、確定した記録に移す。
    case "turn-finished": {
      const ending = turnEnding(event.outcome, state.apiTrouble)
      // `diaryWriting` はここでは動かさない（振り返りは会話とは別の使い捨ての問い合わせで並んで進むため）。
      return {
        ...recordTurnFailure(settleUtterance(state), ending),
        turn: finishTurn(state.turn, at, ending),
        lastTurnFinishedAt: lastTurnFinishedAtOf(state, at),
        reportDrafting: { kind: "idle" },
        usageReview: settleUsageReview(state.usageReview),
        apiTrouble: { kind: "none" },
      }
    }
    case "session-ended":
      // `diaryWriting` はここでは動かさない（`turn-finished` と同じ理由）。
      return {
        ...settleUtterance(state),
        reportDrafting: { kind: "idle" },
        endedReason: event.reason,
        turn: finishTurn(state.turn, at, { kind: "ended" }),
        lastTurnFinishedAt: lastTurnFinishedAtOf(state, at),
        backgroundTasks: [],
        usageReview: settleUsageReview(state.usageReview),
        apiTrouble: { kind: "none" },
      }
    case "api-retry":
      return { ...state, apiTrouble: { kind: "retrying", at, ...event.retry } }
    case "api-error":
      return { ...state, apiTrouble: { kind: "errored", error: event.error } }
    case "rate-limit-changed":
      return { ...state, rateLimit: event.rateLimit }
    case "conversation-cleared":
      // `/clear` で会話が消えたら、画面に残っている前の会話も消す（`records` も空にする）。
      // キャラクター・セッション情報・答え待ちの列は残す（`pending` の正典はサーバの待ち行列なので、状態側で空にすると実際の待ちと食い違う）。
      return {
        ...state,
        speeches: [],
        speechExpression: INITIAL_SESSION_STATE.speechExpression,
        speechCalledInTurn: false,
        bodiesInTurn: NO_TURN_BODIES,
        records: [],
        partialUtterance: "",
        reportDrafting: { kind: "idle" },
        welcomeGreeting: { kind: "none" },
      }
    case "tasks-changed":
      return { ...state, tasks: event.tasks }
    case "recommendation-changed":
      return { ...state, recommendation: event.cards }
    case "welcome-greeting-changed":
      return { ...state, welcomeGreeting: event.state }
    case "sessions-changed":
      // `sessionId` もここで決まる（`session-info` は最初の依頼まで届かないので、それまで「いまどのセッションに居るか」を言えるのはこの経路だけ）。
      // 新規に起こしたときは `current` が undefined で、そのときは今の `session` を動かさない。
      // すでに `running` なら `permissionMode` は引き継ぎ、`sessionId` だけ差し替える。`starting` / `identified` からは `sessionId` だけの `identified` になる。
      return {
        ...state,
        sessions: event.sessions,
        session:
          event.current === undefined
            ? state.session
            : state.session.kind === "running"
              ? { ...state.session, sessionId: event.current }
              : { kind: "identified", sessionId: event.current },
      }
    case "character-changed": {
      // `kind` と `packs` を外すと、残りがちょうど `CharacterInfo`。
      // 項目を1つずつ手で写さないことで、`CharacterInfo` に項目が増えても畳み込みが黙って落とさない（`satisfies` で残りの形を検査する）。
      const { kind: _kind, packs, ...character } = event
      return { ...state, character: character satisfies CharacterInfo, characterPacks: packs }
    }
    case "token-usage":
    case "step-usage":
      // 画面に出すものが何も無い（数の記録は `~/.tsukumo/token-usage/` へ書くだけ）。ここで畳むとブラウザ側にも同じ数を持たせることになるので、姿は変えない。
      return state
    case "chat-mode-changed":
      return { ...state, chatMode: event.chat }
    case "chat-topics-changed":
      return { ...state, chatTopics: event.topics }
    case "remembered-lines-changed":
      return { ...state, rememberedLines: event.lines }
    case "session-default-changed":
      return { ...state, sessionDefault: event.sessionDefault }
    case "visit-enabled-changed":
      return { ...state, visitEnabled: event.visitEnabled }
    case "compact-boundary":
      return { ...state, records: [...state.records, { kind: "compact-boundary" }] }
    case "background-tasks-changed": {
      const ended = delegateEndedRecords(state.records, event.tasks)
      return {
        ...state,
        backgroundTasks: event.tasks,
        records: ended.length === 0 ? state.records : [...state.records, ...ended],
      }
    }
    case "usage-review-stage":
    case "usage-review-result":
    case "usage-proposal-dismissed":
      return {
        ...state,
        ...applyUsageReviewEvent(
          { usageReview: state.usageReview, previousUsageReview: state.previousUsageReview },
          event,
          at,
          state.turn.kind === "running" ? state.turn.startedAt : at,
        ),
      }
    case "diary-requested":
    case "diary-drafting":
    case "diary-stage":
    case "diary-written":
    case "diary-failed":
      return { ...state, diaryWriting: applyDiaryEvent(state.diaryWriting, event, at) }
    case "visit-started":
    case "visit-line-advanced":
    case "visit-ended":
      return { ...state, visit: applyVisitEvent(state.visit, event, at) }
    case "history-restored":
      // ここまでに積んだ依頼とセリフは、前のセッションを組み直したもの。流し直したときに打った時刻を捨て、「時刻が分からない」に書き換える。
      // 起こし直すと記録は空から始まるので、ここまでの記録はすべて再生のぶんになる。
      return { ...state, records: state.records.map(withRestoredTime) }
  }
}

/**
 * メインの `work_plan` の呼び出しを積む記録。
 * 同じ依頼の最後の段取りが委譲の合図から引いたものなら、全部の段を終えた呼び出しだけをその段取りの全部済みとして積み、ほかは積まない。
 */
function mainWorkPlanRecords(
  records: readonly SessionRecord[],
  event: Extract<SessionEvent, { readonly kind: "work-plan" }>,
): readonly SessionRecord[] {
  const delegated = delegatedWorkPlanRecord(records)
  if (delegated === undefined) {
    return [
      {
        kind: "work-plan",
        phases: event.phases,
        current: event.current,
        phaseSummary: event.phaseSummary,
        source: "main",
      },
    ]
  }
  return event.current === event.phases.length
    ? [{ ...delegated, current: delegated.phases.length, phaseSummary: "" }]
    : []
}

/**
 * 委譲の合図を積む記録（合図から引き直した段取り）。
 * 同じ依頼にメインの段取りがまだ無いときと、同じ依頼の最後の段取りが合図から引いたもので、引き直すと段の数が変わるか位置が後ろへ戻るときは積まない。
 */
function delegateSignalRecords(
  records: readonly SessionRecord[],
  signal: Extract<SessionEvent, { readonly kind: "delegate-signal" }>,
): readonly SessionRecord[] {
  const latest = recordsOfLastRequest(records).findLast(isWorkPlanRecord)
  if (latest === undefined) {
    return []
  }
  const plan = delegatedWorkPlan(workPlanOf(latest), signal)
  const backward =
    latest.source === "delegate-signal" &&
    (plan.phases.length !== latest.phases.length || plan.current < latest.current)
  return backward ? [] : [{ kind: "work-plan", ...plan, source: "delegate-signal" }]
}

/**
 * 背景のタスクの顔ぶれが変わったときに積む記録。
 * 顔ぶれにサブエージェントが1つも無く、同じ依頼の最後の段取りが委譲の合図から引いたものなら、それを `delegate-ended` で積み直す。
 */
function delegateEndedRecords(
  records: readonly SessionRecord[],
  tasks: readonly BackgroundTask[],
): readonly SessionRecord[] {
  const delegated = delegatedWorkPlanRecord(records)
  return delegated === undefined || tasks.some((task) => task.kind === "agent")
    ? []
    : [{ ...delegated, source: "delegate-ended" }]
}

/** 同じ依頼の最後の段取りの記録が委譲の合図から引いたものなら、その記録。 */
function delegatedWorkPlanRecord(records: readonly SessionRecord[]) {
  const latest = recordsOfLastRequest(records).findLast(isWorkPlanRecord)
  return latest?.source === "delegate-signal" ? latest : undefined
}

/** 最後の依頼より後ろの記録（依頼が無ければ全部）。 */
function recordsOfLastRequest(records: readonly SessionRecord[]): readonly SessionRecord[] {
  return records.slice(records.findLastIndex((record) => record.kind === "request") + 1)
}

/**
 * 依頼・セリフ・ツールの記録を「時刻が分からない」にする（他の種類は時刻を持たないのでそのまま）。
 * ツールは `startedAt` と、終わっていれば `status.finishedAt` の両方を畳み直す
 * （`tool-started` / `tool-finished` は再生でも replay した時刻を積んでいるので、`stamped` のままだと replay の速さが本物の所要時間に見えてしまう）。
 */
function withRestoredTime(record: SessionRecord): SessionRecord {
  if (record.kind === "request" || record.kind === "speech") {
    return { ...record, time: { kind: "restored" } }
  }
  if (record.kind === "tool") {
    return {
      ...record,
      startedAt: { kind: "restored" },
      status:
        record.status.kind === "finished"
          ? { ...record.status, finishedAt: { kind: "restored" } }
          : record.status,
    }
  }
  return record
}

/**
 * ターンの始まりを畳む（記録は動かさない）。`request` と「記録を持たないターンの始まり」
 * （`turn-started`）で共通の部分で、積むものがあるかどうかだけが違う。
 */
function beginTurn(state: SessionState, at: number): SessionState {
  return {
    ...state,
    // 送信した時点で吹き出しを空にする。
    // 前のターンの一言が残ったままだと、次のターンに移ったことが画面から分からない。
    speeches: [],
    // 表情も既定へ戻す。次の `speak` が来るまではこのままで、ツールの実行状況では動かない。
    speechExpression: INITIAL_SESSION_STATE.speechExpression,
    partialUtterance: "",
    reportDrafting: { kind: "idle" },
    turn: { kind: "running", startedAt: at },
    nextTurnId: state.nextTurnId + 1,
    speechCalledInTurn: false,
    bodiesInTurn: NO_TURN_BODIES,
    apiTrouble: { kind: "none" },
  }
}

/**
 * ターンの終わり方を、失敗だったかどうかに畳む（中断は失敗にしない）。
 * 失敗の理由が API のエラーなら、そのターンで届いた種類を足す
 * （`assistant` の `error`（`errored`）、無ければ最後の呼び直しの知らせ（`retrying`。呼び直しを使い切って止まったとき）、どちらも無ければ `unknown`）。
 */
function turnEnding(outcome: TurnOutcome, trouble: ApiTrouble): TurnEnding {
  return outcome.kind === "failed"
    ? { kind: "failed", failure: toTurnFailure(outcome.cause, trouble) }
    : { kind: "ended" }
}

function toTurnFailure(cause: TurnFailureCause, trouble: ApiTrouble): TurnFailure {
  if (cause.kind !== "api-error") {
    return cause
  }
  return { kind: "api-error", error: trouble.kind === "none" ? "unknown" : trouble.error }
}

/** 失敗で終わったなら、理由を記録の末尾に積む（{@link SessionRecord} の `turn-failure`）。 */
function recordTurnFailure(state: SessionState, ending: TurnEnding): SessionState {
  return ending.kind === "failed"
    ? { ...state, records: [...state.records, { kind: "turn-failure", failure: ending.failure }] }
    : state
}

/**
 * ターンの終わりを畳む（`turn-finished` と `session-ended` で共通）。
 * 始まっていないターンは終われないので、まだ一度も依頼が無ければ `idle` のまま返す（依頼より先に `session-ended` が届く経路がある。そこでは立ち絵の「完了の反応」も出さない）。
 * 終わったあとにもう一度届いたときは、起点を動かさずに終わった時刻だけ進める。
 */
function finishTurn(turn: TurnProgress, at: number, ending: TurnEnding): TurnProgress {
  if (turn.kind === "idle") {
    return turn
  }
  return { kind: "finished", startedAt: turn.startedAt, finishedAt: at, ending }
}

/**
 * {@link SessionState.lastTurnFinishedAt} を進める。
 * {@link finishTurn} と同じ判定を揃えて使い（始まっていないターンでは進めない）、実際にターンが終わったときだけ `at` にする。
 */
function lastTurnFinishedAtOf(state: SessionState, at: number): number | undefined {
  return state.turn.kind === "idle" ? state.lastTurnFinishedAt : at
}

/**
 * claude が自分で始めた続きのターン（`turn-resumed`）。
 * 進行中の印と SDK ターンごとの持ち物は {@link beginTurn} と同じに戻すが、吹き出しのセリフと表情は持ち越し、ターンの通し番号も進めない（同じやり取りの続き）。
 * 始まった時刻も付け直さない（入力欄の経過時間が、背景のタスクを挟んだ続きのターンでも依頼を送った時刻から数える）。
 */
function resumeTurn(state: SessionState, at: number): SessionState {
  return {
    ...state,
    partialUtterance: "",
    reportDrafting: { kind: "idle" },
    turn: { kind: "running", startedAt: state.turn.kind === "idle" ? at : state.turn.startedAt },
    bodiesInTurn: NO_TURN_BODIES,
    apiTrouble: { kind: "none" },
  }
}

/** 書きかけの本文を確定した記録に移す。空のときは何もしない（空の本文を積まない）。 */
function settleUtterance(state: SessionState): SessionState {
  if (isBlankText(state.partialUtterance)) {
    return { ...state, partialUtterance: "" }
  }

  return {
    ...state,
    records: [...state.records, { kind: "detail", markdown: state.partialUtterance }],
    partialUtterance: "",
  }
}

/** 書いていた `report` の呼び出しが届いた・終わったなら、書いている途中の印を下ろす。 */
function settleReportDrafting(state: SessionState, toolUseId: string): SessionState {
  return state.reportDrafting.kind === "drafting" && state.reportDrafting.toolUseId === toolUseId
    ? { ...state, reportDrafting: { kind: "idle" } }
    : state
}

/** 新しい答え待ちの列に届いた時刻を打つ。前から待っている id は前の時刻のまま。 */
function stampPending(
  previous: readonly StampedPendingAsk[],
  next: readonly PendingAsk[],
  at: number,
): readonly StampedPendingAsk[] {
  return next.map((ask) => ({
    ...ask,
    askedAt: previous.find((waiting) => waiting.id === ask.id)?.askedAt ?? at,
  }))
}

/**
 * ツール1件の結果を記録に合わせる。対応する `tool_use` が見つからないときは何もしない（対応が取れない結果を作らない）。
 * `isError` が true のときは `lastToolFailureAt` に `at` を打つ。
 * 記録の `status` に入れるのは、失敗した出力を {@link MAX_TOOL_TEXT_LENGTH} 字で切ったものだけ（成功した本文は捨てる）。
 */
function finishTool(
  state: SessionState,
  toolUseId: string,
  content: string,
  isError: boolean,
  at: number,
): SessionState {
  const index = state.records.findIndex(
    (record) => record.kind === "tool" && record.toolUseId === toolUseId,
  )
  const record = index === -1 ? undefined : state.records[index]
  if (record === undefined || record.kind !== "tool") {
    return state
  }

  return {
    ...state,
    records: [
      ...state.records.slice(0, index),
      {
        ...record,
        status: {
          kind: "finished",
          finishedAt: { kind: "stamped", at },
          result: isError
            ? { kind: "failed", output: clipText(content, MAX_TOOL_TEXT_LENGTH) }
            : { kind: "succeeded" },
        },
      },
      ...state.records.slice(index + 1),
    ],
    lastToolFailureAt: isError ? at : state.lastToolFailureAt,
  }
}

/**
 * 直近何ターンぶんだけを残す。ターンの境目は `request`（{@link splitIntoTurns}）なので、古いターンから数えて窓の外に出たものをまとめて落とす。
 * 窓の広さは `chatMode` で選ぶ（{@link MAX_SESSION_STATE_TURNS}）。
 * 依頼より前の記録はターンに数えず、窓を超えて古いターンを落とすときに一緒に落とす。
 */
function trimToRecentTurns(
  records: readonly SessionRecord[],
  chatMode: boolean,
): readonly SessionRecord[] {
  const limit = chatMode ? MAX_SESSION_STATE_TURNS.chat : MAX_SESSION_STATE_TURNS.work
  const turns = splitIntoTurns(records).flatMap((turn) =>
    turn.kind === "pre-request" ? [] : [turn],
  )
  if (turns.length <= limit) {
    return records
  }

  return turns.slice(-limit).flatMap((turn) => [turn.request, ...turn.records])
}
