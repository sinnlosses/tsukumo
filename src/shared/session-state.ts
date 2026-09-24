// セッションの状態と、イベント1件を畳み込む純粋関数。**サーバ（core）とブラウザ（browser）の
// 両方が同じものを回す**ので、shared に置く（docs/design.md 4.2）。
//
// **`node:` にも `document` にも触らない。** 状態を持つのは呼び出し側
// （core の session-manager と、ブラウザ側の <App>）。
//
// 時刻は畳み込みの中で時計を読まず、イベントに打たれた `at`（エポックミリ秒）を受け取る
// （両側の状態が同じになるように、時刻はイベントの発生側が決める。docs/design.md 4.1）。
//
// **姿から導くだけのものはここに置かない**（メインビューに出す形は `main-view.ts`、
// 入力欄の `/` 補完の候補は `command-suggestion.ts`）。ここが持つのは「状態そのもの」と
// 「イベント1件でどう変わるか」だけ。

import { type ApiTrouble } from "./api-trouble.ts"
import { type BackgroundTask } from "./background-task.ts"
import { isBlankText } from "./blank-text.ts"
import { type CharacterInfo, type CharacterPackEntry } from "./character.ts"
import { commandCandidates } from "./command-suggestion.ts"
import { isModelAlias } from "./command.ts"
import { type Expression } from "./expression.ts"
import { type PendingAsk } from "./pending-ask.ts"
import { type RecordedPromptImage } from "./prompt-image.ts"
import { type Question, type QuestionAnswer } from "./question.ts"
import { type RateLimit } from "./rate-limit.ts"
import { type SessionChoice } from "./session-choice.ts"
import { BUILTIN_SESSION_DEFAULT, type SessionDefault } from "./session-default.ts"
import { type CommandDescription, type SessionEvent } from "./session-event.ts"
import { type TaskSummaryResult } from "./task-summary.ts"
import {
  type TurnEnding,
  type TurnFailure,
  type TurnFailureCause,
  type TurnOutcome,
} from "./turn-failure.ts"
import { splitIntoTurns } from "./turn.ts"
import {
  type PreviousUsageReview,
  type UsageReview,
  type UsageReviewFindings,
  usageProposalKey,
} from "./usage-review.ts"

/**
 * メインビューに残す記録の窓（直近何ターンぶんを持ち続けるか）。常駐プロセスが
 * セッションを通して動き続ける以上、ここで持つ記録自体も無限に増やさない。
 * **`work` は `main-view.ts` の `MAX_MAIN_VIEW_TURNS` の導出元**（関係の理由はそちら）。
 *
 * **モードごとに値が違う**（`docs/chat-mode.md` 4.9）。雑談の1ターンは
 * セリフ1〜2件で軽く、仕事と同じ20往復では会話として短すぎるため、雑談だけ100まで持つ。
 */
export const MAX_SESSION_STATE_TURNS = {
  work: 20,
  chat: 100,
} satisfies Record<"work" | "chat", number>

/**
 * ツールの実行がどこまで進んだか。結果が届くまでは `running` で、届いたら `finished` に
 * 結果を持つ（結果の無い `finished` も、結果のある `running` も起きない）。
 */
export type ToolRunStatus =
  | { readonly kind: "running" }
  | {
      readonly kind: "finished"
      readonly result: { readonly content: string; readonly isError: boolean }
    }

/**
 * 依頼とセリフの記録が起きた時刻（`docs/design.md` 4.2「記録の時刻」）。雑談のログが行ごとの
 * 時刻と日の区切りに使う。
 *
 * - `stamped`: 起きた時刻が分かっている。`at` はそのイベントに打たれた時刻（`StampedEvent.at`。
 *   エポックミリ秒）
 * - `restored`: 前のセッションの記録を組み直したもので、**起きた時刻が分からない**
 *   （`history-restored`）。流し直した時刻を代わりに入れると、昨日の一言が「いま」に見える
 */
export type RecordTime =
  | { readonly kind: "stamped"; readonly at: number }
  | { readonly kind: "restored" }

/**
 * セッションの中で起きたことを起きた順に並べたもの。メインビューに出す形（`MainViewEntry`。
 * `shared/main-view.ts`）とほぼ同じだが、
 * **ツールは `toolUseId` を持つ**（あとから届く結果を突き合わせるため。表示には使わない）。
 *
 * **`speech` はここにしか無い**（`MainViewEntry` には対応する種類が無く、
 * `mainViewEntries` が落とす）。セリフが出るのは吹き出しだけで、レポートには混ぜない
 * （docs/display.md 4.2）。記録に残すのは、過去のターンの吹き出しを引き直せるように
 * するため（`shared/turn-speech.ts` の `turnSpeeches`）。
 */
