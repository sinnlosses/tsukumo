// セッション駆動の契約（docs/glossary.md「セッション駆動」）。**ここにあるのは型だけ**で、
// 実際に何かを起こすコードは持たない。実装は2つあり、どちらも `src/server/adapter/` にある
// （Agent SDK の `sdk-driver.ts` と、疑似セッションを流す `fake-driver.ts`）。
//
// 契約をここに置いてあるので、`session-manager` は駆動の実装を import せずに済む
// （どちらが動いているかを知らない。docs/design.md 5章）。
//
// **境目の基準は「shared の語彙で書けるか / SDK の語彙を名乗るか」**。shared の語彙だけで
// 書けるもの（契約の型。`EffortLevel` 自体は `shared/command.ts` の語彙）はここに、SDK の語彙を
// 名乗るもの（`query()` の options、`listSessions` / `getSessionMessages` を使う関数）は
// `src/server/adapter/` の `sdk-` で始まるファイル（`sdk-driver.ts` / `sdk-session.ts` など）に置く。
//
// **既定のモデル・effort・許可モードはここに無い**（`src/shared/session-default.ts` の
// `BUILTIN_SESSION_DEFAULT`）。覚えた値を歯車から書き換えられるようになって、
// **ブラウザも同じ畳み先を読む**ようになったため（`docs/screen-design.md` 13.6）。

import { type EffortLevel, type ModelAlias, type PermissionMode } from "../../../shared/command.ts"
import { type ContextUsageReport } from "../../../shared/context-usage.ts"
import { type ExpressionChoice } from "../../../shared/expression-choice.ts"
import { type Expression } from "../../../shared/expression.ts"
import { type Answer, type PendingAsk } from "../../../shared/pending-ask.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type ShelvedPromptImage } from "./prompt-image-shelf.ts"

/**
 * 覚えたことを人格に書き足す口と、覚えた1行を忘れる口（`docs/design.md` 7.1）。
 * **実装は `adapter` 側**（`src/server/chat/adapter/persona-memory.ts`）で、ここにあるのは契約だけ。
 *
 * **上限に当たった回も、消す行が見つからなかった回も何も返さない** — 受け付けたかどうかを
 * モデルへ戻さないため（ツールの戻り値は `"ok"` だけ）。
 */
export type PersonaMemory = {
  /** 覚えた1行を書き足す（受け付けられない行は黙って捨てる）。 */
  readonly remember: (line: string) => void
  /**
   * 覚えた1行を忘れる（**文面の完全一致で指す**。一致する行が無いときは黙って何もしない）。
   * **書き足しとは別に数える**ので、同じターンで覚え直せる。
   */
  readonly forget: (line: string) => void
  /** ターンが終わった合図（次のターンでまた1行ずつ受け付ける）。 */
  readonly finishTurn: () => void
}

/**
 * 雑談の要約の写しの読み書き口（`docs/design.md` 7章「雑談の記憶の要約はどこに置くか」）。
 * **実装は `adapter` 側**（`src/server/chat/adapter/chat-summary.ts`）で、ここにあるのは契約だけ。
 *
 * **中身を読んで判定する口は無い。** 載せるかどうかの判断は
 * `src/server/chat/core/chat-memory-prompt.ts` が持ち、ここは「どこに・どう書き、どう渡すか」の
 * 4つの動きだけを持つ。
 */
