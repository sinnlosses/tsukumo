// セッションの中で起きた出来事（`SessionEvent`）の語彙。`kind` ごとの doc コメントが契約の置き場。
// ここは型だけで、SDK のメッセージからの変換（SDK の形に結び付いた外部由来の値の検証）は駆動の側が持つ。
// 会話の内容がイベントに入るので、外に出さない・複製しない・ログに出さない。

import { isPlainObject } from "remeda"
import { z } from "zod"

import type { CharacterInfo, CharacterPackEntry } from "../character-pack/character.ts"
import type { Expression } from "../character-pack/expression.ts"
import type { EffortLevel } from "../command.ts"
import type { DiaryEvent } from "../diary/diary.ts"
import type { RecommendationCard } from "../recommendation/recommendation-card.ts"
import type { WelcomeGreetingState } from "../recommendation/welcome-greeting.ts"
import type { ReportSection } from "../report/report-block.ts"
import type { ReportCheck } from "../report/report-check.ts"
import type { ReportTask } from "../report/report-task.ts"
import type { TaskSummaryResult } from "../repository/task-summary.ts"
import type { ApiErrorKind, ApiRetry } from "../session-driver/api-trouble.ts"
import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { PendingAsk } from "../session-driver/pending-ask.ts"
import type { RecordedPromptImage } from "../session-driver/prompt-image.ts"
import type { Question, QuestionAnswer } from "../session-driver/question.ts"
import type { RateLimit } from "../session-driver/rate-limit.ts"
import type { TurnOutcome } from "../session-driver/turn-failure.ts"
import type { ModelTokenUsage, StepTokenUsage, TurnUsageScope } from "../token-usage/token-usage.ts"
import type { UsageReviewEvent } from "../usage-review/usage-review.ts"
import type { SessionChoice } from "./session-choice.ts"
import type { SessionDefault } from "./session-default.ts"
import type { WorkPlan, WorkPlanClosing } from "./work-plan.ts"

/**
 * `/` 補完に出すコマンド1件。
 * 説明は SDK 側が持っている（`init` の `slash_commands` は名前だけだが、`supportedCommands()` と `system` の `commands_changed` が名前と説明の組を返す）。
 * 組み込みコマンドも含めて説明が付くので、tsukumo 側に説明の表を持たない。説明が空文字のコマンドは `undefined` に倒す（名前だけ出す）。
 */
export type CommandDescription = {
  readonly name: string
  readonly description: string | undefined
}

/**
 * SDK のモデル一覧（`supportedModels()`）1件のうち、effort に関わる部分だけを写したもの。
 * 「いま効いている値」ではなく「対応の有無・選べる段」だけ。
 * `model` は SDK の `ModelInfo.value` で、エイリアスと一致するとは限らない（実測: `fable` は `claude-fable-5-1` のような値になる）。エイリアスへの対応付けは読む側が持つ。
 */
export type ModelEffortSupport = {
  readonly model: string
  readonly supportsEffort: boolean
  readonly effortLevels: readonly EffortLevel[]
}

/**
 * `report` の締めのセリフ（`report` ツールの `closing` 引数）。`none` は `closing` を持たなかった
 * ころの呼び出しで、transcript から組み直したときにだけ現れる。
 */
export type ReportClosing =
  | Extract<SessionEvent, { readonly kind: "speech" }>
  | { readonly kind: "none" }

/** `report` の待ちの一言（`report` ツールの `waitingLine` 引数）。`none` は本体が書かなかった。 */
export type ReportWaitingLine =
  | Extract<SessionEvent, { readonly kind: "speech" }>
  | { readonly kind: "none" }

/**
 * tsukumo 内部のイベント。
 * SDK のメッセージ由来のものと、駆動が自分で起こすもの（`request` / `pending-changed` / `session-ended`）が1本の流れに混ざり、畳み込みはどちらから来たかを区別しない。
 * 未知の `kind` で落ちない（畳み込みは知らない種別を無視する）ので、イベントを足しても `PROTOCOL_VERSION` は上げない。
 */