export type SessionRecord =
  /**
   * 利用者の依頼。`images` は添えた画像の**控えと、棚の原寸を指す id の組**
   * （`docs/requirements.md` 4.10）。**原寸は記録に入らない**（`hello` に載せない）。拡大して
   * 見るときは id で棚から取りに行く（`src/shared/prompt-image.ts` の `promptImagePath`）。
   *
   * `turnId` は**そのターンの通し番号**（{@link SessionState.nextTurnId}）。窓から古い記録が
   * 落ちても番号は振り直されないので、**同じターンはセッションが続くかぎり同じ番号**になる。
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
   * `report` ツールで受け取ったレポート（docs/glossary.md「report ツール」）。
   * 引数をそのまま持ち、**1つの本文に組むのはメインビューの導出**（`shared/main-view.ts`）。
   * 本文（`detail`）とは別の種類にしてあるのは、**このレポートがあるターンでは本文を出さない**
   * という判定に、どちらから来たかが要るため。
   */
  | {
      readonly kind: "report"
      readonly conclusion: string
      readonly body: string
      readonly favor: string
    }
  /**
   * 答え終わった質問（`question-answered`）。**積むのは答えが確定した1回だけ**で、あとから
   * 書き換えない（docs/display.md 4.2「許可と質問」）。形は
   * `MainViewEntry` の `question` と同じなので、`mainViewEntries` はそのまま通す
   * （`shared/main-view.ts`）。
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
      readonly status: ToolRunStatus
    }
  /**
   * 圧縮の区切り（`compact-boundary`。docs/glossary.md）。**中身を持たない**（画面に出すのは
   * 細い線1本だけで、文言も数値も添えない）。`trimToRecentTurns` の数え方（`request` の数）は
   * 変えない — 他の記録と同じく、窓から外れれば一緒に落ちる。
   */
  | { readonly kind: "compact-boundary" }
  /**
   * 失敗で終わったターンの理由（`turn-finished` の `outcome` が `failed`。docs/glossary.md
   * 「ターンの失敗」）。**そのターンの記録の末尾に1つだけ積む**。メインビューがターンの末尾に
   * 「失敗で終わった」と理由を出す（`shared/main-view.ts`）ので、過去のターンを遡っても
   * 成功と見分けられる。雑談のログ・依頼の手順・吹き出しは拾わない。
   */
  | { readonly kind: "turn-failure"; readonly failure: TurnFailure }

/**
 * `init`（`session-info`）と、続きから始めたときの `sessions-changed` がどこまで届いたか。
 * **`sessionId` / `permissionMode` はそれぞれ独立に `| undefined` だった旧い形**
 * （`docs/coding-standards.md`「複数の「無い」が1つの状態」）。`sessionId` が分かる口は2つ
 * （`init` と `sessions-changed`）、`permissionMode` は1つ（`init`）なので、どこまで届いたかが
 * 3つの状態になる。
 *
 * - `starting`: セッションがまだ起こったばかりで、`init` も `sessions-changed`
 *   （続きから始めたときの居場所）もまだ届いていない
 * - `identified`: `sessionId` だけ分かっている。**続きから始めたときに `sessions-changed` が
 *   `init` より先に届く経路がある**ので実在する状態（`sessionId` が分かっているかどうかと
 *   `permissionMode` が分かっているかどうかは、無くなる理由が違う ——
 *   「片方だけが `undefined` になる状態が実在するか」の目安どおり分けてある）
 * - `running`: `sessionId` / `permissionMode` の両方が分かっている。**`permissionMode` を
 *   決める口は `init` だけ**（サイドバーの `set-permission-mode` には確定の合図が無い）で、
 *   その `init` は必ず `sessionId` も連れてくるので、`permissionMode` だけ分かっている状態は
 *   実在しない。だから3つ目の状態を足さずにこの2つを束ねられる
 *
 * **`model` はここに入れない**（`SessionState.model` に外へ出してある）。`sessionId` /
 * `permissionMode` は `init` の1つの口でしか決まらないが、**`model` はそれに加えて
 * `model-changed`（`/model` チャットコマンドやサイドバーの `set-model` の確定）でも決まり、
 * `sessionId` より先に分かることがある**（続きから始める前、`init` が来る前の
 * `identified`/`starting` の間にサイドバーでモデルを切り替える経路が実機にある）。
 * ここへ押し込めると `model-changed` が `running` 以外では効かなくなり、切り替えても
 * 5秒ほどで古い値に戻って見える不具合になる（実機で確認済み。修正の経緯は
 * `src/server/adapter/sdk-driver.ts` の `setModel` のコメントを参照）。「無い」を型から
 * 消すことを目的にせず、消える理由が違う値は素直に分けて残す
 * （`docs/coding-standards.md`「「無いかもしれない」値」）。
 */
export type SessionInfo =
  | { readonly kind: "starting" }
  | { readonly kind: "identified"; readonly sessionId: string }
  | { readonly kind: "running"; readonly sessionId: string; readonly permissionMode: string }

