// セッションの中で起きた出来事（`SessionEvent`）の語彙。**サーバとブラウザの両方が読む契約**
// なので shared に置く（docs/design.md 4.1）。
//
// **ここは型だけ**で、SDK のメッセージからの変換は core（src/server/core/sdk-message.ts）にある
// （変換は SDK の形に結び付いた「外部由来の値の検証」なので、両側が共有する契約には入れない）。
//
// **`SessionEvent` の union は zod にしない。** 状態にフィールドを足すたびに
// スキーマを二重に直す手間が移行の各段で効いてくるため、型は TS のまま持ち、境界では
// {@link sessionEventSchema} の封筒（`kind` があること）だけを確かめる。
//
// **会話の内容がイベントに入る。** 外に出さない・複製しない・ログに出さない
// （docs/coding-standards.md「会話内容の扱い」）。

import { isPlainObject } from "remeda"
import { z } from "zod"

import { type ApiErrorKind, type ApiRetry } from "./api-trouble.ts"
import { type BackgroundTask } from "./background-task.ts"
import { type CharacterInfo, type CharacterPackEntry } from "./character.ts"
import { type DiaryStage } from "./diary.ts"
import { type Expression } from "./expression.ts"
import { type PendingAsk } from "./pending-ask.ts"
import { type RecordedPromptImage } from "./prompt-image.ts"
import { type Question, type QuestionAnswer } from "./question.ts"
import { type RateLimit } from "./rate-limit.ts"
import { type SessionChoice } from "./session-choice.ts"
import { type SessionDefault } from "./session-default.ts"
import { type TaskSummaryResult } from "./task-summary.ts"
import { type ModelTokenUsage, type StepTokenUsage, type TurnUsageScope } from "./token-usage.ts"
import { type TurnOutcome } from "./turn-failure.ts"
import { type UsageReviewFindings, type UsageReviewStage } from "./usage-review.ts"

/**
 * `/` 補完に出すコマンド1件。**説明は SDK 側が持っている**（`init` の `slash_commands` は
 * 名前だけだが、駆動側の `supportedCommands()` と `system` の `commands_changed` が名前と説明の
 * 組を返す）。組み込みコマンドも含めて説明が付くので、tsukumo 側に説明の表を
 * 持たない。説明が空文字のコマンドは `undefined` に倒す（名前だけ出す）。
 */
export type CommandDescription = {
  readonly name: string
  readonly description: string | undefined
}

/**
 * tsukumo 内部のイベント。SDK のメッセージ由来のものと、駆動側（src/server/adapter/sdk-driver.ts）が
 * 自分で起こすもの（`request` / `pending-changed` / `session-ended`）が1本の流れに混ざる。
 * 受け取る側（src/shared/session-state.ts）はどちらから来たかを区別しない。
 *
 * **未知の `kind` で落ちない**（畳み込みは知らない種別を無視する）ので、イベントを足しても
 * `PROTOCOL_VERSION` は上げない（docs/design.md 4.5）。
 */