export type SessionEvent =
  /**
   * `system` の `init`。プロンプトを送るたびに届くので「新しいセッション」の合図にしない（実測）。
   * `slashCommands` / `terminalSlashCommands` は毎回上書きでよい。
   */
  | {
      readonly kind: "session-info"
      readonly sessionId: string
      readonly model: string | undefined
      readonly permissionMode: string | undefined
      readonly slashCommands: readonly string[]
      /**
       * `slash_commands` のうち、端末専用（UX が端末に結び付く。`doctor` / `color` / `reload-plugins` など）のもの。入力欄の補完からは除く。
       * SDK 側でフィールド自体が無いことがあるので、そのときは空配列。
       */
      readonly terminalSlashCommands: readonly string[]
    }
  /**
   * コマンドの説明が届いた（{@link CommandDescription}）。名前の一覧（`session-info`）とは別の経路で来るので、別のイベントにしてある。
   * 端末専用かどうかは分からないので、補完に出す/出さないの判断は名前の一覧の側が持つ。
   */
  | {
      readonly kind: "command-descriptions"
      readonly descriptions: readonly CommandDescription[]
    }
  /**
   * 起動直後に分かったプラン（Agent SDK の `accountInfo()` の `subscriptionType`）。駆動が起動直後に1回だけ取りに行く。
   *
   * `email` / `organization` はここに乗らない（`AccountInfo` にはアカウントを特定する値も入っているので、取り出すのは `subscriptionType` だけ）。
   *
   * 値は SDK が返したものをそのまま出す（実測では `"Claude Pro"` のように人が読める文字列。tsukumo 側に表示名の対応表は持たない）。
   *
   * 取れなかったとき（`subscriptionType` が無い・呼び出しが落ちた）は流れない（API キーや Bedrock のときは元々この値が無い。`sdk.d.ts` の `AccountInfo`）。
   */
  | { readonly kind: "plan"; readonly plan: string }
  /**
   * 利用者が送った依頼。ターンの境目になる（駆動側が送信時に起こす）。
   *
   * `images` は添えた画像の控えと、棚の原寸を指す id の組（添えていなければ空）。
   * 原寸はここに載らない（原寸はモデルへ渡り、あとは棚が直近ぶんだけメモリで持つ）。
   */
  | {
      readonly kind: "request"
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
    }
  /**
   * 背景のタスクが残っているあいだに利用者が送った言葉（脇の話）。
   * `request` と違ってターンの境目にならず、親のやり取りに吊るす（ターンの通し番号も進めない）。
   * 脇の話かどうかはサーバが送った瞬間に決める（`docs/architecture/display.md`「脇の話」）。
   */
  | {
      readonly kind: "aside"
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
    }
  /**
   * 記録を持たないターンの始まり（キャラクターから話しかけてもらう）。
   * `request` と同じくターンの境目になるが、文面を持たない（送った一言はログにも記録にも残さないので、イベントにも載せない）。
   * 落とすのは組み立ての側ではなくここで、記録に積まないので、雑談のログにもメインビューにも雑談の会話のアーカイブにも初めから流れようが無い。
   */
  | { readonly kind: "turn-started" }
  /**
   * claude が自分で始めた続きのターン（背景のタスクが終わった知らせや、サブエージェントの `SendMessage` を受けて、依頼なしで続きを報告するターン）。
   * 実測: `task_notification` のあと、依頼を送らなくても `init` → `assistant` → `result` が届く。
   *
   * 記録を持たない。新しいターンではなく同じやり取りの続きなので、吹き出しのセリフと表情は持ち越す
   * （空にすると、合図が届くたびに吹き出しが消える）。
   */
  | { readonly kind: "turn-resumed" }
  /** 書きかけのターンの本文。完成した本文が来るまでの仮。 */
  | { readonly kind: "partial-utterance"; readonly text: string }
  /** 完成したターンの本文。仮の本文を置き換える。 */
  | { readonly kind: "utterance"; readonly text: string }
  /** `speak` ツールの呼び出し。セリフと表情。 */
  | { readonly kind: "speech"; readonly text: string; readonly expression: Expression }
  /**
   * メインが呼んだ `speak` の呼び出し。サーバの中だけで流れる。
   * `SpeechReview.pass` が同じ `toolUseId` の `tool-finished` まで預かり、差し戻されていなければ `speech` に変えて流す（畳み込み・ブラウザには届かない）。
   */
  | {
      readonly kind: "speak-called"
      readonly toolUseId: string
      readonly speech: Extract<SessionEvent, { readonly kind: "speech" }>
    }
  /**
   * メインが `report` ツールの引数を書き始めた（`includePartialMessages` の断片で、呼び出しの塊が開いた合図）。
   * 立ち絵の「書いている」の材料で、同じ `toolUseId` の `report` か `tool-finished` が届くまで続く。中身（引数の断片）は運ばない。
   */
  | { readonly kind: "report-drafting"; readonly toolUseId: string }
  /**
   * `report` ツールの呼び出し。メインが呼んだものだけが届く（サブエージェントの呼び出しは変換で捨てる）。
   * `sections`（本文の節）と `checks`（検証結果）は無ければ空の配列、`favor` は無ければ空の文字列、`task` と `workPlanClosing`（段の閉じ方）は無ければ `none`。
   * `toolUseId` は呼び出しの id で、差し戻しが同じ呼び出しの `tool-finished` と突き合わせるのに使う。
   * `closing`（締めのセリフ）は描いたあとに差し戻しが `speech` として出すもので、画面の状態はこの欄を読まない。
   * `waitingLine`（待ちの一言）は記録に写り、依頼を待つ間に `shownReaction` が出す。
   * `unknownBlockCount` は知らない種類で境界で落とした塊の数で、画面の状態は読まない。
   * `sessionSummary` はセッション全体の要約で、書かれていなければ undefined。レポートには描かず、切り替え画面が transcript から読み戻す。
   */
  | {
      readonly kind: "report"
      readonly toolUseId: string
      readonly conclusion: string
      readonly sections: readonly ReportSection[]
      readonly favor: string
      readonly checks: readonly ReportCheck[]
      readonly task: ReportTask
      readonly workPlanClosing: WorkPlanClosing
      readonly closing: ReportClosing
      readonly waitingLine: ReportWaitingLine
      readonly unknownBlockCount: number
      readonly sessionSummary: string | undefined
    }
  /**
   * `report` の handler が差し戻したときに流す。`reasons` は差し戻しの種類の名前だけで、本文も文面も持たない。
   */
  | { readonly kind: "report-rejected"; readonly reasons: readonly string[] }
  /**
   * `work_plan` ツールの呼び出し（段取り）。メインが呼んだもので、`parseWorkPlan` を通ったものだけが届く（サブエージェントの呼び出しは変換で捨てる）。
   * 毎回、段の並びごと届く。欄の意味は `WorkPlan`。
   */
  | ({ readonly kind: "work-plan" } & WorkPlan)
  /**
   * メインが呼んだ `work_plan` の呼び出し。サーバの中だけで流れる。
   * `WorkPlanReview.pass` が同じ `toolUseId` の `tool-finished` まで預かり、差し戻されていなければ `work-plan` に変えて流す（畳み込み・ブラウザには届かない）。
   */
  | {
      readonly kind: "work-plan-called"
      readonly toolUseId: string
      readonly plan: WorkPlan
    }
  | {
      readonly kind: "tool-started"
      readonly toolUseId: string
      readonly name: string
      readonly input: unknown
      /**
       * サブエージェントの中で動いたときの、起こした側の Agent ツールの `toolUseId`。
       * トップレベルのターンでは undefined（SDK メッセージの `parent_tool_use_id` が `null`）。
       */
      readonly parentToolUseId: string | undefined
    }
  | {
      readonly kind: "tool-finished"
      readonly toolUseId: string
      readonly content: string
      readonly isError: boolean
    }
  /**
   * 背景で走らせたツールが走り終えた（SDK の `system` / `task_notification` の `tool_use_id`）。
   * 完了・失敗・停止を区別しない。
   * 前景のツールでも数秒を越えると届く（実測）ので、効かせるかは畳み込みが記録の側で決める。
   */
  | { readonly kind: "background-tool-finished"; readonly toolUseId: string }
  /** 答え待ちの列が変わった（積まれた・解決した）。 */
  | { readonly kind: "pending-changed"; readonly pending: readonly PendingAsk[] }
  /**
   * 質問（`AskUserQuestion`）に利用者が答えた。答えが確定した時点で1回だけ流す。
   * `pending-changed` は列が空になったことしか伝えないので、「何を聞いて、どう答えたか」を残せるのはこの経路だけ。
   *
   * `answers[i]` は `questions[i]` に対して選んだ答えの並び（{@link QuestionAnswer}）。
   * 質問文も答えも会話の内容なので、ログに出さない・外へ出さない。
   * `toolUseId` は答え待ちのときの `PendingAsk` の `id` と同じで、preview の画像の棚の鍵になる。
   * `briefed[i]` は `questions[i]` に合う添え書きが付いていたか、`sentBack` はその答えまでに添え書きの不足で断った回数
   * （質問の使われ方の記録の欄。字は運ばない）。
   */
  | {
      readonly kind: "question-answered"
      readonly toolUseId: string
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
      readonly briefed: readonly boolean[]
      readonly sentBack: number
    }
  /**
   * ターンが終わった（`result`。サブエージェントの中の `result` は変換で捨てる）。`outcome` は終わり方（{@link TurnOutcome}）。中断は失敗にしない。
   * 駆動が自分で起こすのは fake driver の中断（`interrupted`）と、復元の再生の区切り（`completed`）。
   */
  | { readonly kind: "turn-finished"; readonly outcome: TurnOutcome }
  /**
   * API の呼び出しが失敗し、待ってから呼び直す（SDK の `system` / `api_retry`）。呼び直すたびに1回ずつ届く。
   * 呼び直しが実った合図は来ないので、畳み込みはモデルが何かを出したところで「呼び直し中」を下ろす。
   * サブエージェントの呼び直しも見分けずに届く（SDK のメッセージに持ち場の印が無い）。
   */
  | { readonly kind: "api-retry"; readonly retry: ApiRetry }
  /**
   * API がエラーを返した（`assistant` の `error`。メインのものだけ）。
   * これだけではターンの失敗にしない（本体が立て直して続けることがある。出力の上限など）。
   * 失敗で終わったかは続く `turn-finished` の `outcome` が決め、この種類がその理由になる。
   */
  | { readonly kind: "api-error"; readonly error: ApiErrorKind }
  /** 利用上限の状態が変わった（SDK の `rate_limit_event`。型定義は「変わったときに届く」と言う）。届くたびに丸ごと置き換える。 */
  | { readonly kind: "rate-limit-changed"; readonly rateLimit: RateLimit }
  /**
   * そのターンの終わりに SDK が渡してきたトークンの使用量（`result` の `modelUsage`）。
   * 運ぶのは `query()` の中の累計そのままで、ターンごとの増分に直すのは受け取った側。
   *
   * 画面には出ない。畳み込みは何もせず、行き先は `~/.tsukumo/token-usage/` の記録だけ。
   * `turn-finished` に相乗りさせずに別のイベントにしてあるのは、使用量を持たない終わり方があるから（復元の再生・fake driver・`modelUsage` の無い `result`）。
   * 数とモデルの名前だけで、会話の内容は入らない。
   */
  | { readonly kind: "token-usage"; readonly cumulative: readonly ModelTokenUsage[] }
  /**
   * assistant 1ステップぶんの使用量（`assistant` メッセージの `message.usage`）。
   * ターンの中を「メインループぶん」と「サブエージェントぶん」に割れるのはこの経路だけ
   * （`result` の `modelUsage` は両方を混ぜた累計なので、モデルが同じだと割れない）。
   *
   * `messageId` を運ぶのは、同じ `message.id` のステップが何度も届くから。
   * 返答が流れている間は完成したブロックごとに `assistant` が出て、`message.usage` はまだ確定値ではない
   * （`sdk.d.ts`: 「several consecutive assistant messages can share message.id ... message.usage is not final」）。
   * 同じ `message.id` の最後を取るのは受け取った側。
   *
   * 画面には出ない（畳み込みは何もしない）。行き先は `~/.tsukumo/token-usage/` の記録だけ。数だけで、本文も思考も入らない。
   */
  | {
      readonly kind: "step-usage"
      readonly messageId: string
      readonly scope: TurnUsageScope
      readonly usage: StepTokenUsage
    }
  /**
   * `/clear` で会話が消された（SDK の `conversation_reset`。実測）。
   * tsukumo は `/clear` という文字列を見ていない。`/` コマンドは依頼の文面としてそのまま本体へ渡り、本体が会話を捨てたときにこのメッセージを流してくる
   * （`new_conversation_id` 付き。直後に新しい `session_id` の `system/init` が届く）。
   *
   * `/compact` では流れない（同じ実測で `system/status` + 同じ `session_id` の `init` だけだった）。要約は会話を消さないので、ここで拾う必要も無い。
   */
  | { readonly kind: "conversation-cleared" }
  /** `query()` の反復が終わった（正常終了・例外のどちらも）。プロセスは落とさない。 */
  | { readonly kind: "session-ended"; readonly reason: string }
  /**
   * モデルが変わったことを、`session-info`（`init`）を待たずに先回りで伝える。出どころは2つ:
   *
   * 1. `/model` のローカルコマンドが実行された合図（`assistant` に乗る `local_command_run: { command: "model", args }`。実測）。`init` は1ターン遅れる
   * 2. `session.setModel` を駆動が確定させたとき。
   *    駆動が実際に切り替えたことを確認してから出すので、ブラウザ側のローカル echo ではない（駆動を経ずにこのイベントを合成しない）
   *
   * `model` はそのまま状態へ運ぶ値。
   * 1 のときは `/model` に渡した引数（前後の空白だけ除いてある）で、エイリアスとして知っているかどうかの検証はしていない。2 のときは `MODEL_ALIASES` の値そのもの。
   * `MODEL_ALIASES` と完全一致するときだけ状態を更新する判断は畳み込み側が持つ（知らない値では状態を変えず、次の `init` を待つだけにする）。
   */
  | { readonly kind: "model-changed"; readonly model: string }
  /**
   * 起動直後に分かった、モデルごとの effort の対応（{@link ModelEffortSupport}）。駆動が起動直後に1回だけ取りに行く（`supportedModels()`）。
   * 取れなかったとき（呼び出しが落ちた・空だった）は流れない。
   */
  | { readonly kind: "model-effort-support"; readonly models: readonly ModelEffortSupport[] }
  /**
   * いま効いている effort が分かった。
   * 起こした直後（起こした値）・切り替えを受け付けたとき・ターンが終わるたび（`Stop` フック入力の `effort.level`）に届く。
   */
  | { readonly kind: "effort-changed"; readonly effort: EffortLevel }
  /**
   * タスクの一覧が変わった（Beads の課題を見て起こす）。
   * 起こしてから最初の見回りで必ず1回届く。読めない・消えたときは `tasks: { kind: "unknown" }`（{@link TaskSummaryResult}。サイドバーの「不明」表示に対応する）。
   */
  | { readonly kind: "tasks-changed"; readonly tasks: TaskSummaryResult }
  /**
   * おすすめの札が変わった（タスク一覧が届いて候補が変わったとき。出し手はサーバの推薦役）。
   * 候補が前と同じなら流れない。空の並びは「まだ無い」で、候補が変わってキャッシュに無いときに一度流れ、問い合わせが通ればその結果がもう一度流れる。
   */
  | { readonly kind: "recommendation-changed"; readonly cards: readonly RecommendationCard[] }
  /**
   * 迎えの挨拶の状態が変わった（新しく起こした・続きから起こしたセッションと `/clear` のたび。出し手はサーバの `greetWelcome`）。
   * `writing` → `written` または `unwritten` の順に流れる。
   */
  | { readonly kind: "welcome-greeting-changed"; readonly state: WelcomeGreetingState }
  /**
   * キャラクターパックが決まった・一覧が変わった（起こしたとき・起こし直したときの1回ずつと、画面からパックを変えた・作ったとき）。
   * キャラビューが立ち絵を取りに行く先で、中身は URL だけ（素材そのものは乗らない）。
   *
   * 全パックぶんの一覧（`packs`。使用中以外のパックの姿も含む）も一緒に運ぶ。
   * 一覧が変わる契機はいま出しているパックが変わる契機と同じで、使用中の印（`inUse`）も持ち替えで動くので、イベントを分けない。
   */
  | ({ readonly kind: "character-changed" } & CharacterInfo & {
        readonly packs: readonly CharacterPackEntry[]
      })
  /**
   * 切り替え先として選べるセッションの一覧が分かった。
   * 駆動を起こすたび（起こし直しも）に流れる。
   * まずサーバがメモリに持っている一覧を流し、これは起こし直しの `hello` に入る。
   * transcript の一覧を読み直せたら、読み直した一覧をもう一度流し、これは `hello` より後に届く（`current` は同じ）。
   *
   * ターンのたびには流れない（印が付くのはターンが終わって少し後で、流すたびに transcript の一覧を読み直すことになる）。
   * 画面に出る最終更新時刻は起こした時点の姿。
   *
   * 中身は印から読めるものだけで、会話の内容は入らない。
   */
  | {
      readonly kind: "sessions-changed"
      readonly sessions: readonly SessionChoice[]
      /**
       * いま起こしたセッションのID（続きから始めなかったときは undefined ＝ 新規）。
       * `session-info` を待たずに「どれを出しているか」を言えるのはこの経路だけ（`init` は最初の依頼を送るまで届かない）。
       */
      readonly current: string | undefined
    }
  /**
   * 雑談モードに入っている／出ている。駆動を起こしたときと、`session.setChatMode` で起こし直したときの1回ずつ流れる。
   * 起こし直すと状態が初期値へ戻るので、このイベントが無いと画面は雑談中かどうかを見失う（`INITIAL_SESSION_STATE.chatMode` は `false`）。
   */
  | { readonly kind: "chat-mode-changed"; readonly chat: boolean }
  /**
   * 雑談のサイドバーの「最近の話題」に出す見出し（新しい順）。雑談で起こしたときと、定着があらすじを書き直したときに流れる。
   * 運ぶのは写しから取り出した見出しだけで、要約の本文は乗らない。取り出せなかった・写しがまだ無いときは空の並び。
   */
  | { readonly kind: "chat-topics-changed"; readonly topics: readonly string[] }
  /**
   * 雑談のサイドバーの「覚えていること」に出す一覧。
   * 雑談で起こしたときと、`remember` / `forget`（キャラクター自身）・画面の「編集」の `chat.forgetRememberedLine` のどれかで `persona.md` の `## 覚えたこと` が変わったときに流れる。
   *
   * 運ぶのは節の行そのもの（`- ` を外した文面、古い→新しいの順）。
   * 上限に当たった・一致する行が無かった・書けなかったときは流れない（変わらなかった回は知らせない）。
   */
  | { readonly kind: "remembered-lines-changed"; readonly lines: readonly string[] }
  /**
   * 新しいセッションの既定が分かった。駆動を起こしたときと、起こし直したときの1回ずつと、歯車から `session.setSessionDefault` で覚え直したときに流れる。
   * 運ぶのは覚えた値（読めなければ同梱の既定へ畳んだあとの値）で、いま動いているセッションの値ではない（そちらは `session-info` の `model` / `permissionMode`）。
   */
  | { readonly kind: "session-default-changed"; readonly sessionDefault: SessionDefault }
  /**
   * claude 自身の圧縮（`/compact`）が起きた（SDK の `system` / `compact_boundary`）。
   * 数値（`compact_metadata` の `pre_tokens` / `post_tokens` / `duration_ms`）は運ばない（画面に出さないものを契約に入れない）。
   * 画面に出すのは雑談のログの細い線1本だけで、文言は添えない。
   */
  | { readonly kind: "compact-boundary" }
  /**
   * 背景のタスクの顔ぶれが変わった（SDK の `system` / `background_tasks_changed`。実測: 背景の Bash・サブエージェントが始まったときと終わったときに1回ずつ届く）。
   * 運ぶのは変わったあとの全員で、受け取る側は丸ごと置き換える
   * （SDK の型定義が「REPLACE semantics」と言う水準の知らせ。始まり・終わりの対を数えないので、片方を取りこぼしても「動いている」が居残らない）。
   * 活動でないもの（SDK の `ambient`。見張り役など）は変換で落としてある。
   */
  | { readonly kind: "background-tasks-changed"; readonly tasks: readonly BackgroundTask[] }
  /** 見直しの欄を動かすイベント。 */
  | UsageReviewEvent
  /** 振り返りの進みを動かすイベント。 */
  | DiaryEvent

/** 時刻を打ったイベント1件。時刻はイベントの発生側（サーバ）が決める（ブラウザ側で読んだ時計を畳み込みに渡さない）。 */
export type StampedEvent = {
  readonly at: number
  readonly event: SessionEvent
}

/**
 * 前のセッションを組み直した出来事1件。時刻は transcript の `timestamp` から読めたものだけ `known` で、読めなければ `unknown`（推し量らない）。
 */
export type RestoredEvent = {
  readonly event: SessionEvent
  readonly time: { readonly kind: "known"; readonly at: number } | { readonly kind: "unknown" }
}

/**
 * 外から届いた値を {@link SessionEvent} として受け取るための封筒だけのスキーマ（`kind` を持つオブジェクトであること）。
 * 中身は検証しない（union を zod で二重に持つと、イベントにフィールドを足すたびに型とスキーマの2か所を直すことになる）。
 */
export const sessionEventSchema = z.custom<SessionEvent>(
  (value) => isPlainObject(value) && typeof value.kind === "string",
)

/** 時刻付きイベントのスキーマ。`at` だけを確かめ、イベントの中身は封筒どまり。 */
export const stampedEventSchema = z.object({
  at: z.number(),
  event: sessionEventSchema,
})
