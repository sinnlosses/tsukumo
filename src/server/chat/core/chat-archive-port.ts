// 雑談と仕事の会話のアーカイブと、定着が使う口の型。ここにあるのは型だけ。

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { ChatFoldPoint } from "../../session-driver/core/session-driver.ts"

/**
 * 雑談と仕事の会話のアーカイブの読み書き口。
 * 会話の文面を読み戻す口は {@link ChatArchive.readRecent}・{@link ChatArchive.unconsolidated} の2つに限る。
 * 読み戻しの口を足すにはユーザーの決定が要る（`docs/coding-standards.md`「会話内容の扱い」）。
 */
export type ChatArchive = {
  /**
   * 依頼・セリフ・仕事のターンの結論のいずれか1件を追記する。
   * 書けないときは黙って何もしない。
   */
  readonly append: (packName: CharacterPackName, entry: ChatArchiveEntry) => void
  /**
   * 雑談の依頼に添えた画像の原寸1枚を、そのパックの画像の置き場へ書く。
   * 非同期で書き、書けたら置き場の下のファイル名を返す。書けないときも例外は投げず、失敗を返す。
   */
  readonly writeImage: (
    packName: CharacterPackName,
    image: ChatArchiveImage,
  ) => Promise<ChatArchiveImageWriteResult>
  /**
   * そのパックの直近の会話を、新しいほうから遡って {@link ChatReadbackLimits} のバイト数まで読む。
   * 返すのは古い→新しいの順。
   * 1件を単位にし、途中では切らない（溢れる1件は載せない）。
   * 読めない行（壊れた JSON・知らない版・鍵が足りない）は1行ずつ落とし、例外は投げない。
   * 読めなければ空を返し、そのセッションは逐語なしで始まる。
   */
  readonly readRecent: (
    packName: CharacterPackName,
    limits: ChatReadbackLimits,
  ) => readonly ChatArchiveRecentEntry[]
  /**
   * 定着の入力の行を、古いほうから {@link ChatUnconsolidatedLimits.maxBytes} まで返す。
   * {@link ChatUnconsolidatedLimits.recentBytes} の窓の外にあり、`after` より後の行だけを対象にする（`none` ならアーカイブの最初から）。
   * 行番号はここでは振らない（振るのは渡す側）。
   * 契機（`consolidateEveryBytes`）に届いたかは、呼び出し側が {@link ChatUnconsolidatedBatch.usedBytes} で比べる。
   */
  readonly unconsolidated: (
    packName: CharacterPackName,
    limits: ChatUnconsolidatedLimits,
    after: ChatFoldPoint,
  ) => ChatUnconsolidatedBatch
  /**
   * このプロセスが {@link ChatArchive.append} で書いた文面の UTF-8 バイト数の、そのパックの累計。
   * ファイルは読まない。定着が `unconsolidated` を読むかどうかを先に決めるのに使う。
   */
  readonly appendedBytes: (packName: CharacterPackName) => number
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
  /**
   * `maxBytes` に届いて打ち切ったか。
   * 先頭の1件だけで `maxBytes` を超えるときも `true` で、その1件は切らずに単独で `entries` に入る。
   */
  readonly overflowed: boolean
}

/**
 * {@link ChatArchive.readRecent} が返す1件。行の種類・文面・その行の日付だけで、`expression` も `images` も持たない。
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
 * {@link ChatArchive.readRecent} に渡す上限（文面の UTF-8 バイト数。
 * 雑談は `CHAT_MEMORY_BUDGET.recentBytes`、仕事は `workRecentBytes`）。
 */
export type ChatReadbackLimits = {
  /** 直近の窓（古い順に落ちる側）。 */
  readonly recentBytes: number
}

/** {@link ChatArchive.writeImage} に渡す1枚。`id` は棚が振ったもの、`at` は依頼が届いた時刻（エポックミリ秒）。 */
export type ChatArchiveImage = {
  readonly id: string
  readonly at: number
  /** 原寸の data URL。 */
  readonly dataUrl: string
}

/** {@link ChatArchive.writeImage} が返すもの。`error` は診断に落とすためだけに持つ。 */
export type ChatArchiveImageWriteResult =
  | { readonly kind: "written"; readonly fileName: string }
  | { readonly kind: "failed"; readonly error: unknown }

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
      /** 書けた画像のファイル名（{@link ChatArchive.writeImage} の戻り値）。1枚以上書けたときだけ値を持つ。 */
      readonly imageFiles: readonly string[] | undefined
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
