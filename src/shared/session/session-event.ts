// セッションの中で起きた出来事（`SessionEvent`）の語彙。`kind` ごとの doc コメントが契約の置き場。
// ここは型だけで、SDK のメッセージからの変換（SDK の形に結び付いた外部由来の値の検証）は駆動の側が持つ。
// 会話の内容がイベントに入るので、外に出さない・複製しない・ログに出さない。

import { isPlainObject } from "remeda"
import { z } from "zod"

import type { DiaryEvent } from "../diary/diary.ts"
import type { ReportImageSize } from "../report/report-image.ts"
import type { PendingAsk } from "../session-driver/pending-ask.ts"
import type { RecordedPromptImage } from "../session-driver/prompt-image.ts"
import type { QuestionBrief } from "../session-driver/question-brief.ts"
import type { Question, QuestionAnswer } from "../session-driver/question.ts"
import type { UsageReviewEvent } from "../usage/usage-review.ts"
import type { CommandDescription } from "./command-description.ts"
import type { DelegateEvent } from "./session-event-delegate.ts"
import type { ReportEvent } from "./session-event-report.ts"
import type { SettingEvent } from "./session-event-setting.ts"
import type { SpeakCalledEvent, SpeakDrawnEvent, SpeechEvent } from "./session-event-speech.ts"
import type { SurroundingEvent } from "./session-event-surrounding.ts"
import type { TurnHealthEvent } from "./session-event-turn-health.ts"
import type { SessionId } from "./session-id.ts"
import type { ReportedPermissionMode } from "./session-info.ts"

/**
 * tsukumo 内部のイベント。
 * SDK のメッセージ由来のものと、駆動が自分で起こすもの（`request` / `pending-changed` / `session-ended`）が1本の流れに混ざり、畳み込みはどちらから来たかを区別しない。
 * 未知の `kind` で落ちない（畳み込みは知らない種別を無視する）ので、イベントを足しても `PROTOCOL_VERSION` は上げない。
 */
