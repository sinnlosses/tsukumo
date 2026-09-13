// 環境変数の読み取り。**`process.env` を読むのはここ1箇所**（docs/coding-standards.md
// 「外の世界に依存する値は読み取りを1モジュールに集約する」。モジュールのトップレベルでは
// 触らず、{@link readConfig} を呼んだときだけ読む）。
//
// 値の意味と既定は docs/design.md 5章「config.ts」の表が正典。

/** ビューを配るポート（既定は src/core/port-resolution.ts の `DEFAULT_VIEW_PORT`）。 */
export const VIEW_PORT_ENV_NAME = "TSUKUMO_VIEW_PORT"
/** キャラクターパックの名前（`characters/<name>`）または絶対パス。 */
export const CHARACTER_ENV_NAME = "TSUKUMO_CHARACTER"
/** 起動時にタブを自動で開くか（`0` のときだけ開かない）。 */
export const OPEN_VIEW_ENV_NAME = "TSUKUMO_OPEN_VIEW"
/** セッションの駆動（`sdk` / `fake`）。 */
export const DRIVER_ENV_NAME = "TSUKUMO_DRIVER"
/** `1` で復元せず新規に起こす（docs/requirements.md 4.8 の「逃げ道」）。 */
export const NEW_SESSION_ENV_NAME = "TSUKUMO_NEW_SESSION"

/**
 * tsukumo が起こしたセッションに付ける印（SDK の `tagSession`）。**続きから始めるセッションを
 * 選ぶ鍵の片方**で、もう片方は起動した作業ディレクトリ（docs/requirements.md 4.8「鍵」）。
 * 印が無いセッション（同じディレクトリで使った素の `claude`）は拾わない。
 *
 * **印は会話の内容ではない**ので、claude 自身の transcript に付けても「会話内容の扱い」には
 * 触れない。環境変数ではないが、**外の世界（transcript）に書かれる値**なので、読み取りを
 * 集約するこのモジュールに置く（docs/coding-standards.md「外部の入力を読む場所を1つにする」）。
 */
export const SESSION_TAG = "tsukumo"

/**
 * セッションの駆動の種類。`fake` は**本物の claude を起こさず**、台本どおりにイベントを流す
 * （src/core/fake-driver.ts）。目視確認・Playwright 用（docs/design.md 10章）。
 */
export type DriverKind = "sdk" | "fake"

export type Config = {
  /**
   * `TSUKUMO_VIEW_PORT` の生の値。**ここでは数として解釈しない**（既定か明示かの区別と
   * ずらす判断は src/core/port-resolution.ts が持つ）。
   */
  readonly rawViewPort: string | undefined
  /** キャラクターの指定（未設定なら undefined ＝ 同梱の既定を使う）。 */
  readonly character: string | undefined
  readonly openView: boolean
  readonly driver: DriverKind
  readonly newSession: boolean
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
    newSession: env[NEW_SESSION_ENV_NAME]?.trim() === "1",
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}