/**
 * ターンの進み具合。`request` で `running` になり、`turn-finished` / `session-ended` で
 * `finished` になる（入力欄が送信と中断を切り替える判断材料。docs/requirements.md 4.7）。
 *
 * - `idle`: まだ一度も依頼が無い
 * - `running`: 依頼を送って、まだ終わっていない
 * - `finished`: 終わった。**`startedAt` は次の `request` まで持ち続ける**
 *   （入力欄の経過時間表示 `src/browser/features/dispatch/turn-status.tsx` が「所要」として
 *   出し続ける。docs/design.md 4.2）。`ending` は失敗で終わったか（{@link TurnEnding}。
 *   入力欄の「失敗」の字と、立ち絵の「失敗でびくっ」の材料。`session-ended` で終わったときは
 *   `ended`）
 *
 * 「進行中か」「始まった時刻」「終わった時刻」の3つを並べて持つと、**型としては書けるのに
 * 起きない組み合わせ**（終わっているのに始まっていない、進行中なのに終わった時刻がある）が
 * 残るので1つの合併型にしてある（docs/coding-standards.md「複数の「無い」が1つの状態」）。
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

/** メインが `report` の引数を書いている途中か（{@link SessionState.reportDrafting}）。 */
export type ReportDrafting =
  | { readonly kind: "idle" }
  | { readonly kind: "drafting"; readonly toolUseId: string }

/**
 * セッションの今の姿。**イベントを1件ずつ畳んで作る**ので、ここに無い情報は画面にも出ない。
 *
 * `partialUtterance` は書きかけの本文で、完成した本文（`utterance`）が来たら空に戻る。
 * こうしておくと、断片と完成メッセージの**両方が届いても二重に積まれない**
 * （docs/display.md 4.2「書きかけの本文はそのまま記録の末尾に積まれ、ターンが終わった
 * 瞬間に整形し直す」）。
 */
