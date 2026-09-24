// セッション駆動の契約（docs/glossary.md「セッション駆動」）。**ここにあるのは型だけ**で、
// 実際に何かを起こすコードは持たない。実装は2つあり、どちらも `src/server/adapter/` にある
// （Agent SDK の `sdk-driver.ts` と、疑似セッションを流す `fake-driver.ts`）。
//
// 契約をここに置いてあるので、`session-manager` は駆動の実装を import せずに済む
// （どちらが動いているかを知らない。docs/design.md 5章）。
//
// **境目の基準は「shared の語彙で書けるか / SDK の語彙を名乗るか」**。shared の語彙だけで
// 書けるもの（契約の型）はここに、SDK の語彙を名乗るもの（`DEFAULT_EFFORT` の `EffortLevel`、
// `query()` の options、`listSessions` / `getSessionMessages` を使う関数）は
// `src/server/adapter/` の `sdk-` で始まるファイル（`sdk-driver.ts` / `sdk-session.ts` など）に置く。
//
// **既定のモデルと許可モードはここに無い**（`src/shared/session-default.ts` の
// `BUILTIN_SESSION_DEFAULT`）。覚えた値を歯車から書き換えられるようになって、
// **ブラウザも同じ畳み先を読む**ようになったため（`docs/screen-design.md` 13.6）。

import { type ModelAlias, type PermissionMode } from "../../shared/command.ts"
import { type ContextUsageReport } from "../../shared/context-usage.ts"
import { type ExpressionChoice } from "../../shared/expression-choice.ts"
import { type Expression } from "../../shared/expression.ts"
import { type Answer, type PendingAsk } from "../../shared/pending-ask.ts"
import { type SessionEvent } from "../../shared/session-event.ts"
import { type ShelvedPromptImage } from "./prompt-image-shelf.ts"

/**
 * 覚えたことを人格に書き足す口と、覚えた1行を忘れる口（`docs/design.md` 7.1）。
 * **実装は `adapter` 側**（`src/server/adapter/persona-memory.ts`）で、ここにあるのは契約だけ。
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
 * **実装は `adapter` 側**（`src/server/adapter/chat-summary.ts`）で、ここにあるのは契約だけ。
 *
 * **中身を読んで判定する口は無い。** 載せるかどうかの判断は
 * `src/server/core/chat-memory-prompt.ts` が持ち、ここは「どこに・どう書き、どう渡すか」の
 * 4つの動きだけを持つ。
 */
export type ChatSummary = {
  /** 写しと印を読む（ファイルが無い・読めないときは undefined）。 */
  readonly read: () => ChatSummaryRecord | undefined
  /**
   * 圧縮でできた要約を写す（上書き）。**呼ぶと印は「渡し済み」になる**——同じ機会にできた
   * 要約は、いま動いているこのセッション自身がすでに持っている（`docs/design.md` 7章の表の
   * 「起こし直し（resume）」の行）。
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
 * 置くか」）。**実装は `adapter` 側**（`src/server/adapter/chat-archive.ts`）で、ここにあるのは
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
   * いま進行中のやり取りに「残す」旗を立てる（{@link ChatKeep.keep} の実体。
   * `docs/chat-mode.md` 4.9「残すと決めた1往復は窓から落とさない」）。**書くのは
   * {@link finishTurn} のとき**なので、ターンの途中のどこで呼んでも同じ1往復に付く。
   */
  readonly keep: () => void
  /**
   * ターンが終わった合図。旗が立っていれば、**このターンで書いた行を指す印**をここで書く
   * （文面は複製しない）。旗が立っていなければ、覚えていた行を忘れるだけ。
   */
  readonly finishTurn: () => void
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
   * その日の**見出しを1行**、索引に残す（{@link ChatRecall.index} の実体。
   * `docs/chat-mode.md` 4.9「古い雑談は索引を引いて思い出す」）。**付くのは書いた日**で、
   * 前の日を指し直せない。書けない行（空・改行つき・長すぎる）と、そのターンで2行目に当たる
   * 呼び出しは黙って捨てる。
   */
  readonly writeIndex: (packName: string, line: string) => void
  /**
   * 索引を `keyword` で引き、**当たった日の逐語だけ**を新しいほうから `limitBytes` まで読む
   * （{@link ChatRecall.recall} の実体）。**当たらない日のファイルは開かない**のがこの口の要点で、
   * アーカイブが何年ぶん増えても開くファイルの数は上限で頭打ちになる。
   *
   * **引けるのは1ターンに1回**（2回目以降は読まずに `already-recalled` を返す）。切り方・
   * 読めない行の扱い・例外を投げないことは {@link readRecent} と同じ。
   */
  readonly recall: (packName: string, keyword: string, limitBytes: number) => ChatRecallResult
}

/**
 * 古い雑談を索引から思い出す口（`docs/design.md` 7章）。**`ChatArchive` を駆動へそのまま
 * 渡さないために分けてある**のは {@link ChatKeep} と同じで、パックの名前と読む量は配線層
 * （`src/session-start.ts`）が縛ってから渡す。**雑談モードのときだけ渡り**、渡ったときだけ
 * `index` と `recall` のツールが `mcpServers` に載る。
 */
export type ChatRecall = {
  /** その日の見出しを索引に1行残す（**1ターンに1行**。書けたかどうかは返さない）。 */
  readonly index: (line: string) => void
  /** 索引を引き、当たった日の逐語を返す（**1ターンに1回**）。 */
  readonly recall: (keyword: string) => ChatRecallResult
}

