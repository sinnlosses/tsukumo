// セッションドライバの契約。ここにあるのは型だけで、実際に何かを起こすコードは持たない。
// 実装は Agent SDK を起こす `startSdkDriver` と、疑似セッションを流す `startFakeSession` の2つ。
// SDK の語彙を名乗るもの（`query()` の options など）はここに書かず、駆動の adapter の `sdk-` で始まるファイルに置く。
//
// 既定のモデル・effort・許可モードは、ブラウザと同じ畳み先の `BUILTIN_SESSION_DEFAULT` が持つ。ここに置かない。

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import type { EffortLevel, ModelAlias, PermissionMode } from "../../../shared/command.ts"
import type { ContextUsageReport } from "../../../shared/context-usage/context-usage.ts"
import type { PromptDelayFootprint } from "../../../shared/diagnostic/diagnostic-record.ts"
import type { SwallowedFailurePlace } from "../../../shared/diagnostic/swallowed-failure.ts"
import type { PlanUsageReport } from "../../../shared/plan-usage/plan-usage.ts"
import type { ReportSchemaVariant } from "../../../shared/report/schema-variant.ts"
import type { Answer, PendingAsk } from "../../../shared/session-driver/pending-ask.ts"
import type { FigurePreference } from "../../../shared/session/session-default.ts"
import type { SessionDigest } from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { ChatSummary, PersonaMemory } from "../../chat/core/chat-memory.ts"
import type { ShelvedPromptImage } from "./prompt-image-shelf.ts"

/** このセッションが仕事か雑談か。 */
export type SessionMode =
  /** 仕事。覚えたことを書き換える口とあらすじの印の口は渡らない。 */
  | {
      readonly kind: "work"
      /** `report` の塊の型の渡し方（`Config.reportSchema`）。 */
      readonly reportSchema: ReportSchemaVariant
      /** `report` の `figure` の説明に効く、図を置くかの既定（起こすときの `SessionDefault`）。 */
      readonly figurePreference: FigurePreference
    }
  | {
      readonly kind: "chat"
      /** 渡ったときだけ `remember` と `forget` のツールが `mcpServers` に載る。 */
      readonly personaMemory: PersonaMemory
      readonly chatSummary: ChatSummary
    }

/** このセッションを新規に起こすか、続きから始めるか。続きから始める ID は、画面の切り替えで選ばれたもの。 */
export type SessionStart =
  /** 新規に起こす。 */
  | { readonly kind: "new" }
  /** 続きから始める（`sessionId` が続きのセッションのID）。 */
  | { readonly kind: "resume"; readonly sessionId: string }

export type SessionDriverOptions = {
  /** セッションの作業ディレクトリ。 */
  readonly cwd: string
  /** `speak` の `expression` で受け付ける表情と、そのラベル（キャラクターパックから作る）。 */
  readonly expressions: readonly ExpressionChoice[]
  /**
   * このセッションを起こす許可モード（覚えた既定。共有の既定値）。
   * 起こしたあと帯から変えた値はここに戻らない（セッション限り）。
   */
  readonly permissionMode: PermissionMode
  /** このセッションを起こすモデル（覚えた既定）。起こしたあと帯から変えた値はここに戻らない。 */
  readonly model: ModelAlias
  /** このセッションを起こす effort（覚えた既定）。起こしたあと帯から変えた値はここに戻らない。 */
  readonly effort: EffortLevel
  /** `systemPrompt` に足す文字列（人格と tsukumo 側の規約と記憶。組み立ては `takeSystemPromptAppend`）。 */
  readonly systemPromptAppend: string
  readonly start: SessionStart
  /**
   * このセッションに付ける印（組み立ては `sessionTag`。キャラクターパックごと・雑談かどうかで違う）。
   * 次に起こしたときに、これでそのパックのセッションだけを見分ける。
   * ターンが終わるたびに付け直す（理由は `markSession`）。
   */
  readonly tag: string
  /** {@link SessionDriverOptions.tag} の印が付いたセッションのID を受け取る口。ここで例外を投げないこと。 */
  readonly onSessionMarked: (sessionId: string) => void
  readonly mode: SessionMode
  /** 仕事の会話の `query()` から外す組み込みツールの名前（`Config.disallowedTools`）。 */
  readonly disallowedTools: readonly string[]
  /** 仕事の会話で、1 ターンのツール呼び出しがこの回数を超えたら `speak` で知らせさせる（`Config.turnStepLimit`）。 */
  readonly turnStepLimit: number
  /**
   * 子プロセス（claude）へ引き継ぐ環境変数（`Config.inheritedEnv`）。駆動はこれに
   * Claude Code の催促を止める変数を足して渡す（`childProcessEnv`）。
   */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
  /** Claude Code の設定ディレクトリ（`Config.claudeConfigDir`）。契約の控えを読む場所で、無ければ `~`。 */
  readonly claudeConfigDir: string | undefined
  /** 取り込んだ tsukumo-plugins を `plugins` に載せるか（利用者が同じスキルとエージェントを入れていれば載せない）。 */
  readonly mountWorkflowPlugin: boolean
  /** 取り込んだ図のプラグイン（`plugins/tsukumo-figure`）を `plugins` に載せるか。`mountWorkflowPlugin` とは独立。 */
  readonly mountFigurePlugin: boolean
  /** ワークフローの `tw` のパス。hook の `lap-hook`・`ask-guard` を起こす。 */
  readonly workflowTw: string
  /** 内部イベントの受け取り口。投げても反復は止まらず、投げた失敗は `diagnose` へ渡る。 */
  readonly onEvent: (event: SessionEvent) => void
  /** 現在時刻（エポックミリ秒）を返す時計。 */
  readonly now: () => number
  /** 駆動が診断ログへ残したいことの受け取り口。ここで例外を投げないこと。 */
  readonly diagnose: (diagnostic: DriverDiagnostic) => void
}