export type SessionState = {
  /**
   * 吹き出しに並べて出す、今のターンのセリフ（古い→新しいの順。**件数の上限は無い**、
   * ターンの境目だけで区切る）。**`request` の時点で空にする**（プレースホルダーに切り替わり、
   * 次のターンに移ったことが画面から分かる。docs/display.md 4.2。
   * {@link applySessionEvent} の `request` を参照）。まだ一度も `speak` が呼ばれていない・
   * そのターンでまだ呼ばれていなければ空配列。
   */
  readonly speeches: readonly string[]
  /** 直近のセリフ（`speak`）に添えられた表情。**表情の源はこれだけ**（自動の上書きは無い）。 */
  readonly speechExpression: Expression
  /**
   * 今のターンで `speak` が呼ばれたか（前のターンのセリフを捨てて今のターンだけの並びにするか、
   * 今のターンに積み重ねるかの判定に使う。`speech` イベントを参照）。`request` で false に戻る。
   */
  readonly speechCalledInTurn: boolean
  /** 確定した記録。書きかけの本文は含まない。 */
  readonly records: readonly SessionRecord[]
  /** 書きかけの本文。完成した本文が来たら空に戻る。 */
  readonly partialUtterance: string
  /** 答え待ちの列（許可プロンプトと質問）。 */
  readonly pending: readonly PendingAsk[]
  /** `init` がまだ届いていないか、届いてセッションID・許可モードが分かっているか。 */
  readonly session: SessionInfo
  /**
   * いま動いているモデル。**`session` の外に置く**（{@link SessionInfo} の冒頭のコメント）
   * ——`init`（`session-info`）だけでなく `model-changed`（`/model` コマンドやサイドバーの
   * `set-model` の確定）でも決まり、`sessionId` より先に分かることがあるため。まだどちらの
   * 口からも届いていなければ undefined（本物の「無い」——`init` 前に何を出すかは読む側が
   * 見た目上の既定へ畳む。`src/browser/features/screen-nav/domain/model-label.ts` の `resolveModelAlias`）。
   */
  readonly model: string | undefined
  /**
   * 入力欄の `/` 補完に出せるコマンド名（`init` のたびに上書きされる）。**端末専用
   * （`terminal_slash_commands`）は除いてある**（`commandCandidates`。
   * docs/display.md 4.2「入力欄」）。**`init`（`session-info`）は最初の依頼を送るまで
   * 届かない**（実測。SDK の `system`/`init` はターンのたびに届く仕組みで、
   * セッション開始直後には来ない）ので、それまでは空配列のまま。その間の名前の出どころは
   * `commandSuggestions`（`shared/command-suggestion.ts`）が `commandDescriptions` 側に振る。
   */
  readonly slashCommands: readonly string[]
  /**
   * SDK から届いたコマンドの説明（名前と説明の組）。**端末専用のものも混ざったままの生の一覧**。
   * `supportedCommands()`（駆動側が起動直後に呼ぶ）はセッション開始後すぐに届く
   * （実測。`init` を待たない）ので、`slashCommands` が空の間は `commandSuggestions` が
   * ここを名前の出どころとして使う（端末専用の除外はまだ効かせられない。`init` が届き
   * `slashCommands` が埋まった時点で、除外込みの一覧に戻る）。説明がまだ届いていなければ
   * 空配列。
   */
  readonly commandDescriptions: readonly CommandDescription[]
  /** セッションが終わった理由。動いている間は undefined。 */
  readonly endedReason: string | undefined
  /** ターンの進み具合（{@link TurnProgress}）。始まった時刻・終わった時刻もここが持つ。 */
  readonly turn: TurnProgress
  /**
   * 直近でターンが終わった時刻（`turn-finished` / `session-ended` の `at`）。**`turn` が
   * `running` に移っても戻さない**——`turn.finished.finishedAt` は次の依頼が始まると `running` の
   * 腕に移って読めなくなる（{@link TurnProgress}）が、ターンの途中も「直前に終わったときの
   * 取り直しの合図」を必要とする読み手がいる（サイドバーの使用量の行とトークン消費の画面の札。
   * `browser/domain/context-usage.ts` の `contextUsageRefetchKey`。取り直すのはターンが
   * 終わるたびで、ターンの途中は前の値のまま——`docs/screen-design.md` 13.9「使用量の行」）。
   * `lastToolFailureAt` と同じ並び（次のターンが始まっても戻さない「直近の時刻」）。まだ一度も
   * ターンが終わっていなければ undefined。
   */
  readonly lastTurnFinishedAt: number | undefined
  /**
   * 次に始まるターンに振る通し番号。**ターンが始まるたびに1つ増え、記録が窓から落ちても
   * 戻らない**ので、**同じターンはセッションが続くかぎり同じ番号**になる。
   *
   * 番号を位置（何番目のターンか）で決めると、窓（{@link MAX_SESSION_STATE_TURNS}）が
   * いっぱいになったあと**いちばん新しいターンの番号が止まる**。描く側はその番号を
   * React の `key` に使っているので、止まると別のターンが同じ部品として使い回され、
   * **書き上げる演出がマウント時にしか走らないために二度と起動しなくなる**（実測）。
   */
  readonly nextTurnId: number
  /**
   * develop/tasks.json の一覧（サイドバーのタスク一覧）。`tasks-changed` が届くまでは
   * `{ kind: "unknown" }`（読めない・まだ読んでいないのどちらも同じ「不明」表示になる。
   * docs/design.md 4.1。この2つを型でも分けない理由は
   * {@link TaskSummaryResult}（`src/shared/task-summary.ts`）のコメントを参照）。
   */
  readonly tasks: TaskSummaryResult
  /**
   * キャラビューが立ち絵を取りに行く先（`character-changed` が届くまでは undefined）。
   * **素材そのものは持たない**（`portraits` の値は `/character/<pack>/<file>` の URL。docs/design.md
   * 4.2）。
   */
  readonly character: CharacterInfo | undefined
  /**
   * キャラクターパックの一覧（サイドバーの `<select>` と、キャラクター画面の一覧・詳しい設定。
   * docs/design.md 7.2）。**使用中以外のパックも姿ごと持つ**。
   * `character-changed` と一緒に届く。**まだ届いていないときは空**で、そのときは選択肢を
   * 出せないので `<select>` ごと出さない。
   */
  readonly characterPacks: readonly CharacterPackEntry[]
  /**
   * 切り替え先として選べるセッションの一覧（サイドバーの `<select>`。
   * `docs/requirements.md` 4.8）。`sessions-changed` と一緒に届き、**起こしたときの姿のまま
   * 変わらない**（ターンのたびには引き直さない）。まだ届いていない・印の付いたセッションが
   * 1つも無いときは空で、そのときは選択肢を出せないので `<select>` ごと出さない。
   */
  readonly sessions: readonly SessionChoice[]
  /**
   * 直近でツールが失敗した時刻（`tool-finished` の `isError` が true のときの `at`）。
   * **立ち絵の「失敗でびくっ」の判定にだけ使う**（`shared/portrait-motion.ts` の
   * `resolvePortraitMotion`）。次のターンが始まっても戻さない（時間の窓が過ぎれば
   * `resolvePortraitMotion` 側で自然に「今は失敗直後ではない」に戻るため、`turn` が持つ
   * 終わった時刻と違って `request` での巻き戻しは要らない）。まだ一度も失敗していなければ
   * undefined。
   */
  readonly lastToolFailureAt: number | undefined
  /**
   * メインがいま `report` の引数を書いているか。**立ち絵の「書いている」の判定にだけ使う**
   * （`shared/portrait-motion.ts`）。`report-drafting` で書き始め、同じ `toolUseId` の `report` か
   * `tool-finished`（差し戻されて `report` が届かないときもこちらは届く）、ターンの境目で終わる。
   */
  readonly reportDrafting: ReportDrafting
  /**
   * 雑談モードに入っているか（`docs/chat-mode.md` 4.9）。入っている間はレポートを出さず、
   * メインビューが立ち絵と会話のログになる（`docs/screen-design.md` 13.7）。
   *
   * **源は `chat-mode-changed` だけ。** 切り替えは駆動の起こし直しなので、起こし直したあとに
   * サーバから流れ直す（起こし直しで状態が初期値へ戻るため）。
   */
  readonly chatMode: boolean
  /**
   * 雑談のサイドバーの「最近の話題」に出す見出し（新しい順。`docs/screen-design.md` 13.7）。
   * **要約の本文ではなく、写しから取り出した見出しだけ**（`docs/chat-mode.md` 4.9）。
   *
   * **源は `chat-topics-changed` だけ**で、届くたびに丸ごと置き換える。起こし直すと初期値の
   * 空へ戻り、雑談で起こしたときだけサーバから流れ直す（仕事のときは空のまま）。空のときは
   * サイドバーが案内を出す。
   */
  readonly chatTopics: readonly string[]
  /**
   * 雑談のサイドバーの「覚えていること」に出す一覧（`persona.md` の `## 覚えたこと`。
   * `docs/design.md` 7.1・`docs/screen-design.md` 13.7）。`- ` を外した文面で、古い→新しいの順。
   *
   * **源は `remembered-lines-changed` だけ。** 雑談で起こしたとき、キャラクター自身の
   * `remember` / `forget`、画面の「編集」から消したときのいずれかで流れ直す。起こし直すと
   * 初期値の空へ戻る（`chatTopics` と同じ扱い）。
   */
  readonly rememberedLines: readonly string[]
  /**
   * 新しいセッションを起こすときの既定（`docs/screen-design.md` 13.6。帯の右端の歯車が読み書きする）。
   * **いま動いているセッションの値ではない** — そちらは {@link SessionState.model} と
   * {@link SessionInfo} の `permissionMode` で、帯から変えてもここは変わらない。
   *
   * **源は `session-default-changed` だけ。** 起こし直すと状態が初期値へ戻るので、
   * `chat-mode-changed` と同じくサーバから流れ直す（届くまでは同梱の既定）。
   */
  readonly sessionDefault: SessionDefault
  /**
   * 契約プラン（`docs/glossary.md`「プラン」）。トークン消費の画面の題の右の札に出す。
   *
   * **源は `plan` だけ**（駆動が起動直後に1回だけ取りに行く。`src/server/adapter/sdk-driver.ts`）。
   * まだ届いていない・取れなかった（`accountInfo()` が落ちた・`subscriptionType` が無い）の
   * どちらも同じ undefined——どちらだったかを画面は区別しない（何も出さないだけ）ので、
   * 型でも分けない。
   */
  readonly plan: string | undefined
  /**
   * いま背景で動いているタスク（docs/glossary.md「背景のタスク」。帯の「いまの作業」が読む。
   * docs/screen-design.md 13.9「背景のタスク」）。**ターンの進み具合（{@link turn}）とは独立**
   * で、ターンが終わっても動いている間はここに残る。
   *
   * **源は `background-tasks-changed` だけ**で、届くたびに丸ごと置き換える。**`session-ended` で
   * 空にする**（claude のプロセスが終われば背景のタスクも一緒に終わる。SDK は起動時に何も
   * 流さないので、起こし直しで初期値の空へ戻るのもそのまま正しい）。
   */
  readonly backgroundTasks: readonly BackgroundTask[]
  /**
   * 見直し（docs/glossary.md「見直し」）の状態。トークン消費の画面の提案の区画が読む。
   *
   * **源は `usage-review-stage` / `usage-review-result` の2つ**（ツールが受け付けた呼び出し）で、
   * **見直し中のままターンが終わったら（止めた・失敗したも同じ）ふだんへ戻す**。起こし直すと
   * 初期値のふだんから始まる（前回の結果を出すのはこの状態ではない）。
   */
  readonly usageReview: UsageReview
  /**
   * 前回の見直しの結果。トークン消費の画面の「前回の提案」のリンクが読む
   * （`docs/glossary.md`「見直し」、`docs/design.md`「見直しのツールと状態」）。
   *
   * **{@link usageReview} とは別の状態**——起こし直しでもプロセスの再起動でも消えない
   * （源は `usage-review-result` が届くたびと、起こしたとき1回だけホームのファイルを
   * 読む口。持つのは直前の1回だけ）。**`usage-proposal-dismissed` が届くと、見送った提案を
   * ここからも取り除く**（`前回の提案」を開き直したときに、見送ったはずの札が出ない
   * ようにするため）。
   */
  readonly previousUsageReview: PreviousUsageReview
  /**
   * いまのターンで API が不調か（{@link ApiTrouble}。入力欄の経過時間の行に「再試行中」を出す
   * 材料と、失敗で終わったときの理由の材料）。**源は `api-retry` / `api-error`** で、ターンの
   * 境目と、モデルが何かを出したとき（{@link MODEL_OUTPUT_EVENT_KINDS}）に `none` へ戻る。
   */
  readonly apiTrouble: ApiTrouble
  /**
   * 利用上限の状態（{@link RateLimit}。入力欄の経過時間の行が出す）。**源は `rate-limit-changed`
   * だけ**で、ターンの境目では戻さない（セッションを通した状態で、次の知らせが来るまで持つ）。
   */
  readonly rateLimit: RateLimit
}

