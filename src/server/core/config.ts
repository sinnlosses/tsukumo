// 環境変数の解釈と、環境変数の名前の一覧。
// 値の意味と既定は各名前の doc コメントが正典で、利用者向けの一覧は `README.md`「環境変数」。
// セッションの印（`sessionTag` / `readSessionMark`）は環境変数ではないので、ここには置かない。

/**
 * ビューを配るポート（既定は `DEFAULT_VIEW_PORT`）。
 * 既定のまま塞がっていれば +1 ずつ20個まで試し、明示したときはずらさない（`resolveViewPort`）。
 */
export const VIEW_PORT_ENV_NAME = "TSUKUMO_VIEW_PORT"
/**
 * `TSUKUMO_VIEW_PORT` が未設定のときに使う既定ポートの起点を差し替える（既定は `DEFAULT_VIEW_PORT`）。
 * 読めない値は無視して既定を使い、`TSUKUMO_VIEW_PORT` と違って起動を止めない。
 * `TSUKUMO_VIEW_PORT` を明示したときは効かない。
 *
 * 実際の既定ポート帯（`DEFAULT_VIEW_PORT`〜+19）はほかの tsukumo が普段使っているので、そこを丸ごと塞いで「全部塞がっている」経路を確かめるテストはそこを使えない。
 * この口で起点をテストごとの私的な帯へ逃がす。
 */
export const VIEW_PORT_FALLBACK_BASE_ENV_NAME = "TSUKUMO_VIEW_PORT_FALLBACK_BASE"
/**
 * キャラクターパック定義ディレクトリのパス（相対は cwd 相対、絶対はそのまま。既定は同梱の `tsukumo-spirit`）。
 * パスとしてだけ解き、パックの名前では指せない（`local` は `<cwd>/local`）。
 * 一覧は同梱・ホーム・起動先の `characters/local` を常に返すので、要るのはその外に置いたときだけ。
 */
export const CHARACTER_ENV_NAME = "TSUKUMO_CHARACTER"
/** 起動時にタブを自動で開くか（`0` のときだけ開かない）。 */
export const OPEN_VIEW_ENV_NAME = "TSUKUMO_OPEN_VIEW"
/** セッションの駆動（`sdk` / `fake`。既定は `sdk`）。 */
export const DRIVER_ENV_NAME = "TSUKUMO_DRIVER"
/** fake driver で、起こした直後に流す場面の名前（疑似セッションの `turns[].name`）。 */
export const FAKE_SCENE_ENV_NAME = "TSUKUMO_FAKE_SCENE"
/** `1` で復元せず新規に起こす（`docs/requirements.md`「逃げ道」）。 */
export const NEW_SESSION_ENV_NAME = "TSUKUMO_NEW_SESSION"
/**
 * `1` で訪問のしきい値を縮める（`QUICK_VISIT_TIMING`）。
 * 疑似セッションや手元で、90 秒待たずに訪問の出入りを確かめるための口。
 */
export const VISIT_QUICK_ENV_NAME = "TSUKUMO_VISIT_QUICK"
/**
 * サーバの時計を凍らせる瞬間（ISO 8601 の瞬間。末尾に `Z` かオフセットが要る）。
 * E2E が走らせるたびに同じ成果物を得るための口で、進まない時計になる。
 */
export const FIXED_CLOCK_ENV_NAME = "TSUKUMO_FIXED_CLOCK"
/**
 * tsukumo が自分の持ち物を置くホームのパス（相対は cwd 相対、絶対はそのまま。`~` は展開しない。既定は `~/.tsukumo`）。
 * 渡すのは tsukumo を2つ並行させる人が明示するときだけで、`TSUKUMO_VIEW_PORT` と揃えて分けないとホームは共有されたまま。
 * 読むのは {@link readConfig} ではなく `tsukumoHomeDir`（配線層から配る道が無い）。
 */
export const HOME_ENV_NAME = "TSUKUMO_HOME"

/**
 * セッションの駆動の種類。
 * `fake` は本物の claude を起こさず、疑似セッションどおりにイベントを流す（`readFakeSession`）。
 */
export type DriverKind = "sdk" | "fake"

export type Config = {
  /** `TSUKUMO_VIEW_PORT` の生の値。既定か明示かの区別とずらす判断は `resolveViewPort` が持つ。 */
  readonly rawViewPort: string | undefined
  /** `TSUKUMO_VIEW_PORT_FALLBACK_BASE` の生の値。読み解くのは `resolveViewPortFallbackBase`。 */
  readonly rawViewPortFallbackBase: string | undefined
  /** キャラクターの指定（未設定なら undefined ＝ 同梱の既定を使う）。 */
  readonly character: string | undefined
  readonly openView: boolean
  readonly driver: DriverKind
  /**
   * fake driver で名指しする場面（未設定なら undefined ＝ 依頼を受けるまで `opening` だけ）。
   * `driver` が `sdk` のときは効かない。
   */
  readonly fakeScene: string | undefined
  readonly newSession: boolean
  readonly quickVisit: boolean
  /** 凍らせる瞬間。未設定・読めない値なら undefined ＝ 本物の時計。 */
  readonly fixedClock: Temporal.Instant | undefined
  /**
   * 起こした環境変数の全部。claude の子プロセスへそのまま引き継ぐためのもので、tsukumo 自身はここから読まない。
   * SDK の `env` は tsukumo 自身の環境と混ぜずに丸ごと置き換えるので、足したい変数（`childProcessEnv` が足すもの）と一緒に渡す必要がある。
   */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
}

/**
 * 環境変数を1回だけ読んで設定にする。不正な値でここでは落とさない。
 * 読めない値は既定へ倒し、ポート番号のように起動を止めるべきものだけを呼び出し側が判断する。
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
    quickVisit: env[VISIT_QUICK_ENV_NAME]?.trim() === "1",
    fixedClock: parseInstant(env[FIXED_CLOCK_ENV_NAME]),
    inheritedEnv: env,
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}

function parseInstant(value: string | undefined): Temporal.Instant | undefined {
  const trimmed = nonEmpty(value)
  if (trimmed === undefined) {
    return undefined
  }
  try {
    return Temporal.Instant.from(trimmed)
  } catch {
    return undefined
  }
}