export type ChatSummary = {
  /** 写しと印を読む（ファイルが無い・読めないときは undefined）。 */
  readonly read: () => ChatSummaryRecord | undefined
  /**
   * 定着が書き直したあらすじ（話題の組を含む本文）を上書きする。**呼ぶと印は「渡し済み」に
   * なる**——畳んだ会話は、いま動いているこのセッション自身がすでに持っている
   * （`docs/design.md` 7章「雑談の記憶の要約はどこに置くか」）。
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
 * 雑談の会話のアーカイブの読み書き口（`docs/design.md` 7章「雑談の会話のアーカイブはどこに
 * 置くか」）。**実装は `adapter` 側**（`src/server/chat/adapter/chat-archive.ts`）で、ここにあるのは
 * 契約だけ。
 *
 * **読む口は {@link readRecent} の1つだけ**（直近の雑談を逐語のまま
 * `systemPrompt` へ戻す唯一の出どころ。`docs/chat-mode.md` 4.9「直近の会話は逐語のまま
 * 読み戻す」）。**それ以外の読み戻しは作らない** — 旗の付いたやり取りも同じ1つの口が一緒に
 * 返す（窓と重なった件をここで落とせるのは、両方を1度に見ているときだけ）。
 */
export type ChatArchive = {
  /**
   * 依頼またはセリフを1件、追記する。`packName` が {@link isCharacterPackName} を通らない・
   * 書けないときは黙って何もしない（常駐プロセスは1回の失敗で落ちない。
   * `docs/coding-standards.md`「エラーハンドリング」）。
   */
  readonly append: (packName: string, entry: ChatArchiveEntry) => void
  /**
   * そのパックの**直近の会話**と**旗の付いたやり取り**を、新しいほうから遡って
   * {@link ChatReadbackLimits} のバイト数まで読む。**返すのはどちらも古い→新しいの順**で、
   * 呼ぶ側に順序の都合を持たせない。
   *
   * **1件を単位にし、途中では切らない**（溢れる1件は載せない）。読めない行（壊れた JSON・
   * 知らない版・鍵が足りない）は1行ずつ落とし、**例外は投げない**（読めなければ空を返し、
   * そのセッションは逐語なしで始まる）。
   */
  readonly readRecent: (packName: string, limits: ChatReadbackLimits) => ChatArchiveReadback
  /**
   * まだどのエピソードにも入っていない行を、古いほうから {@link ChatUnconsolidatedLimits.maxBytes}
   * まで返す（定着の入力。`docs/design.md` 7章「定着はどこで走るか」）。**最後のエピソードの
   * `to` より後**で、**作業記憶の窓（`recentBytes`）の外**にある行だけを対象にする
   * （エピソードが無ければアーカイブの最初の行から）。行番号はここでは振らない
   * （振るのは渡す側。`docs/design.md` 7章）。
   *
   * **溜まっている量は {@link ChatUnconsolidatedBatch.usedBytes} で分かる**——契機
   * （`consolidateEveryBytes`）に届いたかどうかを比べるのは呼び出し側の役目で、ここでは判定
   * しない。
   */
  readonly unconsolidated: (
    packName: string,
    limits: ChatUnconsolidatedLimits,
  ) => ChatUnconsolidatedBatch
  /**
   * 定着ができたエピソードを追記する（`id` はここで振る。`docs/design.md` 7章
   * 「エピソード索引はどこに置くか」）。書けなくても例外は投げない。
   */
  readonly appendEpisodes: (packName: string, episodes: readonly ChatEpisodeDraft[]) => void
  /**
   * 索引を引く言葉で採点し、点の高い順に {@link ChatEpisodeCandidate} を返す
   * （`recall` ツールの実体になる後段が使う）。**採点は `chat/core/chat-episode-score.ts` の
   * 純関数**で、ここは `episode.jsonl` と `recalled.jsonl` を読んで渡すだけ。
   */
  readonly recallList: (
    packName: string,
    keyword: string,
    limitBytes: number,
    now: Temporal.Instant,
  ) => ChatEpisodeRecallListResult
  /**
   * 1件のエピソードの範囲を、アーカイブから逐語のまま古いほうから読む
   * （`recall_episode` ツールの実体になる後段が使う）。**開いたことは `recalled.jsonl` に
   * 残る。**
   */
  readonly recallEpisode: (
    packName: string,
    id: string,
    limitBytes: number,
    now: Temporal.Instant,
  ) => ChatEpisodeReadResult
}

/**
 * {@link ChatArchive.unconsolidated} に渡す上限（どちらも文面の UTF-8 バイト数）。
 */
export type ChatUnconsolidatedLimits = {
  /** 作業記憶の窓（この量より新しい行は「窓の中」として除く）。 */
  readonly recentBytes: number
  /** ここまで読む上限。 */
  readonly maxBytes: number
}

/** {@link ChatArchive.unconsolidated} が返す1件。定着へ渡す行番号はここでは持たない。 */
export type ChatUnconsolidatedEntry = {
  readonly at: string
  readonly speaker: "user" | "character"
  readonly text: string
}

/** {@link ChatArchive.unconsolidated} が返すもの。 */
export type ChatUnconsolidatedBatch = {
  /** 古い→新しいの順。 */
  readonly entries: readonly ChatUnconsolidatedEntry[]
  /** 返した行の文面の UTF-8 バイト数の合計。 */
  readonly usedBytes: number
  /** 最後のエピソードの見出し（無ければ空文字。話題が続いているかを定着に見分けさせるため）。 */
  readonly previousEpisodeTitle: string
}

/**
 * {@link ChatArchive.appendEpisodes} に渡す1件（`id` はまだ無い。書くときに振る）。
 * `from` / `to` は行番号から時刻へ直したあとの ISO（オフセット付き）。
 */
export type ChatEpisodeDraft = {
  readonly from: string
  readonly to: string
  readonly title: string
  readonly gist: string
  readonly cues: readonly string[]
  readonly weight: 1 | 2 | 3
}

/**
 * {@link ChatArchive.recallList} / {@link ChatArchive.recallEpisode} が返す候補（`id`・`title`・
 * `gist` だけ。逐語は {@link ChatArchive.recallEpisode} で別に開く）。
 */
export type ChatEpisodeCandidate = {
  readonly id: string
  readonly title: string
  readonly gist: string
}

/** {@link ChatArchive.recallList} が返すもの。 */
export type ChatEpisodeRecallListResult =
  | { readonly kind: "found"; readonly candidates: readonly ChatEpisodeCandidate[] }
  | { readonly kind: "not-found" }

/** {@link ChatArchive.recallEpisode} が返すもの。 */
export type ChatEpisodeReadResult =
  | {
      readonly kind: "found"
      /** 古い→新しいの順（形は {@link ChatArchiveRecentEntry} と同じ）。 */
      readonly entries: readonly ChatArchiveRecentEntry[]
      /** `limitBytes` に収まらず、続きがあるとき `true`。 */
      readonly overflowed: boolean
    }
  | { readonly kind: "not-found" }

/**
 * 古い雑談を索引から思い出す口（`docs/design.md` 7章）。**`ChatArchive` を駆動へそのまま
 * 渡さないために分けてある**——パックの名前と読む量は配線層（`src/session-start.ts` の
 * `createChatRecall` の呼び出し）が縛ってから渡す。**雑談モードのときだけ渡り**、渡ったときだけ
 * `recall` と `recall_episode` のツールが `mcpServers` に載る。
 *
 * **1ターンの回数の上限（`recallListsPerTurn` / `recallEpisodesPerTurn`）を数えるのは実装
 * の側**（`src/server/chat/core/chat-recall.ts`）。{@link finishTurn} は駆動
 * （`src/server/session-driver/adapter/sdk-driver.ts`）が {@link PersonaMemory.finishTurn} と同じ
 * `turn-finished` の分岐から呼ぶ。
 */
export type ChatRecall = {
  /** 索引を `keyword` で引き、候補の一覧を返す（**1ターンに `recallListsPerTurn` 回まで**）。 */
  readonly recallList: (keyword: string) => ChatRecallListResult
  /** 候補の1件を `id` で開き、その範囲の逐語を返す（**1ターンに `recallEpisodesPerTurn` 件まで**）。 */
  readonly recallEpisode: (id: string) => ChatRecallEpisodeResult
  /** ターンが終わった合図（両方の回数をまた0から数え直す）。 */
  readonly finishTurn: () => void
}

/**
 * {@link ChatRecall.recallList} が返すもの。**判別可能な合併型**にしてあるのは、「当たらなかった」と
 * 「このターンではもう引けない」がモデルへ返す文面の違う別の状態だから
 * （`docs/coding-standards.md`「「無いかもしれない」値」）。文面に変えるのは
 * `src/server/chat/core/chat-memory-prompt.ts`。
 */
export type ChatRecallListResult =
  /** 採点の高い順の候補（{@link ChatEpisodeCandidate}。空の配列にはならない）。 */
  | { readonly kind: "found"; readonly candidates: readonly ChatEpisodeCandidate[] }
  /** 索引に当たる候補が無かった。 */
  | { readonly kind: "not-found" }
  /** そのターンではもう一覧を引けない（`recallListsPerTurn` を超えた）。 */
  | { readonly kind: "exhausted" }

/** {@link ChatRecall.recallEpisode} が返すもの。形の理由は {@link ChatRecallListResult} と同じ。 */
export type ChatRecallEpisodeResult =
  /** 開いた1件の範囲の逐語（形は {@link ChatEpisodeReadResult} の `found` と同じ）。 */
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
 * {@link ChatArchive.readRecent} に渡す2つの上限（どちらも文面の UTF-8 バイト数の合計）。
 * **旗のぶんは窓の外に足す**ので、読み戻し全体の上限は2つの和で決まる
 * （`src/shared/chat-memory-budget.ts` の `CHAT_MEMORY_BUDGET.recentBytes` と
 * `src/shared/chat-log.ts` の `CHAT_KEPT_READBACK_BYTES`）。
 */
export type ChatReadbackLimits = {
  /** 直近の窓（古い順に落ちる側）。 */
  readonly recentBytes: number
  /** 旗の付いたやり取り（窓から溢れたぶんだけを、旗の新しい順に拾う）。 */
  readonly keptBytes: number
}

/**
 * {@link ChatArchive.readRecent} が返すもの。**2つに分かれているのは、載せる場所が分かれて
 * いるから** — 旗のぶんは直近より前で、間に抜けた会話がある（時系列がつながらない）。
 * 混ぜて1つの並びにすると、読む側にその断絶が見えない（`docs/chat-mode.md` 4.9）。
 */
export type ChatArchiveReadback = {
  /** 旗が付いていて、かつ**窓に入らなかった**件（窓に入っている件はここに重ねない）。 */
  readonly kept: readonly ChatArchiveRecentEntry[]
  /** 直近の窓に入った件。 */
  readonly recent: readonly ChatArchiveRecentEntry[]
}

/**
 * {@link ChatArchive.readRecent} が返す1件。**話者の別・文面・その行の日付だけ**で、
 * `expression` も `images` も持たない（`docs/chat-mode.md` 4.9。**読む側が落とすのではなく、
 * 口が最初から渡さない**）。
 */
export type ChatArchiveRecentEntry = {
  readonly speaker: "user" | "character"
  readonly text: string
  /** その行のローカル日付（`YYYY-MM-DD`）。日付が変わるところに挟む見出しに使う。 */
  readonly date: string
}

/**
 * {@link ChatArchive.append} に渡す1件。`at` は届いた時刻（エポックミリ秒。`session-manager` の
 * `options.now()` をそのまま渡す）。**判別可能な合併型**にして、`images` はユーザーの行だけ、
 * `expression` はキャラクターの行だけが持つ形を型で表す。
 */
export type ChatArchiveEntry =
  | {
      readonly speaker: "user"
      readonly at: number
      readonly text: string
      /** 添えた画像の枚数。1枚以上あるときだけ値を持つ（`docs/design.md` 7章）。 */
      readonly images: number | undefined
    }
  | {
      readonly speaker: "character"
      readonly at: number
      readonly text: string
      readonly expression: Expression
    }

/**
 * このセッションが仕事か雑談か（`docs/design.md` 7章）。**雑談のときだけ渡る3つの口を
 * `chat` の側にまとめてある**のは、3つが同時に渡るか同時に渡らないかの2択で、
 * 「片方だけ無い」状態が実在しないから（`docs/coding-standards.md`
 * 「複数の「無い」が1つの状態」）。読む側の分岐も `mode.kind` の1つで済む。
 */
export type SessionMode =
  /** 仕事。**雑談の口は1つも渡らない**（作業の文脈が人格にもアーカイブにも入らない）。 */
  | { readonly kind: "work" }
  | {
      readonly kind: "chat"
      /**
       * 覚えたことの書き足し・忘れる口（`docs/design.md` 7.1）。渡るのは雑談のときだけで、
       * 渡ったときだけ `remember` と `forget` のツールが `mcpServers` に載る。
       */
      readonly personaMemory: PersonaMemory
      /**
       * 雑談の要約の写しの読み書き口（`docs/design.md` 7章）。駆動は `/clear` を見て印を戻すだけ
       * （`sdk-driver.ts`）。書くのは定着（`chat-consolidation-writer.ts`）。
       */
      readonly chatSummary: ChatSummary
      /**
       * 古い雑談を索引から思い出す口（`docs/design.md` 7章）。`recall` と `recall_episode` の
       * ツールが載る（仕事の会話はそもそもアーカイブに残さないので、引く先が無い）。
       */
      readonly chatRecall: ChatRecall
    }

/**
 * このセッションを新規に起こすか、続きから始めるか（`docs/requirements.md` 4.8「セッションの
 * 復元」）。**`resume: string | undefined` が「セッションIDが無い」ではなく「新規である」という
 * 意味を運んでいたのを判別可能な合併型にした**（`docs/coding-standards.md`「複数の「無い」が
 * 1つの状態」）。続きから始めるIDを選ぶのは `src/server/session-driver/adapter/sdk-session.ts` の
 * `findSessionToResume`。
 */
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
   * このセッションを起こす許可モード（**覚えた既定**。`src/shared/session-default.ts`）。
   * 起こしたあと帯から変えた値はここに戻らない（セッション限り）。
   */
  readonly permissionMode: PermissionMode
  /** このセッションを起こすモデル（**覚えた既定**。許可モードと同じ扱い）。 */
  readonly model: ModelAlias
  /**
   * このセッションを起こす effort（**覚えた既定**。モデル・許可モードと同じ扱い）。
   * `adapter/sdk-driver.ts` の `buildQuerySeedOptions` がそのまま `query()` へ渡す。
   */
  readonly effort: EffortLevel
  /**
   * `systemPrompt` に足す文字列（人格と tsukumo 側の規約と雑談の記憶。組み立ては
   * `src/server/system-prompt/core/system-prompt.ts` の `takeSystemPromptAppend`）。**中身をこのファイルが
   * 決めない**（docs/design.md 5章）。
   */
  readonly systemPromptAppend: string
  /** 新規に起こすか、続きから始めるか（`docs/requirements.md` 4.8）。 */
  readonly start: SessionStart
  /**
   * このセッションに付ける印（組み立ては `src/server/session-driver/core/session-restore.ts` の `sessionTag`。
   * キャラクターパックごと・雑談かどうかで違う）。**ターンが終わるたびに付け直す**（次に起こしたときに、これでそのパックの
   * セッションだけを見分ける。付け直す理由は `src/server/session-driver/adapter/sdk-session.ts` の
   * `SESSION_TAG_DELAY_MS`）。
   */
  readonly tag: string
  /** 仕事か雑談か。雑談のときだけ渡る4つの口も、この中にまとまっている。 */
  readonly mode: SessionMode
  /**
   * 子プロセス（claude）へ引き継ぐ環境変数（`Config.inheritedEnv`）。駆動はこれに
   * `CLAUDE_CODE_TERMINAL_MCP_TOOLS` を足して渡す（`src/server/session-driver/core/visible-output-nudge.ts`）。
   */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
  /**
   * 利用者が見送った提案の識別子（`usageProposalKey`）を読む口。見直しのツールが呼ばれる
   * たびに読み直す（`src/server/usage-review/core/usage-review-tool.ts`）。**読めないときは空を返し、
   * 例外を投げない**。
   */
  readonly dismissedUsageProposalKeys: () => readonly string[]
  /** 内部イベントの受け取り口。**ここで例外を投げないこと**（投げるとセッションが終わる）。 */
  readonly onEvent: (event: SessionEvent) => void
}