export const INITIAL_SESSION_STATE: SessionState = {
  speeches: [],
  speechExpression: "default",
  speechCalledInTurn: false,
  records: [],
  partialUtterance: "",
  pending: [],
  session: { kind: "starting" },
  model: undefined,
  slashCommands: [],
  commandDescriptions: [],
  endedReason: undefined,
  turn: { kind: "idle" },
  lastTurnFinishedAt: undefined,
  nextTurnId: 0,
  tasks: { kind: "unknown" },
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
  apiTrouble: { kind: "none" },
  rateLimit: { kind: "clear" },
}

/**
 * **モデルが何かを出した**と言えるイベント。届いたら {@link SessionState.apiTrouble} を下ろす
 * （呼び直しが実った・API のエラーから立て直した合図は別に来ないため）。`step-usage` は
 * 思考だけのステップでも届くので、本文が出る前に「再試行中」を下ろせる。
 */
const MODEL_OUTPUT_EVENT_KINDS: ReadonlySet<SessionEvent["kind"]> = new Set([
  "partial-utterance",
  "utterance",
  "speech",
  "report-drafting",
  "report",
  "tool-started",
  "step-usage",
] satisfies SessionEvent["kind"][])

/**
 * イベント1件を畳み込んで次の姿を返す。知らない状況でも必ず姿を返す（落ちない）。
 *
 * `at` はイベントが起きた時刻（`StampedEvent.at`）。ターンの起点・終点と、ツールが失敗した
 * 時刻を記録するのに使う。時計をここで読まないのは、この関数を純粋関数のまま保ち、
 * **サーバとブラウザで同じ結果になる**ようにするため（docs/design.md 4.1）。
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
        // `model` は `session` とは独立に更新する（{@link SessionInfo} 冒頭のコメント）。
        model: event.model,
        slashCommands: commandCandidates(event.slashCommands, event.terminalSlashCommands),
      }
    case "command-descriptions":
      return { ...state, commandDescriptions: event.descriptions }
    case "plan":
      return { ...state, plan: event.plan }
    case "model-changed":
      // **`MODEL_ALIASES` に完全一致するときだけ先回りで更新する**（`/model best` のような
      // tsukumo が知らない値では状態を変えない。次の依頼の `init` が正しい値で上書きするので、
      // ここで間違った値に倒す必要は無い）。**`session.kind` は見ない**——`model` は `init` の
      // 前でも `set-model` の確定で決まることが実機で確認されている（`identified`/`starting`
      // の間に届いても更新できる）。ここで `running` に絞ると、切り替えても数秒で古い値に
      // 戻って見える不具合になる（`src/server/adapter/sdk-driver.ts` の `setModel` 参照）。
      return isModelAlias(event.model) ? { ...state, model: event.model } : state
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
      // **記録を持たないターンの始まり**（キャラクターから話しかけてもらう。docs/screen-design.md 13.7）。
      // 積むものが無いだけで、吹き出し・表情・進行中の印は `request` と同じに動かす。
      return beginTurn(state, at)
    case "partial-utterance":
      return { ...state, partialUtterance: state.partialUtterance + event.text }
    case "utterance":
      return settleUtterance({ ...state, partialUtterance: event.text })
    case "speech":
      return {
        ...state,
        // 記録は積みっぱなし（`speeches` と違ってターンの境目で捨てない）。過去のターンの
        // 吹き出しと表情をここから引き直す（`shared/turn-speech.ts`）。
        records: [
          ...state.records,
          {
            kind: "speech",
            text: event.text,
            expression: event.expression,
            time: { kind: "stamped", at },
          },
        ],
        // 前のターンのセリフが残っているなら、ここで捨てて今のターンだけの並びにする
        // （docs/display.md 4.2「吹き出し」の「今のターンの分を縦に積んで」）。
        speeches: [...(state.speechCalledInTurn ? state.speeches : []), event.text],
        speechExpression: event.expression,
        speechCalledInTurn: true,
      }
    case "report-drafting":
      return { ...state, reportDrafting: { kind: "drafting", toolUseId: event.toolUseId } }
    case "report":
      // `tool-started` と同じく、届いた位置に積むだけ（吹き出しにも帯の「いまの作業」にも出さない）。
      return {
        ...settleReportDrafting(state, event.toolUseId),
        records: [
          ...state.records,
          {
            kind: "report",
            conclusion: event.conclusion,
            body: event.body,
            favor: event.favor,
          },
        ],
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
      return { ...state, pending: event.pending }
    case "question-answered":
      // 答えが確定した1回だけ積む（未回答の質問は記録に残さない）。`request` と違って
      // 窓の切り詰め（`trimToRecentTurns`）は要らない — 質問はやり取りの境目にならないので、
      // 次の `request` が来たときに一緒に古いぶんが落ちる。
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
      // `/clear` で会話が消えたら、**画面に残っている前の会話も消す**。
      // 消すのは吹き出しとメインビューが読む値だけで、キャラクター・セッション情報・
      // 答え待ちの列は残す（`pending` の正典は core の待ち行列なので、状態側で空にすると
      // 実際の待ちと食い違う）。**普通の `request` と違うのは `records` も空にする点**
      // （普通のターンは過去のターンを遡れるように records を残す。`/clear` は会話そのものを
      // 消す操作なので records も落とす）。
      return {
        ...state,
        speeches: [],
        speechExpression: INITIAL_SESSION_STATE.speechExpression,
        speechCalledInTurn: false,
        records: [],
        partialUtterance: "",
        reportDrafting: { kind: "idle" },
      }
    case "tasks-changed":
      return { ...state, tasks: event.tasks }
    case "sessions-changed":
      // **`sessionId` もここで決まる**（`session-info` は最初の依頼まで届かないので、それまで
      // 「いまどのセッションに居るか」を言えるのはこの経路だけ）。新規に起こしたときは
      // `current` が undefined で、そのときは今の `session` を動かさない（`init` が届いたら
      // 本物のIDで上書きされる）。すでに `running`（`init` 済み）なら `permissionMode` は
      // 引き継ぎ、`sessionId` だけ差し替える。`starting` / `identified` からは（`init` が
      // まだなので）`sessionId` だけの `identified` になる。
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
    case "character-changed":
      return {
        ...state,
        character: {
          pack: event.pack,
          name: event.name,
          accent: event.accent,
          chatAccent: event.chatAccent,
          expressions: event.expressions,
          portraits: event.portraits,
          expressionsWithPortrait: event.expressionsWithPortrait,
          mini: event.mini,
          face: event.face,
          tagline: event.tagline,
          outfitAccents: event.outfitAccents,
          background: event.background,
          editable: event.editable,
        },
        characterPacks: event.packs,
      }
    case "token-usage":
    case "step-usage":
      // **画面に出すものが何も無い**（数の記録は `~/.tsukumo/token-usage/` へ書くだけで、
      // 書くかどうかを決めるのは `src/server/core/session-manager.ts`）。ここで畳むと
      // ブラウザ側にも同じ数を持たせることになるので、姿は変えない。
      return state
    case "chat-mode-changed":
      return { ...state, chatMode: event.chat }
    case "chat-topics-changed":
      return { ...state, chatTopics: event.topics }
    case "remembered-lines-changed":
      return { ...state, rememberedLines: event.lines }
    case "session-default-changed":
      return { ...state, sessionDefault: event.sessionDefault }
    case "compact-boundary":
      return { ...state, records: [...state.records, { kind: "compact-boundary" }] }
    case "background-tasks-changed":
      return { ...state, backgroundTasks: event.tasks }
    case "usage-review-stage":
      return {
        ...state,
        usageReview: {
          kind: "running",
          startedAt: usageReviewStartedAt(state, at),
          days: event.days,
          stage: event.stage,
        },
      }
    case "usage-review-result":
      return {
        ...state,
        usageReview: { kind: "result", reviewedAt: at, findings: event.findings },
        // **`usageReview` と両方いっぺんに更新する**——結果が届いたその場で「前回の提案」も
        // 最新になる（次の起動を待たなくても、そのプロセスの中では常に同じものを指す）。
        previousUsageReview: { kind: "found", reviewedAt: at, findings: event.findings },
      }
    case "usage-proposal-dismissed":
      return {
        ...state,
        usageReview: withoutDismissedProposal(state.usageReview, event.key),
        previousUsageReview: withoutDismissedProposalFromPrevious(
          state.previousUsageReview,
          event.key,
        ),
      }
    case "history-restored":
      // ここまでに積んだ依頼とセリフは、前のセッションを組み直したもの。流し直したときに打った
      // 時刻を捨て、「時刻が分からない」に書き換える（{@link RecordTime}）。**起こし直すと
      // 記録は空から始まる**ので、ここまでの記録はすべて再生のぶんになる。
      return { ...state, records: state.records.map(withRestoredTime) }
  }
}

/** 依頼とセリフの記録を「時刻が分からない」にする（他の種類は時刻を持たないのでそのまま）。 */
function withRestoredTime(record: SessionRecord): SessionRecord {
  return record.kind === "request" || record.kind === "speech"
    ? { ...record, time: { kind: "restored" } }
    : record
}

