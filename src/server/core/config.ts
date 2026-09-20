// 環境変数の読み取り。**`process.env` を読むのはここ1箇所**（docs/coding-standards.md
// 「外の世界に依存する値は読み取りを1モジュールに集約する」。モジュールのトップレベルでは
// 触らず、{@link readConfig} を呼んだときだけ読む）。
//
// 値の意味と既定は docs/design.md 5章「config.ts」の表が正典。

/** ビューを配るポート（既定は src/server/core/port-resolution.ts の `DEFAULT_VIEW_PORT`）。 */
export const VIEW_PORT_ENV_NAME = "TSUKUMO_VIEW_PORT"
/** キャラクターパックの名前（`characters/<name>`）または絶対パス。 */
export const CHARACTER_ENV_NAME = "TSUKUMO_CHARACTER"
/** 起動時にタブを自動で開くか（`0` のときだけ開かない）。 */
export const OPEN_VIEW_ENV_NAME = "TSUKUMO_OPEN_VIEW"
/** セッションの駆動（`sdk` / `fake`）。 */
export const DRIVER_ENV_NAME = "TSUKUMO_DRIVER"
/** 偽の駆動で、起こした直後に流す場面の名前（台本の `turns[].name`）。 */
export const FAKE_SCENE_ENV_NAME = "TSUKUMO_FAKE_SCENE"
/** `1` で復元せず新規に起こす（docs/requirements.md 4.8 の「逃げ道」）。 */
export const NEW_SESSION_ENV_NAME = "TSUKUMO_NEW_SESSION"
/** `1` で `src/browser/` を見張り、変更のたびに組み立て直す（開発中だけ。docs/design.md 11章）。 */
export const WATCH_UI_ENV_NAME = "TSUKUMO_WATCH_UI"

/** セッションの印の前置き。**組み立ては {@link sessionTag} だけ**（文字列を他所で作らない）。 */
const SESSION_TAG_PREFIX = "tsukumo"

/**
 * セッションの駆動の種類。`fake` は**本物の claude を起こさず**、台本どおりにイベントを流す
 * （src/server/adapter/fake-driver.ts）。目視確認・Playwright 用（docs/design.md 10章）。
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
   * 偽の駆動で名指しする場面（未設定なら undefined ＝ 依頼を受けるまで `opening` だけ）。
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
 * キャラクターパック1つぶんのセッションの印（SDK の `tagSession`）。**続きから始めるセッションを
 * 選ぶ鍵の片方**で、もう片方は起動した作業ディレクトリ（docs/requirements.md 4.8「鍵」）。
 *
 * 印にパックの名前を混ぜるのは、**キャラクターごとに別のセッションを持つ**ため
 * （docs/design.md 7章）。印の無いセッション（同じディレクトリで使った素の `claude`）も、
 * 別のパックのセッションも、これで外れる。
 *
 * **印は会話の内容ではない**ので、claude 自身の transcript に付けても「会話内容の扱い」には
 * 触れない。環境変数ではないが、**外の世界（transcript）に書かれる値**なので、組み立てを
 * 集約するこのモジュールに置く（docs/coding-standards.md「外部の入力を読む場所を1つにする」）。
 */
export function sessionTag(characterName: string): string {
  return `${SESSION_TAG_PREFIX}:${characterName}`
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}
