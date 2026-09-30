// 雑談と仕事の会話のアーカイブと、定着が使う口の型。ここにあるのは型だけ。
// `SessionMode` から引かれる雑談の型（`ChatRecall` が使う `ChatArchiveLine` など）は、
// 駆動の契約と輪になるので、駆動の契約の側に残る。

import type { Expression } from "../../../shared/character-pack/expression.ts"
import type {
  ChatArchiveLine,
  ChatArchiveRecentEntry,
  ChatEpisodeCandidate,
} from "../../session-driver/core/session-driver.ts"

/**
 * 雑談と仕事の会話のアーカイブの読み書き口。
 * 会話の文面を読み戻す口は {@link ChatArchive.readRecent}・{@link ChatArchive.unconsolidated}・{@link ChatArchive.recallEpisode} の3つに限る。
 * 読み戻しの口を足すにはユーザーの決定が要る（`docs/coding-standards.md`「会話内容の扱い」）。
 */
export type ChatArchive = {
  /**
   * 依頼・セリフ・仕事のターンの結論のいずれか1件を追記する。
   * `packName` が `isCharacterPackName` を通らない・書けないときは黙って何もしない。
   */
  readonly append: (packName: string, entry: ChatArchiveEntry) => void
  /**
   * そのパックの直近の会話を、新しいほうから遡って {@link ChatReadbackLimits} のバイト数まで読む。
   * 返すのは古い→新しいの順。
   * 1件を単位にし、途中では切らない（溢れる1件は載せない）。
   * 読めない行（壊れた JSON・知らない版・鍵が足りない）は1行ずつ落とし、例外は投げない。
   * 読めなければ空を返し、そのセッションは逐語なしで始まる。
   */
  readonly readRecent: (
    packName: string,
    limits: ChatReadbackLimits,
  ) => readonly ChatArchiveRecentEntry[]
  /**
   * まだどのエピソードにも入っていない行を、古いほうから {@link ChatUnconsolidatedLimits.maxBytes} まで返す（定着の入力）。
   * 最後のエピソードの `to` より後で、{@link ChatUnconsolidatedLimits.recentBytes} の窓の外にある行だけを対象にする。
   * エピソードが無ければアーカイブの最初の行から。
   * 行番号はここでは振らない（振るのは渡す側）。
   * 契機（`consolidateEveryBytes`）に届いたかは、呼び出し側が {@link ChatUnconsolidatedBatch.usedBytes} で比べる。
   */
  readonly unconsolidated: (
    packName: string,
    limits: ChatUnconsolidatedLimits,
  ) => ChatUnconsolidatedBatch
  /** 定着ができたエピソードを追記する（`id` はここで振る）。書けなくても例外は投げない。 */
  readonly appendEpisodes: (packName: string, episodes: readonly ChatEpisodeDraft[]) => void
  /**
   * 索引を引く言葉で採点し、点の高い順に {@link ChatEpisodeCandidate} を返す。
   * 採点は `scoreChatEpisodes` の純関数で、ここは `episode.jsonl` と `recalled.jsonl` を読んで渡すだけ。
   */
  readonly recallList: (
    packName: string,
    keyword: string,
    limitBytes: number,
    now: Temporal.Instant,
  ) => ChatEpisodeRecallListResult
  /** 1件のエピソードの範囲を、アーカイブから逐語のまま古いほうから読む。開いたことは `recalled.jsonl` に残る。 */
  readonly recallEpisode: (
    packName: string,
    id: string,
    limitBytes: number,
    now: Temporal.Instant,
  ) => ChatEpisodeReadResult
  /**
   * そのパックの定着の錠を取る。プロセスをまたいで1本だけが取れる。
   * 取れなければ undefined（ほかの誰かが走らせている）。
   * 書いてから `staleAfterMs` を過ぎた錠は、落ちたプロセスの残りとして消して取り直す。
   */
  readonly lockConsolidation: (
    packName: string,
    staleAfterMs: number,
    now: Temporal.Instant,
  ) => ChatConsolidationLock | undefined
}

/** {@link ChatArchive.lockConsolidation} が取れたときの錠。 */
export type ChatConsolidationLock = {
  /** 錠を外す。外せなくても例外は投げない。 */
  readonly release: () => void
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
export type ChatUnconsolidatedEntry = ChatArchiveLine & {
  readonly at: string
}

/** {@link ChatArchive.unconsolidated} が返すもの。 */
export type ChatUnconsolidatedBatch = {
  /** 古い→新しいの順。 */
  readonly entries: readonly ChatUnconsolidatedEntry[]
  /** 返した行の文面の UTF-8 バイト数の合計。 */
  readonly usedBytes: number
  /** 最後のエピソードの見出し（無ければ空文字。話題が続いているかを定着に見分けさせるため）。 */
  readonly previousEpisodeTitle: string
  /**
   * `maxBytes` に届いて打ち切ったか。
   * 先頭の1件だけで `maxBytes` を超えるときも `true` で、その1件は切らずに単独で `entries` に入る。
   */
  readonly overflowed: boolean
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

/** {@link ChatArchive.recallList} が返すもの。 */
export type ChatEpisodeRecallListResult =
  | { readonly kind: "found"; readonly candidates: readonly ChatEpisodeCandidate[] }
  | { readonly kind: "not-found" }

/** {@link ChatArchive.recallEpisode} が返すもの。 */
export type ChatEpisodeReadResult =
  | {
      readonly kind: "found"
      /** 古い→新しいの順。 */
      readonly entries: readonly ChatArchiveRecentEntry[]
      /** `limitBytes` に収まらず、続きがあるとき `true`。 */
      readonly overflowed: boolean
    }
  | { readonly kind: "not-found" }

/**
 * {@link ChatArchive.readRecent} に渡す上限（文面の UTF-8 バイト数。
 * 雑談は `CHAT_MEMORY_BUDGET.recentBytes`、仕事は `workRecentBytes`）。
 */
export type ChatReadbackLimits = {
  /** 直近の窓（古い順に落ちる側）。 */
  readonly recentBytes: number
}

/**
 * {@link ChatArchive.append} に渡す1件。`at` は届いた時刻（エポックミリ秒）。
 * `mode` は書いたときが雑談か仕事か、`kind` は依頼・セリフ・仕事のターンの結論のどれか。
 * `project` は仕事の行だけが持つ（リポジトリの名前だけ。パスは持たない）。
 * 話者（利用者か、キャラクターか）は `kind` から決まるので、ここには持たない
 * （`kind === "request"` なら利用者、それ以外はキャラクター。書き出す形への変換は adapter が持つ）。
 */
export type ChatArchiveEntry =
  | {
      readonly mode: "chat"
      readonly kind: "request"
      readonly at: number
      readonly text: string
      /** 添えた画像の枚数。1枚以上あるときだけ値を持つ。 */
      readonly images: number | undefined
    }
  | {
      readonly mode: "chat"
      readonly kind: "speech"
      readonly at: number
      readonly text: string
      readonly expression: Expression
    }
  | {
      readonly mode: "work"
      readonly kind: "request"
      readonly at: number
      readonly text: string
      readonly project: string
      /** 添えた画像の枚数。1枚以上あるときだけ値を持つ。 */
      readonly images: number | undefined
    }
  | {
      readonly mode: "work"
      readonly kind: "speech"
      readonly at: number
      readonly text: string
      readonly project: string
      readonly expression: Expression
    }
  | {
      readonly mode: "work"
      readonly kind: "conclusion"
      readonly at: number
      readonly text: string
      readonly project: string
    }
