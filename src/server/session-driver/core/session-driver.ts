// セッション駆動の契約。ここにあるのは型だけで、実際に何かを起こすコードは持たない。
// 実装は Agent SDK を起こす `startSdkDriver` と、疑似セッションを流す `startFakeSession` の2つ。
// SDK の語彙を名乗るもの（`query()` の options など）はここに書かず、駆動の adapter の `sdk-` で始まるファイルに置く。
//
// 既定のモデル・effort・許可モードは、ブラウザと同じ畳み先の `BUILTIN_SESSION_DEFAULT` が持つ。ここに置かない。

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import type { EffortLevel, ModelAlias, PermissionMode } from "../../../shared/command.ts"
import type { ContextUsageReport } from "../../../shared/context-usage/context-usage.ts"
import type { PlanUsageReport } from "../../../shared/plan-usage/plan-usage.ts"
import type { Answer, PendingAsk } from "../../../shared/session-driver/pending-ask.ts"
import type { SessionDigest } from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { ShelvedPromptImage } from "./prompt-image-shelf.ts"

/**
 * 覚えたことを人格に書き足す口と、覚えた1行を忘れる口。
 * 上限に当たった回も、消す行が見つからなかった回も何も返さない。
 * 受け付けたかどうかをモデルへ戻さないため（ツールの戻り値は `"ok"` だけ）。
 */
export type PersonaMemory = {
  /** 覚えた1行を書き足す（受け付けられない行は黙って捨てる）。 */
  readonly remember: (line: string) => void
  /**
   * 覚えた1行を忘れる（文面の完全一致で指す。一致する行が無いときは黙って何もしない）。
   * 書き足しとは別に数えるので、同じターンで覚え直せる。
   */
  readonly forget: (line: string) => void
  /** ターンが終わった合図（次のターンでまた1行ずつ受け付ける）。 */
  readonly finishTurn: () => void
}

/**
 * 雑談の要約の写しの読み書き口。
 * 中身を読んで判定する口は持たない。
 * `systemPrompt` へ載せるかどうかの判断は `takeChatMemoryPromptParts` が持つ。
 */
export type ChatSummary = {
  /** 写しと印を読む（ファイルが無い・読めないときは undefined）。 */
  readonly read: () => ChatSummaryRecord | undefined
  /**
   * 定着が書き直したあらすじ（話題の組を含む本文）を上書きする。
   * 印は変えない（ファイルが無ければ「未渡し」で書く）。
   * 定着はどのプロセスのどちらのモードのターンからも走り、畳んだ会話を文脈に持っているセッションが決まらないため。
   */
  readonly write: (summary: string) => void
  /** 印を「未渡し」に戻す（`/clear` を見たとき）。 */
  readonly markUndelivered: () => void
  /** 印を「渡し済み」にする（読んで `systemPrompt` へ載せたとき）。 */
  readonly markDelivered: () => void
}

/** {@link ChatSummary.read} が返す1件。`delivered` が写しの1行目の印。 */
export type ChatSummaryRecord = {
  readonly summary: string
  readonly delivered: boolean
}

/**
 * `ChatArchive.recallList` / `ChatArchive.recallEpisode` が返す候補（`id`・`title`・
 * `gist` だけ。逐語は `ChatArchive.recallEpisode` で別に開く）。
 */
export type ChatEpisodeCandidate = {
  readonly id: string
  readonly title: string
  readonly gist: string
}

/**
 * 古い会話を索引から思い出す口。
 * `ChatArchive` を駆動へそのまま渡さないために分けてある。
 * パックの名前と読む量は、`createChatRecall` を呼ぶ配線が縛ってから渡す。
 * 1ターンの回数の上限（`recallListsPerTurn` / `recallEpisodesPerTurn`）を数えるのは実装の側（`createChatRecall`）。
 */
export type ChatRecall = {
  /** 索引を `keyword` で引き、候補の一覧を返す（1ターンに `recallListsPerTurn` 回まで）。 */
  readonly recallList: (keyword: string) => ChatRecallListResult
  /** 候補の1件を `id` で開き、その範囲の逐語を返す（1ターンに `recallEpisodesPerTurn` 件まで）。 */
  readonly recallEpisode: (id: string) => ChatRecallEpisodeResult
  /** ターンが終わった合図（両方の回数をまた0から数え直す）。 */
  readonly finishTurn: () => void
}

/**
 * {@link ChatRecall.recallList} が返すもの。
 * 「当たらなかった」と「このターンではもう引けない」は、モデルへ返す文面が違う。
 */
export type ChatRecallListResult =
  /** 採点の高い順の候補（{@link ChatEpisodeCandidate}。空の配列にはならない）。 */
  | { readonly kind: "found"; readonly candidates: readonly ChatEpisodeCandidate[] }
  /** 索引に当たる候補が無かった。 */
  | { readonly kind: "not-found" }
  /** そのターンではもう一覧を引けない（`recallListsPerTurn` を超えた）。 */
  | { readonly kind: "exhausted" }