/**
 * 見直しが始まった時刻。すでに見直し中なら動かさず、始まったところならそのターンの始まり
 * （ボタンを押してから最初の段が届くまでも経過に数える）。ターンの外で届いたときだけ `at`。
 */
function usageReviewStartedAt(state: SessionState, at: number): number {
  if (state.usageReview.kind === "running") {
    return state.usageReview.startedAt
  }
  return state.turn.kind === "running" ? state.turn.startedAt : at
}

/** 見送った提案を結果から取り除く。`result` でなければ何もしない（`idle` / `running` はそのまま）。 */
function withoutDismissedProposal(review: UsageReview, key: string): UsageReview {
  return review.kind === "result"
    ? { ...review, findings: withoutProposal(review.findings, key) }
    : review
}

/** 見送った提案を「前回の提案」から取り除く。`found` でなければ何もしない。 */
function withoutDismissedProposalFromPrevious(
  previous: PreviousUsageReview,
  key: string,
): PreviousUsageReview {
  return previous.kind === "found"
    ? { ...previous, findings: withoutProposal(previous.findings, key) }
    : previous
}

/** 提案の並びから、識別子（{@link usageProposalKey}）が一致する1件を除く。 */
function withoutProposal(findings: UsageReviewFindings, key: string): UsageReviewFindings {
  return {
    ...findings,
    proposals: findings.proposals.filter((proposal) => usageProposalKey(proposal) !== key),
  }
}