/**
 * {@link ChatRecall.recall} が返すもの。**判別可能な合併型**にしてあるのは、「当たらなかった」と
 * 「このターンではもう引けない」がモデルへ返す文面の違う別の状態だから
 * （`docs/coding-standards.md`「「無いかもしれない」値」）。文面に変えるのは
 * `src/server/core/chat-memory-prompt.ts`。
 */
export type ChatRecallResult =
  /** 当たった日の逐語（**古い→新しいの順**。空の配列にはならない）。 */
  | { readonly kind: "found"; readonly entries: readonly ChatArchiveRecentEntry[] }
  /** 索引に当たる日が無かった（**どの日のファイルも開いていない**）。 */
  | { readonly kind: "not-found" }
  /** そのターンで既に1回引いている（**索引も日のファイルも開いていない**）。 */
  | { readonly kind: "already-recalled" }

/**
 * 「残す」旗を立てる口（`docs/design.md` 7章）。**`ChatArchive` を駆動へそのまま渡さないため
 * だけに分けてある** — 駆動に要るのは旗を立てる1つの動きで、書き口も読み口も要らない。
 * **雑談モードのときだけ渡り**、渡ったときだけ `keep` ツールが `mcpServers` に載る。
 */
export type ChatKeep = {
  /** いま進行中のやり取りに旗を立てる（**引数は無い**。指せるのはそのターンだけ）。 */
  readonly keep: () => void
}

/**
 * {@link ChatArchive.readRecent} に渡す2つの上限（どちらも文面の UTF-8 バイト数の合計）。
 * **旗のぶんは窓の外に足す**ので、読み戻し全体の上限は2つの和で決まる
 * （`src/shared/chat-log.ts` の `CHAT_RECENT_READBACK_BYTES` と `CHAT_KEPT_READBACK_BYTES`）。
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
 * このセッションが仕事か雑談か（`docs/design.md` 7章）。**雑談のときだけ渡る4つの口を
 * `chat` の側にまとめてある**のは、4つが同時に渡るか同時に渡らないかの2択で、
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
       * 雑談の要約の写しの読み書き口（`docs/design.md` 7章）。雑談のときだけ `PostCompact`
       * フックが登録され、`/clear` を見て印を戻す（`sdk-driver.ts`）。
       */
      readonly chatSummary: ChatSummary
      /** 「残す」旗を立てる口（`docs/design.md` 7章）。`keep` ツールが載る。 */
      readonly chatKeep: ChatKeep
      /**
       * 古い雑談を索引から思い出す口（`docs/design.md` 7章）。`index` と `recall` のツールが
       * 載る（仕事の会話はそもそもアーカイブに残さないので、引く先が無い）。
       */
      readonly chatRecall: ChatRecall
    }

/**
 * このセッションを新規に起こすか、続きから始めるか（`docs/requirements.md` 4.8「セッションの
 * 復元」）。**`resume: string | undefined` が「セッションIDが無い」ではなく「新規である」という
 * 意味を運んでいたのを判別可能な合併型にした**（`docs/coding-standards.md`「複数の「無い」が
 * 1つの状態」）。続きから始めるIDを選ぶのは `src/server/adapter/sdk-session.ts` の
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
   * `diary` ツールが書いた日記に添える、書いた時点のパック（ディレクトリ名と表示名。
   * `docs/design.md`「日記の受け取りと保存」）。あとでキャラクターを替えても誰が書いたかが残る。
   */
  readonly diaryWriter: { readonly pack: string; readonly name: string }
  /**
   * このセッションを起こす許可モード（**覚えた既定**。`src/shared/session-default.ts`）。
   * 起こしたあと帯から変えた値はここに戻らない（セッション限り）。
   */
  readonly permissionMode: PermissionMode
  /** このセッションを起こすモデル（**覚えた既定**。許可モードと同じ扱い）。 */
  readonly model: ModelAlias
  /**
   * `systemPrompt` に足す文字列（人格と tsukumo 側の規約と雑談の記憶。組み立ては
   * `src/server/core/system-prompt.ts` の `takeSystemPromptAppend`）。**中身をこのファイルが
   * 決めない**（docs/design.md 5章）。
   */
  readonly systemPromptAppend: string
  /** 新規に起こすか、続きから始めるか（`docs/requirements.md` 4.8）。 */
  readonly start: SessionStart
  /**
   * このセッションに付ける印（組み立ては `src/server/core/session-restore.ts` の `sessionTag`。
   * キャラクターパックごと・雑談かどうかで違う）。**ターンが終わるたびに付け直す**（次に起こしたときに、これでそのパックの
   * セッションだけを見分ける。付け直す理由は `src/server/adapter/sdk-session.ts` の
   * `SESSION_TAG_DELAY_MS`）。
   */
  readonly tag: string
  /** 仕事か雑談か。雑談のときだけ渡る4つの口も、この中にまとまっている。 */
  readonly mode: SessionMode
  /**
   * 子プロセス（claude）へ引き継ぐ環境変数（`Config.inheritedEnv`）。駆動はこれに
   * `CLAUDE_CODE_TERMINAL_MCP_TOOLS` を足して渡す（`src/server/core/visible-output-nudge.ts`）。
   */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
  /**
   * 利用者が見送った提案の識別子（`usageProposalKey`）を読む口。見直しのツールが呼ばれる
   * たびに読み直す（`src/server/core/usage-review-tool.ts`）。**読めないときは空を返し、
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
  /** 許可モードを切り替える（画面からの切り替えは後続タスクで配線する）。 */
  readonly setPermissionMode: (mode: PermissionMode) => Promise<void>
  /** 入力を閉じてセッションを終える。子プロセスも止まる。 */
  readonly close: () => void
}
