// 環境変数の解釈と、**環境変数の名前の一覧**（docs/coding-standards.md「外の世界に依存する値は
// 読み取りを1モジュールに集約する」。モジュールのトップレベルでは触らず、{@link readConfig} を
// 呼んだときだけ読む）。値を読むのは呼び出し側の src/cli.ts。
//
// 値の意味と既定は docs/design.md 5章「config.ts」の表が正典。
//
// セッションの印（{@link sessionTag} / {@link readSessionMark}）もここに置く。環境変数では
// ないが、**外の世界（claude の transcript）に書かれる値**なので、組み立てと読み取りを
// 1箇所に集める。

import { DEFAULT_VIEW_PORT, MAX_PORT_NUMBER } from "./port-resolution.ts"

/** ビューを配るポート（既定は src/server/core/port-resolution.ts の `DEFAULT_VIEW_PORT`）。 */
export const VIEW_PORT_ENV_NAME = "TSUKUMO_VIEW_PORT"
/**
 * `TSUKUMO_VIEW_PORT` が未設定のときに使う既定ポートの起点を差し替える（既定は
 * {@link DEFAULT_VIEW_PORT}。読めない値は無視してそのまま {@link DEFAULT_VIEW_PORT} を使う
 * ——`TSUKUMO_VIEW_PORT` と違い、ここでは起動を止めない。{@link resolveViewPortFallbackBase}）。
 * `TSUKUMO_VIEW_PORT` を明示したときは効かない（既定を使うときだけの上書きのため）。
 *
 * 実際の既定ポート帯（`DEFAULT_VIEW_PORT`〜+19）はほかの tsukumo が普段使っているので、
 * そこを丸ごと塞いで「全部塞がっている」経路を確かめるテスト（test/cli.test.ts）はそこを
 * 使えない。この口で起点をテストごとの私的な帯へ逃がす。
 */
export const VIEW_PORT_FALLBACK_BASE_ENV_NAME = "TSUKUMO_VIEW_PORT_FALLBACK_BASE"
/** キャラクターパック定義ディレクトリのパス（相対は cwd 相対、絶対はそのまま）。 */
export const CHARACTER_ENV_NAME = "TSUKUMO_CHARACTER"
/** 起動時にタブを自動で開くか（`0` のときだけ開かない）。 */
export const OPEN_VIEW_ENV_NAME = "TSUKUMO_OPEN_VIEW"
/** セッションの駆動（`sdk` / `fake`）。 */
export const DRIVER_ENV_NAME = "TSUKUMO_DRIVER"
/** fake driver で、起こした直後に流す場面の名前（疑似セッションの `turns[].name`）。 */
export const FAKE_SCENE_ENV_NAME = "TSUKUMO_FAKE_SCENE"
/** `1` で復元せず新規に起こす（docs/requirements.md 4.8 の「逃げ道」）。 */
export const NEW_SESSION_ENV_NAME = "TSUKUMO_NEW_SESSION"
/** `1` で `src/browser/` を見張り、変更のたびに組み立て直す（開発中だけ。docs/design.md 11章）。 */
export const WATCH_UI_ENV_NAME = "TSUKUMO_WATCH_UI"
/**
 * tsukumo が自分の持ち物を置くホームのパス（相対は cwd 相対、絶対はそのまま）。**名前はここに
 * 置くが、読むのは {@link readConfig} ではなく src/server/adapter/tsukumo-home.ts**（理由は
 * そのファイルの冒頭。配線層から配る道が無い）。
 */
export const HOME_ENV_NAME = "TSUKUMO_HOME"

/** セッションの印の前置き。**組み立ては {@link sessionTag} だけ**（文字列を他所で作らない）。 */
const SESSION_TAG_PREFIX = "tsukumo"
/** 雑談のセッションの印に足す後置き。**仕事のときは足さない**（{@link sessionTag}）。 */
const SESSION_TAG_CHAT_SUFFIX = "chat"
/**
 * 目印の区切り。**`:` を使わない**のは、後置きの `chat` と読み違えないため
 * （`tsukumo:<パック>:chat@7328` の最後の `@` から後ろが目印だと、区切りだけで分かる）。
 */