/** ターンの終わりで、結果を渡さずに終わった見直しをふだんへ戻す（結果・ふだんはそのまま）。 */
function settleUsageReview(review: UsageReview): UsageReview {
  return review.kind === "running" ? { kind: "idle" } : review
}

/**
 * ターンの始まりを畳む（記録は動かさない）。**`request` と「記録を持たないターンの始まり」
 * （`turn-started`）で共通**の部分で、積むものがあるかどうかだけが違う。
 */
function beginTurn(state: SessionState, at: number): SessionState {
  return {
    ...state,
    // 送信した時点で吹き出しを空にする（プレースホルダー「（まだ発話がありません）」に
    // 切り替わる。前のターンの一言が残ったままだと、次のターンに移ったことが画面から
    // 分からない。以前は前のターンの並びの最後の1件を残していたが、
    // それが「切り替わったのか分からない」の原因だった）。
    speeches: [],
    // 表情も既定へ戻す。次の `speak` が来るまではこのままで、ツールの実行状況では動かない
    // （表情の源は `speak` の1つだけ。docs/requirements.md 4.3）。
    speechExpression: INITIAL_SESSION_STATE.speechExpression,
    partialUtterance: "",
    reportDrafting: { kind: "idle" },
    turn: { kind: "running", startedAt: at },
    nextTurnId: state.nextTurnId + 1,
    speechCalledInTurn: false,
    apiTrouble: { kind: "none" },
  }
}

