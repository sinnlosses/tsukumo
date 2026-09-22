// 環境変数の解釈と、**環境変数の名前の一覧**（docs/coding-standards.md「外の世界に依存する値は
// 読み取りを1モジュールに集約する」。モジュールのトップレベルでは触らず、{@link readConfig} を
// 呼んだときだけ読む）。値を読むのは呼び出し側の src/cli.ts。
//
// 値の意味と既定は docs/design.md 5章「config.ts」の表が正典。
//
// セッションの印（{@link sessionTag} / {@link readSessionMark}）もここに置く。環境変数では
// ないが、**外の世界（claude の transcript）に書かれる値**なので、組み立てと読み取りを
// 1箇所に集める。

import { DEFAULT_VIEW_PORT } from "./port-resolution.ts"

/** ビューを配るポート（既定は src/server/core/port-resolution.ts の `DEFAULT_VIEW_PORT`）。 */
export const VIEW_PORT_ENV_NAME = "TSUKUMO_VIEW_PORT"
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
 * （`tsukumo:<パック>:chat@B` の最後の1文字が目印だと、区切りだけで分かる）。
 */
const SESSION_SLOT_SEPARATOR = "@"
/** 目印に使う文字。**起動の並び順に1つずつ**取る（{@link sessionSlot}）。 */
const SESSION_SLOT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
/** 目印の既定。**目印の無い昔の印はこれとみなす**（{@link readSessionMark}）。 */
const DEFAULT_SESSION_SLOT = "A"

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
 * **末尾の目印（`@A` / `@B` …）は、同じディレクトリで tsukumo を何個も起こしたときに
 * 別々のセッションを持たせるためのもの**（docs/requirements.md 4.8「鍵」）。目印を決めるのは
 * {@link sessionSlot}（ビューのポートの並び順）。**目印の無い昔の印は `@A` とみなす**ので
 * （{@link readSessionMark}）、いま続いている仕事のセッションは1つめの tsukumo から今までどおり
 * 見つかる。
 *
 * **印は会話の内容ではない**ので、claude 自身の transcript に付けても「会話内容の扱い」には
 * 触れない。
 */
export function sessionTag(characterName: string, chat: boolean, viewPort: number): string {
  return `${sessionTagFamily(characterName, chat)}${SESSION_SLOT_SEPARATOR}${sessionSlot(viewPort)}`
}

/**
 * 目印を外した印（`tsukumo:<パック>` / `tsukumo:<パック>:chat`）。**同じパックの、同じモードの
 * セッションの一族**を指す。
 *
 * 使うのは**画面に出す切り替え先の一覧を絞るとき**（`src/server/core/session-restore.ts` の
 * `listMarkedSessions`）。一覧を一族で絞るのは、切り替えてもキャラクターとモードは
 * いま出しているままだから（`docs/requirements.md` 4.8）——別のパックのセッションを混ぜると、
 * 選んだ瞬間に会話の相手だけが入れ替わる。
 */
export function sessionTagFamily(characterName: string, chat: boolean): string {
  const packTag = `${SESSION_TAG_PREFIX}:${characterName}`
  return chat ? `${packTag}:${SESSION_TAG_CHAT_SUFFIX}` : packTag
}

/** 印を読み解いた姿（{@link readSessionMark}）。 */
export type SessionMark = {
  /** 目印（`A` / `B` / …）。**目印の無い昔の印は `A`**。 */
  readonly slot: string
  /**
   * 目印まで揃えた印。**選ぶときはこれ同士を比べる**（`tsukumo:<パック>` と
   * `tsukumo:<パック>@A` は同じセッションを指す）。
   */
  readonly tag: string
  /**
   * 目印を外した印（{@link sessionTagFamily} が組み立てるのと同じ形）。**一覧を一族で絞るときに
   * これ同士を比べる**ので、印の文字列を切り分けるのはここだけで済む。
   */
  readonly family: string
}

/**
 * transcript に付いていた印を読み解く。**tsukumo の印でなければ undefined**（同じディレクトリで
 * 使った素の `claude` のセッションはここで落ちる）。
 *
 * **末尾が `@` + 目印の1文字でないものは、目印の無い昔の印として `A` に畳む**
 * （`tsukumo:<パック>` は `tsukumo:<パック>@A` と同じ。名前に `@` を含むパックも、
 * {@link sessionTag} が付ける形と同じに揃う）。
 */
export function readSessionMark(tag: string): SessionMark | undefined {
  if (!tag.startsWith(`${SESSION_TAG_PREFIX}:`)) {
    return undefined
  }

  const separator = tag.lastIndexOf(SESSION_SLOT_SEPARATOR)
  const slot = tag.slice(separator + 1)
  return slot.length === 1 && SESSION_SLOT_LETTERS.includes(slot)
    ? { slot, tag, family: tag.slice(0, separator) }
    : {
        slot: DEFAULT_SESSION_SLOT,
        tag: `${tag}${SESSION_SLOT_SEPARATOR}${DEFAULT_SESSION_SLOT}`,
        family: tag,
      }
}

/**
 * このプロセスの目印を決める。**ビューのポートの並び順**（既定の `DEFAULT_VIEW_PORT` が `A`、
 * +1 ごとに次の文字）で、範囲の外へ出た番号は `A` に畳む。
 *
 * ポートを使うのは、**「その目印が使用中か」を知っているものが他に無い**ため。印は
 * transcript に残るだけなので、落ちた tsukumo の印と動いている tsukumo の印は見分けられない
 * （2026-09-22 実測。docs/requirements.md 4.8「鍵」）。ポートは OS が握っていて、**既定の
 * ときは塞がっていれば +1 へずれ**（`port-resolution.ts`）、**プロセスが落ちれば空く**ので、
 * 「いま生きている tsukumo の起動順」がそのまま出る。
 *
 * 明示指定（`TSUKUMO_VIEW_PORT`）でも同じ式で決まるので、ポートをずらして2つ起こせば目印も
 * 分かれる。既定から遠い番号・`0`（OS まかせ）は `A` になる。
 */
function sessionSlot(viewPort: number): string {
  const index = viewPort - DEFAULT_VIEW_PORT
  return Number.isInteger(index) && index >= 0 && index < SESSION_SLOT_LETTERS.length
    ? SESSION_SLOT_LETTERS.charAt(index)
    : DEFAULT_SESSION_SLOT
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}