export type SessionEvent =
  /**
   * `system` の `init`。**プロンプトを送るたびに届く**ので「新しいセッション」の合図にしない
   * （実測。docs/requirements.md 4.1）。`slashCommands` / `terminalSlashCommands` は
   * 毎回上書きでよい。
   */
  | {
      readonly kind: "session-info"
      readonly sessionId: string
      readonly model: string | undefined
      readonly permissionMode: string | undefined
      readonly slashCommands: readonly string[]
      /**
       * `slash_commands` のうち、端末専用（UX が端末に結び付く。`doctor` / `color` /
       * `reload-plugins` など）のもの。**入力欄の補完からは除く**
       * （docs/display.md 4.2「入力欄」。除く計算は
       * src/shared/command-suggestion.ts の `commandCandidates`）。SDK 側でフィールド自体が無いことがあるので、そのときは空配列。
       */
      readonly terminalSlashCommands: readonly string[]
    }
  /**
   * コマンドの説明が届いた。**名前の一覧（`session-info`）とは別の経路で来る**ので、別の
   * イベントにしてある（駆動側の `supportedCommands()` の結果と、`system` の
   * `commands_changed` の押し出しの両方がここに入る）。端末専用かどうかは分からないので、
   * 補完に出す/出さないの判断は名前の一覧の側が持つ（src/shared/command-suggestion.ts）。
   */
  | {
      readonly kind: "command-descriptions"
      readonly descriptions: readonly CommandDescription[]
    }
  /**
   * 起動直後に分かった**プラン**（`docs/glossary.md`「プラン」。Agent SDK の `accountInfo()` の
   * `subscriptionType`）。`command-descriptions` と同じく駆動が起動直後に1回だけ取りに行く
   * （`src/server/adapter/sdk-driver.ts`）。
   *
   * **`email` / `organization` はここに乗らない** — 取り出すのは `subscriptionType` だけで、
   * 駆動の外へは出さない（`AccountInfo` にはアカウントを特定する値も入っている）。
   *
   * **値は SDK が返したものをそのまま出す**（実測では `"Claude Pro"` のように人が読める
   * 文字列。tsukumo 側に表示名の対応表は持たない——知らない値が増えても直さずに出せる）。
   *
   * **取れなかったとき（`subscriptionType` が無い・呼び出しが落ちた）は流れない**
   * （`command-descriptions` と同じ、動作中の一時的な失敗の扱い。API キーや Bedrock の
   * ときは元々この値が無い。`sdk.d.ts` の `AccountInfo`）。
   */
  | { readonly kind: "plan"; readonly plan: string }
  /**
   * 利用者が送った依頼。ターンの境目になる（駆動側が送信時に起こす）。
   *
   * `images` は添えた画像の**控えと、棚の原寸を指す id の組**（添えていなければ空）。
   * **原寸はここに載らない** — 原寸はモデルへ渡り、あとは棚（`src/server/core/prompt-image-shelf.ts`）
   * が直近ぶんだけメモリで持つ（`docs/requirements.md` 4.10）。
   */
  | {
      readonly kind: "request"
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
    }
  /**
   * **記録を持たないターンの始まり**（キャラクターから話しかけてもらう。`docs/screen-design.md` 13.7）。
   * `request` と同じくターンの境目になるが、**文面を持たない** — 送った一言はログにも記録にも
   * 残さないと決めたので、イベントにも載せない。
   *
   * **落とすのは組み立ての側ではなく、ここ。** 記録に積まないので、雑談のログ
   * （`src/shared/chat-log.ts`）にも仕事のメインビュー（`src/shared/main-view.ts`）にも
   * 雑談の会話のアーカイブにも、初めから流れようが無い。
   */
  | { readonly kind: "turn-started" }
  /**
   * **claude が自分で始めた続きのターン**（背景のタスクが終わった知らせや、サブエージェントの
   * `SendMessage` を受けて、依頼なしで続きを報告するターン。実測: `task_notification` のあと、
   * 依頼を送らなくても `init` → `assistant` → `result` が届く）。起こすのは SDK の口
   * （`src/server/core/self-started-turn.ts`）。
   *
   * `turn-started` と同じく記録を持たないが、**新しいターンではなく同じやり取りの続き**なので、
   * 吹き出しのセリフと表情は持ち越す（空にすると、合図が届くたびに吹き出しが
   * 「（まだ発話がありません）」に戻る）。
   */
  | { readonly kind: "turn-resumed" }
  /** 書きかけのターンの本文。完成した本文が来るまでの**仮**（docs/display.md 4.2）。 */
  | { readonly kind: "partial-utterance"; readonly text: string }
  /** 完成したターンの本文。仮の本文を置き換える。 */
  | { readonly kind: "utterance"; readonly text: string }
  /** `speak` ツールの呼び出し。セリフと表情（docs/glossary.md「セリフ」「表情」）。 */
  | { readonly kind: "speech"; readonly text: string; readonly expression: Expression }
  /**
   * メインが `report` ツールの引数を書き始めた（`includePartialMessages` の断片で、呼び出しの
   * 塊が開いた合図）。立ち絵の「書いている」の材料（`src/shared/portrait-motion.ts`）で、
   * 同じ `toolUseId` の `report` か `tool-finished` が届くまで続く。中身（引数の断片）は運ばない。
   */
  | { readonly kind: "report-drafting"; readonly toolUseId: string }
  /**
   * `report` ツールの呼び出し（docs/glossary.md「report ツール」）。メインが呼んだ
   * ものだけが届く（サブエージェントの呼び出しは変換で捨てる）。`body` と `favor` は無ければ空の
   * 文字列。`toolUseId` は呼び出しの id で、差し戻し（`src/server/core/report-review.ts`）が同じ
   * 呼び出しの `tool-finished` と突き合わせるのに使う。
   */
  | {
      readonly kind: "report"
      readonly toolUseId: string
      readonly conclusion: string
      readonly body: string
      readonly favor: string
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
  /** 答え待ちの列が変わった（積まれた・解決した）。中身は src/shared/pending-ask.ts が持つ。 */
  | { readonly kind: "pending-changed"; readonly pending: readonly PendingAsk[] }
  /**
   * 質問（`AskUserQuestion`）に利用者が答えた。**答えが確定した時点で1回だけ流す**
   * （docs/display.md 4.2「許可と質問」）。`pending-changed` は列が
   * 空になったことしか伝えないので、**「何を聞いて、どう答えたか」を残せるのはこの経路だけ**
   * （メインビューの質問の記録。`src/browser/features/main-view/question-record.tsx`）。
   *
   * `answers[i]` は `questions[i]` に対して選んだ答えの並び（{@link QuestionAnswer}）。
   * **質問文も答えも会話の内容**なので、ログに出さない・外へ出さない。
   */
  | {
      readonly kind: "question-answered"
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
    }
  /**
   * ターンが終わった（`result`。サブエージェントの中の `result` は変換で捨てる）。`outcome` は
   * 終わり方（`src/shared/turn-failure.ts` の {@link TurnOutcome}）。**中断は失敗にしない**。
   * 駆動が自分で起こすのは fake driver の中断（`interrupted`）と、復元の再生の区切り（`completed`）。
   */
  | { readonly kind: "turn-finished"; readonly outcome: TurnOutcome }
  /**
   * API の呼び出しが失敗し、待ってから呼び直す（SDK の `system` / `api_retry`）。**呼び直す
   * たびに1回ずつ**届く。呼び直しが実った合図は来ないので、畳み込みはモデルが何かを出した
   * ところで「呼び直し中」を下ろす（`src/shared/session-state.ts`）。サブエージェントの呼び直しも
   * 見分けずに届く（SDK のメッセージに持ち場の印が無い）。
   */
  | { readonly kind: "api-retry"; readonly retry: ApiRetry }
  /**
   * API がエラーを返した（`assistant` の `error`。メインのものだけ）。**これだけではターンの
   * 失敗にしない**——本体が立て直して続けることがある（出力の上限など）。失敗で終わったかは
   * 続く `turn-finished` の `outcome` が決め、この種類がその理由になる。
   */
  | { readonly kind: "api-error"; readonly error: ApiErrorKind }
  /**
   * 利用上限（docs/glossary.md「利用上限」）の状態が変わった（SDK の `rate_limit_event`。
   * 型定義は「変わったときに届く」と言う）。届くたびに丸ごと置き換える。
   */
  | { readonly kind: "rate-limit-changed"; readonly rateLimit: RateLimit }
  /**
   * そのターンの終わりに SDK が渡してきたトークンの使用量（`result` の `modelUsage`）。
   * **運ぶのは `query()` の中の累計そのまま**で、ターンごとの増分に直すのは受け取った側
   * （`src/server/core/session-manager.ts` が前回の累計を覚えて差を取る）。
   *
   * **画面には出ない。** 畳み込み（session-state.ts）は何もせず、行き先は
   * `~/.tsukumo/token-usage/` の記録だけ（`src/server/adapter/token-usage-log.ts`）。`turn-finished` に
   * 相乗りさせずに別のイベントにしてあるのは、**使用量を持たない終わり方があるから**
   * （復元の再生・fake driver・`modelUsage` の無い `result`）——「無い」を型に持ち込まずに済む。
   *
   * **数とモデルの名前だけ**で、会話の内容は入らない（`docs/coding-standards.md`
   * 「会話内容の扱い」）。
   */
  | { readonly kind: "token-usage"; readonly cumulative: readonly ModelTokenUsage[] }
  /**
   * assistant 1ステップぶんの使用量（`assistant` メッセージの `message.usage`）。
   * **ターンの中を「メインループぶん」と「サブエージェントぶん」に割れるのはこの経路だけ**
   * （`result` の `modelUsage` は両方を混ぜた累計なので、モデルが同じだと割れない）。
   *
   * **`messageId` を運ぶのは、同じ `message.id` のステップが何度も届くから。** 返答が流れて
   * いる間は完成したブロックごとに `assistant` が出て、`message.usage` は**まだ確定値ではない**
   * （`sdk.d.ts`: 「several consecutive assistant messages can share message.id ...
   * message.usage is not final」）。**同じ `message.id` の最後を取る**のは受け取った側
   * （`src/server/core/token-usage.ts`）。
   *
   * **画面には出ない**（畳み込みは何もしない）。行き先は `~/.tsukumo/token-usage/` の記録だけ。
   * **数だけ**で、本文も思考も入らない（`docs/coding-standards.md`「会話内容の扱い」）。
   */
  | {
      readonly kind: "step-usage"
      /** そのステップを載せたメッセージの id（`message.id`）。 */
      readonly messageId: string
      readonly scope: TurnUsageScope
      readonly usage: StepTokenUsage
    }
  /**
   * `/clear` で会話が消された（SDK の `conversation_reset`。実測）。**tsukumo は
   * `/clear` という文字列を見ていない。** `/` コマンドは依頼の文面としてそのまま本体へ渡り、
   * 本体が会話を捨てたときにこのメッセージを流してくる（`new_conversation_id` 付き。直後に
   * 新しい `session_id` の `system/init` が届く）。
   *
   * **`/compact` では流れない**（同じ実測で `system/status` + 同じ `session_id` の `init` だけ
   * だった）。要約は会話を消さないので、ここで拾う必要も無い。
   */
  | { readonly kind: "conversation-cleared" }
  /** `query()` の反復が終わった（正常終了・例外のどちらも）。プロセスは落とさない。 */
  | { readonly kind: "session-ended"; readonly reason: string }
  /**
   * モデルが変わったことを、`session-info`（`init`）を待たずに先回りで伝える。出どころは2つ:
   *
   * 1. `/model` のローカルコマンドが実行された合図（`assistant` に乗る
   *    `local_command_run: { command: "model", args }`。実測。`src/server/core/sdk-message.ts`）。
   *    `init` はターンの頭に届くので、`/model haiku` を送ったそのターンの `init` はまだ古い
   *    モデルを返す（正しい値が載るのは次の依頼の `init` から。docs/design.md 4.1）
   * 2. サイドバーの `<select>` からの `set-model` を駆動が確定させたとき
   *    （`src/server/adapter/sdk-driver.ts` の `setModel`）。**こちらは駆動が実際に切り替えたことを
   *    確認してから出すので、ブラウザ側のローカル echo ではない**（session-manager.ts が
   *    駆動を経ずにこのイベントを合成することはない。実測: 本物の駆動は元々これを
   *    出しておらず、選んだ直後に次のイベントで古いモデルへ巻き戻って見えていた。fake
   *    driver（fake-driver.ts）は最初から出していたので気づけなかった）
   *
   * `model` はそのまま状態へ運ぶ値。1 のときは `/model` に渡した引数（前後の空白だけ除いてある）で
   * **エイリアスとして知っているかどうかの検証はしていない**。2 のときは `MODEL_ALIASES`
   * （src/shared/command.ts）の値そのもの。`MODEL_ALIASES` と完全一致するときだけ状態を
   * 更新する判断は畳み込み側（session-state.ts）が持つ（知らない値では状態を変えず、次の
   * `init` を待つだけにする）。
   */
  | { readonly kind: "model-changed"; readonly model: string }
  /**
   * `main` の develop/tasks.json が変わった（adapter の `task-summary.ts` が `main` の先端を見て起こす）。
   * ファイルが読めない・消えたときは `tasks: { kind: "unknown" }`（サイドバーの「不明」表示に
   * 対応する。`src/shared/task-summary.ts` の {@link TaskSummaryResult}）。
   */
  | { readonly kind: "tasks-changed"; readonly tasks: TaskSummaryResult }
  /**
   * キャラクターパックが決まった・一覧が変わった（adapter の `character-pack.ts`。**起こしたとき・
   * 起こし直したときの1回ずつと、画面からパックを変えた・作ったとき**）。キャラビューが立ち絵を
   * 取りに行く先（`docs/design.md` 4.1・7.2）。**中身は URL だけ**（素材そのものは乗らない。
   * docs/coding-standards.md「会話内容の扱い」と同じ考え方）。
   *
   * 全パックぶんの一覧（`packs`。使用中以外のパックの姿も含む）も一緒に運ぶ。**一覧が変わる契機は
   * いま出しているパックが変わる契機と同じ**で、使用中の印（`inUse`）も持ち替えで動くので、
   * イベントを分けない（`docs/design.md` 4.1）。
   */
  | ({ readonly kind: "character-changed" } & CharacterInfo & {
        readonly packs: readonly CharacterPackEntry[]
      })
  /**
   * 切り替え先として選べるセッションの一覧が分かった（`docs/requirements.md` 4.8）。
   * **駆動を起こしたときと、起こし直したときの1回ずつ**流れる（`character-changed` と同じ契機。
   * 一覧の出どころが「セッションを探すために読む transcript の一覧」そのものなので、
   * 別の契機を作らない）。
   *
   * **ターンのたびには流れない。** 印が付くのはターンが終わって3秒後で、押し直すたびに
   * transcript の一覧を読み直すことになる。画面に出る最終更新時刻は**起こした時点の姿**。
   *
   * 中身は印から読めるものだけ（`src/shared/session-choice.ts`）。**会話の内容は入らない。**
   */
  | {
      readonly kind: "sessions-changed"
      readonly sessions: readonly SessionChoice[]
      /**
       * いま起こしたセッションのID（続きから始めなかったときは undefined ＝ 新規）。
       * **`session-info` を待たずに「どれを出しているか」を言えるのはこの経路だけ** —
       * `init` は最初の依頼を送るまで届かないので、切り替えた直後の画面は
       * どのセッションに居るのかを他から知れない。
       */
      readonly current: string | undefined
    }
  /**
   * 雑談モードに入っている／出ている（`docs/chat-mode.md` 4.9）。**駆動を起こしたときと、
   * `set-chat-mode` で起こし直したときの1回ずつ**流れる（`character-changed` と同じ契機）。
   *
   * 起こし直すと状態が初期値へ戻るので、**このイベントが無いと画面は雑談中かどうかを
   * 見失う**（`INITIAL_SESSION_STATE.chatMode` は `false`）。
   */
  | { readonly kind: "chat-mode-changed"; readonly chat: boolean }
  /**
   * 雑談のサイドバーの「最近の話題」に出す見出し（新しい順。`docs/screen-design.md` 13.7）。
   * **雑談で起こしたときと、圧縮で要約の写しが新しくなったとき**に流れる
   * （`src/server/core/session-launch.ts` と `src/server/adapter/sdk-driver.ts`）。
   *
   * **運ぶのは写しから取り出した見出しだけ**で、要約の本文は乗らない（`docs/requirements.md`
   * 4.9。取り出すのは `src/server/core/chat-compact.ts` の `chatTopics`）。取り出せなかった・
   * 写しがまだ無いときは空の並び。
   */
  | { readonly kind: "chat-topics-changed"; readonly topics: readonly string[] }
  /**
   * 雑談のサイドバーの「覚えていること」に出す一覧（`docs/design.md` 7.1・`docs/screen-design.md` 13.7）。
   * **雑談で起こしたときと、`remember` / `forget`（キャラクター自身）・画面の「編集」の
   * `forget-remembered-line` のどれかで `persona.md` の `## 覚えたこと` が変わったとき**に流れる
   * （`src/server/core/session-launch.ts` と `src/server/adapter/persona-memory.ts`）。
   *
   * **運ぶのは節の行そのもの**（`- ` を外した文面、古い→新しいの順）。上限に当たった・
   * 一致する行が無かった・書けなかったときは流れない（`PersonaMemory` の契約どおり、
   * 変わらなかった回は知らせない）。
   */
  | { readonly kind: "remembered-lines-changed"; readonly lines: readonly string[] }
  /**
   * 新しいセッションの既定（モデル・許可モード）が分かった（`docs/screen-design.md` 13.6）。
   * **駆動を起こしたときと、起こし直したときの1回ずつ**（`character-changed` と同じ契機）と、
   * **歯車から `set-session-default` で覚え直したとき**に流れる。
   *
   * 運ぶのは覚えた値（読めなければ同梱の既定へ畳んだあとの値）で、**いま動いている
   * セッションの値ではない**（そちらは `session-info` の `model` / `permissionMode`）。
   */
  | { readonly kind: "session-default-changed"; readonly sessionDefault: SessionDefault }
  /**
   * claude 自身の圧縮（`/compact`）が起きた（SDK の `system` / `compact_boundary`。
   * docs/glossary.md「圧縮の区切り」）。**数値（`compact_metadata` の `pre_tokens` /
   * `post_tokens` / `duration_ms`）は運ばない** — 画面に出さないものを契約に入れない
   * （`docs/chat-mode.md` 4.9「記憶の圧縮と忘却」）。
   *
   * 画面に出すのは雑談のログの細い線1本だけで、**文言は添えない**。
   */
  | { readonly kind: "compact-boundary" }
  /**
   * 前のセッションの記録を組み直した再生が、ここで終わった（`src/server/core/session-restore.ts`
   * の `toRestoredEvents` が末尾に1つ足す）。**ここまでに積んだ依頼とセリフの記録は、起きた
   * 時刻が分からない**（`docs/design.md` 4.2「記録の時刻」）。
   *
   * 再生のイベントに打たれる `at` は**流し直した時刻**で、話した時刻ではない。transcript を
   * 読む口（SDK の `getSessionMessages`）が時刻を落とすので、組み直した側に本当の時刻が無い。
   * 印を畳み込みに渡さないと、起こし直した直後のログが全部「いま」の時刻に見える。
   */
  | { readonly kind: "history-restored" }
  /**
   * 背景のタスク（docs/glossary.md「背景のタスク」）の顔ぶれが変わった（SDK の `system` /
   * `background_tasks_changed`。実測: 背景の Bash・サブエージェントが始まったときと終わったときに
   * 1回ずつ届く）。**運ぶのは変わったあとの全員**で、受け取る側は丸ごと置き換える（SDK の
   * 型定義が「REPLACE semantics」と言う水準の知らせ。始まり・終わりの対を数えないので、片方を
   * 取りこぼしても「動いている」が居残らない）。
   *
   * **活動でないもの（SDK の `ambient`。見張り役など）は変換で落としてある**
   * （`src/server/core/sdk-message.ts`）。
   */
  | { readonly kind: "background-tasks-changed"; readonly tasks: readonly BackgroundTask[] }
  /**
   * 見直し（docs/glossary.md「見直し」）が段に入った（`usage_review_stage` ツールが受け付けた
   * 呼び出し）。**出すのはツールの handler**（`src/server/core/usage-review-tool.ts`）で、
   * `assistant` メッセージの変換からは出ない——引数を検査して通したものだけを流すため。
   */
  | { readonly kind: "usage-review-stage"; readonly stage: UsageReviewStage; readonly days: number }
  /** 見直しの結果が届いた（`usage_review_result` ツールが受け付けた呼び出し。出し手は上と同じ）。 */
  | { readonly kind: "usage-review-result"; readonly findings: UsageReviewFindings }
  /**
   * 提案を1件見送った（画面の `dismiss-usage-proposal` コマンド）。**出し手は
   * `src/session-start.ts`**（書き込み先は `src/server/adapter/usage-proposal-dismissal.ts`）。
   * `key` は {@link usageProposalKey} と同じ形（`kind:target`）。
   */
  | { readonly kind: "usage-proposal-dismissed"; readonly key: string }
  /**
   * `diary` ツールが振り返りの日記を1段落受け付けた（保存も済んだ。出し手は handler = 窓口
   * `src/server/core/diary-tool.ts` の `createDiaryIntake`。**検査を通して保存できたものだけ**
   * 流す）。`date` は振り返りの対象の日（`YYYY-MM-DD`）。
   */
  | { readonly kind: "diary-written"; readonly date: string }
  /**
   * 成果の画面から振り返りを頼まれた（`reflect-achievement` コマンド）。**出し手は
   * session-manager**——その日の成果を数え直し、依頼文を組んで送り、窓口
   * （`src/server/core/diary-tool.ts` の `DiaryIntake.beginDay`）に「いま書く日」を渡した直後に
   * 流す。`date` は振り返りの対象の日（`YYYY-MM-DD`）。段は「この日のタスクを読む」（`read`）。
   */
  | { readonly kind: "diary-requested"; readonly date: string }
  /**
   * `includePartialMessages` の断片で、メインの `diary` の呼び出しの塊が開いた（立ち絵の
   * 「書いている」の材料。`report-drafting` と同じ形）。段は「日記を書く」（`write`）。
   */
  | { readonly kind: "diary-drafting"; readonly toolUseId: string }
  /**
   * 振り返りの段が進んだ（`docs/design.md`「日記の受け取りと保存」「3段の進みの決まり方」）。
   * **出し手は駆動**——同じ塊の引数の断片（`input_json_delta`）に、最上位の鍵 `bookmark` が
   * 現れた回だけ流す（`src/server/core/diary-tool.ts` の純関数が拾う）。運ぶのは段だけで、
   * 引数の中身はイベントに載せない。
   */
  | { readonly kind: "diary-stage"; readonly stage: DiaryStage }

/**
 * 時刻を打ったイベント1件。**時刻はイベントの発生側（サーバ）が決める**（ブラウザ側で
 * 読んだ時計を畳み込みに渡さない。docs/design.md 4.1）。
 */
export type StampedEvent = {
  readonly at: number
  readonly event: SessionEvent
}

/**
 * 外から届いた値を {@link SessionEvent} として受け取るための**封筒だけ**のスキーマ
 * （`kind` を持つオブジェクトであること）。**中身は検証しない**（union を
 * zod で二重に持たない）。使うのは境界の2箇所だけ — フレームの読み取り（src/shared/frame.ts）と
 * fake driver の疑似セッション（src/server/adapter/fake-driver.ts）。
 */
export const sessionEventSchema = z.custom<SessionEvent>(
  (value) => isPlainObject(value) && typeof value.kind === "string",
)

/** 時刻付きイベントのスキーマ。`at` だけを確かめ、イベントの中身は封筒どまり。 */
export const stampedEventSchema = z.object({
  at: z.number(),
  event: sessionEventSchema,
})