/**
 * ターンの終わり方を、失敗だったかどうかに畳む（中断は失敗にしない）。失敗の理由が API の
 * エラーなら、そのターンで届いた種類を足す——`assistant` の `error`（`errored`）、無ければ
 * 最後の呼び直しの知らせ（`retrying`。呼び直しを使い切って止まったとき）、どちらも無ければ
 * `unknown`。
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
 * ターンの終わりを畳む（`turn-finished` と `session-ended` で共通）。**始まっていないターンは
 * 終われない**ので、まだ一度も依頼が無ければ `idle` のまま返す（依頼より先に `session-ended`
 * が届く経路がある。そこでは立ち絵の「完了の反応」も出さない）。終わったあとにもう一度
 * 届いたときは、起点を動かさずに終わった時刻だけ進める。
 */
function finishTurn(turn: TurnProgress, at: number, ending: TurnEnding): TurnProgress {
  if (turn.kind === "idle") {
    return turn
  }
  return { kind: "finished", startedAt: turn.startedAt, finishedAt: at, ending }
}

/**
 * {@link SessionState.lastTurnFinishedAt} を進める。**`finishTurn` と同じ判定**（始まっていない
 * ターンの `turn-finished` / `session-ended` では進めない）で、実際にターンが終わったときだけ
 * `at` にする。
 */
function lastTurnFinishedAtOf(state: SessionState, at: number): number | undefined {
  return state.turn.kind === "idle" ? state.lastTurnFinishedAt : at
}

/**
 * 書きかけの本文を確定した記録に移す。空のときは何もしない（空の本文を積まない）。
 */
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

/**
 * ツール1件の結果を記録に合わせる。**対応する `tool_use` が見つからないときは何もしない**
 * （対応が取れない結果を作らない）。`isError` が true のときは `lastToolFailureAt` に `at` を
 * 打つ（立ち絵の「失敗でびくっ」の判定材料。`docs/design.md` 6.5）。**失敗した出力は記録の
 * `status` にそのまま残る**——読める場所は帯の「いまの作業」が開く一覧
 * （`src/shared/turn-step.ts` の `currentTurnSteps`）。
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
      { ...record, status: { kind: "finished", result: { content, isError } } },
      ...state.records.slice(index + 1),
    ],
    lastToolFailureAt: isError ? at : state.lastToolFailureAt,
  }
}

/**
 * 直近何ターンぶんだけを残す。**ターンの境目は `request`**（`shared/turn.ts` の `splitIntoTurns`）
 * なので、古いターンから数えて窓の外に出たものをまとめて落とす。窓の広さは `chatMode` で選ぶ
 * （{@link MAX_SESSION_STATE_TURNS}）。
 *
 * **依頼より前の記録はターンに数えない。** 窓に収まっているあいだは残し、窓を超えて古い
 * ターンを落とすときに一緒に落とす。
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