export type SessionDriver = {
  /**
   * 依頼を1つ送る（ストリーミング入力への追加）。`request` イベントも同時に流れる。
   *
   * `images` は添えた画像の**原寸と控えの対に、棚が振った id を添えたもの**
   * （`docs/requirements.md` 4.10。棚に置くのは呼び出し側 = `session-manager.ts`）。原寸は
   * モデルへ渡すだけ、控えと id は `request` イベントに載せる——**分けるのは駆動の側**で
   * （`recordedPromptImages`）、ここから先の記録へ原寸は出ない。
   */
  readonly prompt: (text: string, images: readonly ShelvedPromptImage[]) => void
  /**
   * 依頼を1つ送るが、**記録に残さない**（`docs/screen-design.md` 13.7「立ち絵をつつくと話しかけて
   * くれる」）。流れるのは `request` ではなく `turn-started` なので、**送った文面は画面のログにも
   * 記録にも雑談の会話のアーカイブにも残らない**（落とすのは組み立ての側ではなく、この時点）。
   *
   * 画像は添えられない（tsukumo が自分で足す一言のための口で、利用者の持ち物を運ばない）。
   */
  readonly promptWithoutRecord: (text: string) => void
  /** 実行中のターンを中断する。中断されたターンは `turn-finished` の `interrupted` で終わる（失敗にはしない）。 */
  readonly interrupt: () => Promise<void>
  /** 答え待ちに答える。解決済み・知らない id のときは `false`。 */
  readonly answer: (id: string, answer: Answer) => boolean
  /** いまの答え待ち（画面を組み直すときに使う）。 */
  readonly pending: () => readonly PendingAsk[]
  /**
   * いまのコンテキストの内訳を取る（`docs/glossary.md`「コンテキストの内訳」）。
   * **取れなかったときは「取れない」を返し、例外を投げない**（トークン消費の画面が札を1枚
   * 出せないだけで、常駐プロセスは落ちない。`docs/coding-standards.md`「エラーハンドリング」）。
   */
  readonly readContextUsage: () => Promise<ContextUsageReport>
  /** モデルを切り替える（画面からの切り替えは後続タスクで配線する）。 */
  readonly setModel: (model: string | undefined) => Promise<void>
  /**
   * effort を切り替える（`docs/screen-design.md` 13.9「動き方の操作子」）。**モデルと違って
   * 確認の合図を返さない** — 帯に表示する値は次のターンの `Stop` フック入力から読み取った
   * ものだけで、送った値をここから先回りで流さない（押した値へ先に倒さない。理由は
   * `docs/screen-design.md` 13.9「動き方の操作子」）。
   */
  readonly setEffort: (effort: EffortLevel) => Promise<void>
  /** 許可モードを切り替える（画面からの切り替えは後続タスクで配線する）。 */
  readonly setPermissionMode: (mode: PermissionMode) => Promise<void>
  /** 入力を閉じてセッションを終える。子プロセスも止まる。 */
  readonly close: () => void
}