/** {@link ChatRecall.recallEpisode} が返すもの。 */
export type ChatRecallEpisodeResult =
  /** 開いた1件の範囲の逐語。 */
  | {
      readonly kind: "found"
      readonly entries: readonly ChatArchiveRecentEntry[]
      readonly overflowed: boolean
    }
  /** 知らない `id`（一覧に無い・アーカイブの行が残っていない）。 */
  | { readonly kind: "not-found" }
  /** そのターンではもう開けない（`recallEpisodesPerTurn` を超えた）。 */
  | { readonly kind: "exhausted" }

/**
 * `ChatArchive.readRecent` が返す1件。行の種類・文面・その行の日付だけで、`expression` も `images` も持たない。
 * 読む側が落とすのではなく、口が最初から渡さない。
 */
export type ChatArchiveRecentEntry = ChatArchiveLine & {
  /** その行のローカル日付（`YYYY-MM-DD`）。日付が変わるところに挟む見出しに使う。 */
  readonly date: string
}

/**
 * 読み戻す1行の、時刻を除いた部分。
 * 話者は `kind` から決まる（`request` は利用者、`speech` はキャラクター、`conclusion` はキャラクターがしたこと）。
 */
export type ChatArchiveLine = {
  readonly kind: "request" | "speech" | "conclusion"
  readonly text: string
  readonly origin: ChatArchiveLineOrigin
}

/** その行を書いたのが雑談か仕事か。仕事の行だけがプロジェクトの名前（リポジトリの名前だけ）を持つ。 */
export type ChatArchiveLineOrigin =
  | { readonly mode: "chat" }
  | { readonly mode: "work"; readonly project: string }

/**
 * このセッションが仕事か雑談か。
 * `recall` と `recall_episode` のツールは両方のモードで載る（`chatRecall`）。
 */
export type SessionMode =
  /** 仕事。覚えたことを書き換える口とあらすじの印の口は渡らない。 */
  | { readonly kind: "work"; readonly chatRecall: ChatRecall }
  | {
      readonly kind: "chat"
      /** 渡ったときだけ `remember` と `forget` のツールが `mcpServers` に載る。 */
      readonly personaMemory: PersonaMemory
      readonly chatSummary: ChatSummary
      readonly chatRecall: ChatRecall
    }

/** このセッションを新規に起こすか、続きから始めるか。続きから始める ID は `SessionCatalog.findToResume` が選ぶ。 */
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
   * ターンが終わるたびに付け直す（理由は `SESSION_TAG_DELAY_MS`）。
   */
  readonly tag: string
  /** {@link SessionDriverOptions.tag} の印が付いたセッションのID を受け取る口。ここで例外を投げないこと。 */
  readonly onSessionMarked: (sessionId: string) => void
  readonly mode: SessionMode
  /**
   * 子プロセス（claude）へ引き継ぐ環境変数（`Config.inheritedEnv`）。駆動はこれに
   * 本体の催促を止める変数を足して渡す（`childProcessEnv`）。
   */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
  /** Claude Code の設定ディレクトリ（`Config.claudeConfigDir`）。契約の控えを読む場所で、無ければ `~`。 */
  readonly claudeConfigDir: string | undefined
  /**
   * 利用者が見送った提案の識別子（`usageProposalKey`）を読む口。
   * 見直しのツールが呼ばれるたびに読み直す（`createUsageReviewIntake`）。
   * 読めないときは空を返し、例外を投げない。
   */
  readonly dismissedUsageProposalKeys: () => readonly string[]
  /** 内部イベントの受け取り口。ここで例外を投げないこと（投げるとセッションが終わる）。 */
  readonly onEvent: (event: SessionEvent) => void
}

export type SessionDriver = {
  /**
   * 依頼を1つ送る（ストリーミング入力への追加）。`request` イベントも同時に流れる。
   * `images` は呼ぶ側が棚に置いたあとのもの（原寸と控えの対に、棚が振った id を添えたもの）。
   * 原寸はモデルへ渡すだけで、`request` イベントには控えと id だけを載せる（分けるのは `recordedPromptImages`）。
   */
  readonly prompt: (text: string, images: readonly ShelvedPromptImage[]) => void
  /**
   * 依頼を1つ送るが、記録に残さない。
   * 流れるのは `request` ではなく `turn-started` なので、送った文面は画面のログにも記録にも雑談の会話のアーカイブにも残らない。
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
   * いまの利用枠を、知らせを待たずに取りに行く（SDK の実験中の口）。
   * 取れなかった・claude.ai の契約でないときは例外を投げず、それぞれの結果を返す。
   */
  readonly readPlanUsage: () => Promise<PlanUsageReport>
  /**
   * 同じ部屋のセッション1件の中身（依頼の数・要約・最後のセリフ）を transcript から読む。
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
  /** 入力を閉じてセッションを終える。子プロセスも止まる。 */
  readonly close: () => void
}