const SESSION_MARK_SEPARATOR = "@"
/**
 * 目印に使っていた文字（`A` / `B` / …）。**読むときだけ使う**（かつてはビューのポートの
 * 並び順を1文字に畳んでいた）。`A` が {@link DEFAULT_VIEW_PORT}、+1 ごとに次の文字だったので、
 * 同じ式で元のポートへ戻せる（{@link readSessionMark}）。**組み立てはもう文字を使わない。**
 */
const LEGACY_SESSION_MARK_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
/** ポート番号として読める目印の形（`@0`〜`@65535`）。 */
const SESSION_MARK_PORT = /^[0-9]{1,5}$/

/**
 * セッションの駆動の種類。`fake` は**本物の claude を起こさず**、疑似セッションどおりにイベントを
 * 流す（src/server/adapter/fake-driver.ts）。目視確認・Playwright 用（docs/design.md 10章）。
 */
export type DriverKind = "sdk" | "fake"

export type Config = {
  /**
   * `TSUKUMO_VIEW_PORT` の生の値。**ここでは数として解釈しない**（既定か明示かの区別と
   * ずらす判断は src/server/core/port-resolution.ts が持つ）。
   */
  readonly rawViewPort: string | undefined
  /**
   * `TSUKUMO_VIEW_PORT_FALLBACK_BASE` の生の値。**ここでは数として解釈しない**
   * （{@link resolveViewPortFallbackBase} が読み解く）。
   */
  readonly rawViewPortFallbackBase: string | undefined
  /** キャラクターの指定（未設定なら undefined ＝ 同梱の既定を使う）。 */
  readonly character: string | undefined
  readonly openView: boolean
  readonly driver: DriverKind
  /**
   * fake driver で名指しする場面（未設定なら undefined ＝ 依頼を受けるまで `opening` だけ）。
   * **依頼を送らずに特定の画面を出す**ための口で、状態のカタログを撮るときに使う
   * （`docs/architecture.md`「手で確かめること」）。`driver` が `sdk` のときは効かない。
   */
  readonly fakeScene: string | undefined
  readonly newSession: boolean
  /**
   * `src/browser/` を見張って組み立て直すか。**既定は見張らない。** `tsukumo` は `bun link` で
   * リポジトリを指しているので普段使いと開発が同じ経路になり、常に入れると仕事中の保存で
   * ページが読み込み直されうる（docs/design.md 11章）。
   */
  readonly watchUi: boolean
}

/**
 * 環境変数を1回だけ読んで設定にする。**不正な値でここでは落とさない**（読めない値は既定へ
 * 倒し、ポート番号のように起動を止めるべきものだけを呼び出し側が判断する）。
 */
export function readConfig(env: Readonly<Record<string, string | undefined>>): Config {
  return {
    rawViewPort: env[VIEW_PORT_ENV_NAME],
    rawViewPortFallbackBase: env[VIEW_PORT_FALLBACK_BASE_ENV_NAME],
    character: nonEmpty(env[CHARACTER_ENV_NAME]),
    openView: env[OPEN_VIEW_ENV_NAME]?.trim() !== "0",
    driver: env[DRIVER_ENV_NAME]?.trim() === "fake" ? "fake" : "sdk",
    fakeScene: nonEmpty(env[FAKE_SCENE_ENV_NAME]),
    newSession: env[NEW_SESSION_ENV_NAME]?.trim() === "1",
    watchUi: env[WATCH_UI_ENV_NAME]?.trim() === "1",
  }
}