/** 駆動が `diagnose` へ渡す診断。行き先と書き出す形は配線が決める。 */
export type DriverDiagnostic =
  | PromptDelayFootprint
  /** `report` の関所が `Stop` を止めた。時刻は配線が付ける。 */
  | { readonly flow: "report-gate-block" }
  | {
      readonly flow: "swallowed-failure"
      readonly place: SessionFailurePlace
      readonly error: unknown
    }

export type SessionFailurePlace = Extract<SwallowedFailurePlace, { feature: "session" }>["place"]

/** `tw` の hook を走らせて失敗した場所。サブコマンド名と失敗の種類だけで、入出力は持たない。 */
export type WorkflowTwFailurePlace =
  | "ask-guard-failed"
  | "ask-guard-timed-out"
  | "ask-guard-not-started"
  | "ask-guard-unreadable"
  | "lap-hook-failed"
  | "lap-hook-timed-out"
  | "lap-hook-not-started"

/** 使用量の問い合わせを「取れない」に畳んだ場所。 */
export type UsageFailurePlace =
  | "context-usage-threw"
  | "context-usage-unreadable"
  | "plan-usage-threw"
  | "plan-usage-unreadable"

/** 送った言葉をどう開くか。`request` は新しい依頼、`aside` は脇の話（親のやり取りに吊るす）。 */
export type PromptOpening = "request" | "aside"

export type SessionDriver = {
  /**
   * 利用者の言葉を1つ送る（ストリーミング入力への追加）。`opening` と同じ種類のイベント（`request` か `aside`）も同時に流れる。
   * `images` は呼ぶ側が棚に置いたあとのもの（原寸と控えの対に、棚が振った id を添えたもの）。
   * 原寸はモデルへ渡すだけで、イベントには控えと id だけを載せる（分けるのは `recordedPromptImages`）。
   */
  readonly prompt: (
    text: string,
    images: readonly ShelvedPromptImage[],
    opening: PromptOpening,
  ) => void
  /**
   * 依頼を1つ送るが、記録に残さない。
   * 流れるのは `request` ではなく `turn-started` なので、送った文面は画面のログにも記録にも会話のアーカイブにも残らない。
   * 落とすのは組み立ての側ではなく、この時点。
   * 画像は添えられない（tsukumo が自分で足す一言のための口で、利用者の持ち物を運ばない）。
   */
  readonly promptWithoutRecord: (text: string) => void
  /** 実行中のターンを中断する。中断されたターンは `turn-finished` の `interrupted` で終わる（失敗にはしない）。 */
  readonly interrupt: () => Promise<void>
  /** 答え待ちに答える。解決済み・知らない id のときは `false`。 */
  readonly answer: (id: string, answer: Answer) => boolean
  /** いまの答え待ち（画面を組み直すときに使う）。 */
  readonly pending: () => readonly PendingAsk[]
  /** いまのコンテキストの内訳を取る。取れなかったときは「取れない」を返し、例外を投げない。 */
  readonly readContextUsage: () => Promise<ContextUsageReport>
  /**
   * いまのプラン使用量を、知らせを待たずに取りに行く（SDK の実験中の口）。
   * 取れなかった・claude.ai の契約でないときは例外を投げず、それぞれの結果を返す。
   */
  readonly readPlanUsage: () => Promise<PlanUsageReport>
  /**
   * 切り替え先の一覧のセッション1件の中身（依頼の数・要約・最後のセリフ）を transcript から読む。
   * ここは ID を絞らない。呼ぶ側が、読んでよい ID に絞ってから渡す。
   * 読めなかったときは「読めない」を返し、例外を投げない。
   */
  readonly readSessionDigest: (sessionId: string) => Promise<SessionDigest>
  /** モデルを切り替える。 */
  readonly setModel: (model: string | undefined) => Promise<void>
  /**
   * effort を切り替える。受け付けられたら、その値を `effort-changed` で流す。
   */
  readonly setEffort: (effort: EffortLevel) => Promise<void>
  /** 許可モードを切り替える。 */
  readonly setPermissionMode: (mode: PermissionMode) => Promise<void>
  /** 会話が終わったか（`session-ended` を流したあと）。終わったあとの依頼は積んでも誰も読まない。 */
  readonly ended: () => boolean
  /** 入力を閉じてセッションを終える。子プロセスも止まる。 */
  readonly close: () => void
}