export type SessionEvent =
  /**
   * `system` の `init`。プロンプトを送るたびに届くので「新しいセッション」の合図にしない（実測）。
   * `slashCommands` / `terminalSlashCommands` / `skillNames` / `agentNames` は毎回上書きでよい。
   */
  | {
      readonly kind: "session-info"
      readonly sessionId: SessionId
      readonly model: string | undefined
      readonly permissionMode: ReportedPermissionMode | undefined
      readonly slashCommands: readonly string[]
      /**
       * `slash_commands` のうち、端末専用（UX が端末に結び付く。`doctor` / `color` / `reload-plugins` など）のもの。入力欄の補完からは除く。
       * SDK 側でフィールド自体が無いことがあるので、そのときは空配列。
       */
      readonly terminalSlashCommands: readonly string[]
      /** `init` の `skills`（スキルの名前）。無ければ空配列。 */
      readonly skillNames: readonly string[]
      /** `init` の `agents`（サブエージェントの名前）。SDK 側でフィールド自体が無いことがあるので、そのときは空配列。 */
      readonly agentNames: readonly string[]
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
   * `images` は添えた画像の控えと、置き場の原寸を指す id の組（添えていなければ空）。
   * 原寸はここに載らない（原寸はモデルへ渡り、あとは棚が直近ぶんだけメモリで持つ）。
   */
  | {
      readonly kind: "request"
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
    }
  /**
   * バックグラウンドタスクが残っているあいだに利用者が送った言葉（脇の話）。
   * `request` と違ってターンの境目にならず、親のやり取りに吊るす（ターンの通し番号も進めない）。
   * 脇の話かどうかはサーバが送った瞬間に決める（`docs/architecture/display.md`「補足メッセージ」）。
   */
  | {
      readonly kind: "aside"
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
    }
  /**
   * 記録を持たないターンの始まり（キャラクターから話しかけてもらう）。
   * `request` と同じくターンの境目になるが、文面を持たない（送った一言はログにも記録にも残さないので、イベントにも載せない）。
   * 落とすのは組み立ての側ではなくここで、記録に積まないので、雑談のログにもメインビューにも会話のアーカイブにも初めから流れようが無い。
   */
  | { readonly kind: "turn-started" }
  /**
   * claude が自分で始めた続きのターン（バックグラウンドタスクが終わった知らせや、サブエージェントの `SendMessage` を受けて、依頼なしで続きを報告するターン）。
   * 実測: `task_notification` のあと、依頼を送らなくても `init` → `assistant` → `result` が届く。
   *
   * 記録を持たない。新しいターンではなく同じやり取りの続きなので、吹き出しのセリフと表情は持ち越す
   * （空にすると、通知が届くたびに吹き出しが消える）。
   */
  | { readonly kind: "turn-resumed" }
  /** 書きかけのターンの本文。完成した本文が来るまでの仮。 */
  | { readonly kind: "partial-utterance"; readonly text: string }
  /** 完成したターンの本文。仮の本文を置き換える。 */
  | { readonly kind: "utterance"; readonly text: string }
  | SpeechEvent
  | SpeakCalledEvent
  | SpeakDrawnEvent
  | ReportEvent
  | DelegateEvent
  /** 答え待ちの列が変わった（積まれた・解決した）。 */
  | { readonly kind: "pending-changed"; readonly pending: readonly PendingAsk[] }
  /**
   * 質問（`AskUserQuestion`）に利用者が答えた。答えが確定した時点で1回だけ流す。
   * `pending-changed` は列が空になったことしか伝えないので、「何を聞いて、どう答えたか」を残せるのはこの経路だけ。
   *
   * `answers[i]` は `questions[i]` に対して選んだ答えの並び（{@link QuestionAnswer}）。
   * 質問文も答えも会話の内容なので、ログに出さない・外へ出さない。
   * `toolUseId` は答え待ちのときの `PendingAsk` の `id` と同じで、preview と添え書きの図の画像の置き場の鍵になる。
   *
   * `briefs` は答え待ちのときの添え書き（無ければ空）。
   * `imageSizes`・`unshelvedImages` は駆動が空で流し、セッションの管理が答え待ちの同じ id の質問から写す。
   */
  | {
      readonly kind: "question-answered"
      readonly toolUseId: string
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
      readonly briefs: readonly QuestionBrief[]
      readonly imageSizes: readonly ReportImageSize[]
      readonly unshelvedImages: readonly string[]
    }
  | TurnHealthEvent
  /**
   * `/clear` で会話が消された（SDK の `conversation_reset`。実測）。
   * tsukumo は `/clear` という文字列を見ていない。`/` コマンドは依頼の文面としてそのまま Claude Code へ渡り、Claude Code が会話を捨てたときにこのメッセージを流してくる
   * （`new_conversation_id` 付き。直後に新しい `session_id` の `system/init` が届く）。
   *
   * `/compact` では流れない（同じ実測で `system/status` + 同じ `session_id` の `init` だけだった）。要約は会話を消さないので、ここで拾う必要も無い。
   */
  | { readonly kind: "conversation-cleared" }
  /** `query()` の反復が終わった（正常終了・例外のどちらも）。プロセスは落とさない。 */
  | { readonly kind: "session-ended"; readonly reason: string }
  | SettingEvent
  | SurroundingEvent
  /** 見直しの欄を動かすイベント。 */
  | UsageReviewEvent
  /** 振り返りの進みを動かすイベント。 */
  | DiaryEvent

/** {@link SessionEvent} から種類 `K` の1つだけを取り出した型。名前つきの別名が無い種類を、1か所で使うときに使う。 */
export type SessionEventOfKind<K extends SessionEvent["kind"]> = Extract<
  SessionEvent,
  { readonly kind: K }
>

export type SessionInfoEvent = SessionEventOfKind<"session-info">

/** 種類 `report` の1つだけ（メインが `report` ツールを呼んだ）。report まわりのイベント全体の合併型は `ReportEvent`。 */
export type ReportCalledEvent = SessionEventOfKind<"report">

export type ToolStartedEvent = SessionEventOfKind<"tool-started">

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
  /**
   * 依頼・脇の話に添えてあった原寸の data URL（transcript から読み戻したもの。ほかの出来事では空）。
   * 組み直した時点では棚の id がまだ無いので `event.images` は空で、置き場に置いて写すのは受け手。
   */
  readonly promptImages: readonly string[]
}

/**
 * 同じリポジトリの送り手（サーバのフレーム・疑似セッションの定義）から届いた値を {@link SessionEvent} として受け取るための封筒だけのスキーマ（`kind` を持つオブジェクトであること）。
 * 事前条件: 送り手は `kind` に合った {@link SessionEvent} の欄を守る。`kind` 以外の欄は検証しない。
 */
export const sessionEventSchema = z.custom<SessionEvent>(
  (value) => isPlainObject(value) && typeof value.kind === "string",
)

/** 時刻付きイベントのスキーマ。`at` だけを確かめ、イベントの中身は封筒どまり。 */
export const stampedEventSchema = z.object({
  at: z.number(),
  event: sessionEventSchema,
})