/**
 * キャラクターパック1つぶんの、そのモードのセッションの印（SDK の `tagSession`）。**続きから
 * 始めるセッションを選ぶ鍵の片方**で、もう片方は起動した作業ディレクトリ
 * （docs/requirements.md 4.8「鍵」）。
 *
 * 印にパックの名前を混ぜるのは、**キャラクターごとに別のセッションを持つ**ため
 * （docs/design.md 7章）。印の無いセッション（同じディレクトリで使った素の `claude`）も、
 * 別のパックのセッションも、これで外れる。
 *
 * **雑談のときだけ `:chat` を足す**のは、雑談と仕事で claude 側の文脈ごと分けるため
 * （docs/requirements.md 4.9）。
 *
 * **末尾の目印（`@7327` / `@7328` …）は、同じディレクトリで tsukumo を何個も起こしたときに
 * 別々のセッションを持たせるためのもの**（docs/requirements.md 4.8「鍵」）。**目印はビューが
 * 実際に待ち受けているポートの番号そのもの**で、畳まない——セッションを指す ID が
 * 「キャラクターパック × ポート番号」だから。
 *
 * ポートを使うのは、**「その目印がいま使われているか」を知っているものが他に無い**ため。印は
 * transcript に残るだけなので、落ちた tsukumo の印と動いている tsukumo の印は見分けられない
 * （実測。docs/requirements.md 4.8「鍵」）。ポートは OS が握っていて、**既定の
 * ときは塞がっていれば +1 へずれ**（`port-resolution.ts`）、**プロセスが落ちれば空く**ので、
 * 起こし直せば同じ番号＝同じセッションへ戻る。
 *
 * **昔の印（目印の無いもの・1文字の `@A`）も同じセッションを指す**（{@link readSessionMark} が
 * ポートへ戻す）ので、いま続いている仕事のセッションは今までどおり見つかる。
 *
 * **印は会話の内容ではない**ので、claude 自身の transcript に付けても「会話内容の扱い」には
 * 触れない。
 */
export function sessionTag(characterName: string, chat: boolean, viewPort: number): string {
  return `${sessionTagFamily(characterName, chat)}${SESSION_MARK_SEPARATOR}${String(viewPort)}`
}

/**
 * 目印を外した印（`tsukumo:<パック>` / `tsukumo:<パック>:chat`）。**{@link sessionTag} が
 * 目印（ポート番号）を足すための下ごしらえ**で、外へは出さない——画面に出す切り替え先の一覧も
 * 続きから始めるセッションを選ぶのも、目印まで揃えた {@link sessionTag} の値で絞る
 * （`src/server/core/session-restore.ts`）。
 */
function sessionTagFamily(characterName: string, chat: boolean): string {
  const packTag = `${SESSION_TAG_PREFIX}:${characterName}`
  return chat ? `${packTag}:${SESSION_TAG_CHAT_SUFFIX}` : packTag
}

/** 印を読み解いた姿（{@link readSessionMark}）。 */
export type SessionMark = {
  /**
   * 目印（印を付けた tsukumo のビューのポート番号）。**昔の印は既定のポートへ戻してある**
   * （目印が無いもの＝`DEFAULT_VIEW_PORT`、1文字の `A` / `B` / …＝そこから並び順に +1）。
   */
  readonly viewPort: number
  /**
   * 目印まで揃えた印。**続きから始めるセッションを選ぶときも、切り替え先の一覧をいまの部屋に
   * 絞るときも、これ同士を比べる**（`tsukumo:<パック>` と `tsukumo:<パック>@A` と
   * `tsukumo:<パック>@7327` は同じセッションを指す）。
   */
  readonly tag: string
}

/**
 * transcript に付いていた印を読み解く。**tsukumo の印でなければ undefined**（同じディレクトリで
 * 使った素の `claude` のセッションはここで落ちる）。
 *
 * **読めた目印は必ずポート番号に戻し、印も `@<ポート>` の形へ揃えてから返す**ので、昔の印と
 * 今の印が同じセッションを指す:
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

/**
 * 印の末尾を目印として読む。**目印として読めなければ undefined**（パック名に `@` が入っている
 * ときの尻尾がここで落ちる）。
 */
function markedViewPort(mark: string): number | undefined {
  if (SESSION_MARK_PORT.test(mark)) {
    const port = Number(mark)
    return port <= MAX_PORT_NUMBER ? port : undefined
  }

  const legacyIndex = mark.length === 1 ? LEGACY_SESSION_MARK_LETTERS.indexOf(mark) : -1
  return legacyIndex === -1 ? undefined : DEFAULT_VIEW_PORT + legacyIndex
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}
