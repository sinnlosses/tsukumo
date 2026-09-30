// セッションの印（SDK の `tagSession`）の組み立てと読み取り。
// 外の世界（claude の transcript）に書かれる値なので、組み立てと読み取りを1箇所に集める。

import { DEFAULT_VIEW_PORT, MAX_PORT_NUMBER } from "../../view-server/core/port-resolution.ts"

/** セッションの印の前置き。組み立ては {@link sessionTag} だけ（文字列を他所で作らない）。 */
const SESSION_TAG_PREFIX = "tsukumo"
/** 雑談のセッションの印に足す後置き。仕事のときは足さない（{@link sessionTag}）。 */
const SESSION_TAG_CHAT_SUFFIX = "chat"
/**
 * 目印の区切り。`:` を使わないのは、後置きの `chat` と読み違えないため。
 * `tsukumo:<パック>:chat@7328` の最後の `@` から後ろが目印だと、区切りだけで分かる。
 */
const SESSION_MARK_SEPARATOR = "@"
/**
 * 昔の印が目印に使っていた文字（`A` / `B` / …）。transcript に残っているので、読むときだけ使う。
 * `A` が {@link DEFAULT_VIEW_PORT}、+1 ごとに次の文字なので、同じ式で元のポートへ戻せる（{@link readSessionMark}）。
 */
const LEGACY_SESSION_MARK_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
/** ポート番号として読める目印の形（`@0`〜`@65535`）。 */
const SESSION_MARK_PORT = /^[0-9]{1,5}$/

/**
 * キャラクターパック1つぶんの、そのモードのセッションの印（SDK の `tagSession`）。
 * 続きから始めるセッションを選ぶ鍵の片方で、もう片方は起動した作業ディレクトリ。
 *
 * 印にパックの名前を混ぜるのは、キャラクターごとに別のセッションを持つため。
 * 印の無いセッション（同じディレクトリで使った素の `claude`）も、別のパックのセッションも、これで外れる。
 *
 * 雑談のときだけ `:chat` を足すのは、雑談と仕事で claude 側の文脈ごと分けるため。
 *
 * 末尾の目印（`@7327` / `@7328` …）は、同じディレクトリで tsukumo を何個も起こしたときに別々のセッションを持たせるためのもの。
 * 目印はビューが実際に待ち受けているポートの番号そのもので、畳まない。セッションを指す ID が「キャラクターパック × ポート番号」だから。
 *
 * ポートを使うのは、「その目印がいま使われているか」を知っているものが他に無いため。
 * 印は transcript に残るだけなので、落ちた tsukumo の印と動いている tsukumo の印は見分けられない（実測）。
 * ポートは OS が握っていて、既定のときは塞がっていれば +1 へずれ（`resolveViewPort`）、プロセスが落ちれば空くので、起こし直せば同じ番号＝同じセッションへ戻る。
 *
 * 昔の印（目印の無いもの・1文字の `@A`）も同じセッションを指す（{@link readSessionMark} がポートへ戻す）。
 *
 * 印は会話の内容ではないので、claude 自身の transcript に付けても `docs/coding-standards.md`「会話内容の扱い」には触れない。
 */
export function sessionTag(characterName: string, chat: boolean, viewPort: number): string {
  return `${sessionTagFamily(characterName, chat)}${SESSION_MARK_SEPARATOR}${String(viewPort)}`
}

/** 印を読み解いた姿（{@link readSessionMark}）。 */
export type SessionMark = {
  /**
   * 目印（印を付けた tsukumo のビューのポート番号）。
   * 昔の印は既定のポートへ戻してある（目印が無いもの＝`DEFAULT_VIEW_PORT`、1文字の `A` / `B` / …＝そこから並び順に +1）。
   */
  readonly viewPort: number
  /**
   * 目印まで揃えた印。続きから始めるセッションを選ぶときも、切り替え先の一覧をいまの部屋に絞るときも、これ同士を比べる。
   * `tsukumo:<パック>` と `tsukumo:<パック>@A` と `tsukumo:<パック>@7327` は同じセッションを指す。
   */
  readonly tag: string
}

/**
 * transcript に付いていた印を読み解く。
 * tsukumo の印でなければ undefined（同じディレクトリで使った素の `claude` のセッションはここで落ちる）。
 *
 * 読めた目印は必ずポート番号に戻し、印も `@<ポート>` の形へ揃えてから返すので、昔の印と今の印が同じセッションを指す:
 *
 * - `@7328` のような数字 → そのポート
 * - `@A` / `@B` … の1文字 → 並び順から戻したポート（`A` が `DEFAULT_VIEW_PORT`）
 * - それ以外（目印が無い・名前に `@` を含むパックの尻尾）→ `DEFAULT_VIEW_PORT`
 *
 * 最後の行のおかげで、`tsukumo:<パック>` は `tsukumo:<パック>@7327` と同じセッションを指す。
 */
export function readSessionMark(tag: string): SessionMark | undefined {
  if (!tag.startsWith(`${SESSION_TAG_PREFIX}:`)) {
    return undefined
  }

  const separator = tag.lastIndexOf(SESSION_MARK_SEPARATOR)
  const marked = separator === -1 ? undefined : markedViewPort(tag.slice(separator + 1))
  const family = marked === undefined ? tag : tag.slice(0, separator)
  const viewPort = marked ?? DEFAULT_VIEW_PORT
  return { viewPort, tag: `${family}${SESSION_MARK_SEPARATOR}${String(viewPort)}` }
}

/** 目印を外した印（`tsukumo:<パック>` / `tsukumo:<パック>:chat`）。{@link sessionTag} が目印を足すための下ごしらえ。 */
function sessionTagFamily(characterName: string, chat: boolean): string {
  const packTag = `${SESSION_TAG_PREFIX}:${characterName}`
  return chat ? `${packTag}:${SESSION_TAG_CHAT_SUFFIX}` : packTag
}

/** 印の末尾を目印として読む。目印として読めなければ undefined（パック名に `@` が入っているときの尻尾がここで落ちる）。 */
function markedViewPort(mark: string): number | undefined {
  if (SESSION_MARK_PORT.test(mark)) {
    const port = Number(mark)
    return port <= MAX_PORT_NUMBER ? port : undefined
  }

  const legacyIndex = mark.length === 1 ? LEGACY_SESSION_MARK_LETTERS.indexOf(mark) : -1
  return legacyIndex === -1 ? undefined : DEFAULT_VIEW_PORT + legacyIndex
}
