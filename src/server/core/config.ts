// 環境変数の解釈と、環境変数の名前の一覧（docs/coding-standards.md「外部の入力を読む場所を
// 1つにする」。モジュールのトップレベルでは触らず、{@link readConfig} を
// 呼んだときだけ読む）。値を読むのは呼び出し側の src/cli.ts。
//
// 値の意味と既定は docs/design.md 5章「config.ts」の表が正典。
//
// セッションの印（`sessionTag` / `readSessionMark`）は環境変数ではないので、目印を読み書きする
// 持ち主 `src/server/session-driver/core/session-restore.ts` に置く（続きから始めるセッションを選ぶ計算と
// 同じ場所）。

/** ビューを配るポート（既定は src/server/view-server/core/port-resolution.ts の `DEFAULT_VIEW_PORT`）。 */
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
 * `1` で訪問のしきい値を縮める（`src/server/visit/core/visit-timing.ts` の `QUICK_VISIT_TIMING`）。
 * 疑似セッションや手元で、90 秒待たずに訪問の出入りを確かめるための口。
 */
export const VISIT_QUICK_ENV_NAME = "TSUKUMO_VISIT_QUICK"
/**
 * サーバの時計を凍らせる瞬間（ISO 8601 の瞬間。末尾に `Z` かオフセットが要る）。E2E が走らせる
 * たびに同じ成果物を得るための口（`docs/design.md` 10章「E2E の成果物と再現」）。進まない
 * 時計になる。読むのは {@link readConfig} で、時計を作るのは src/server/adapter/local-time.ts。
 */
export const FIXED_CLOCK_ENV_NAME = "TSUKUMO_FIXED_CLOCK"
/**
 * tsukumo が自分の持ち物を置くホームのパス（相対は cwd 相対、絶対はそのまま）。名前はここに
 * 置くが、読むのは {@link readConfig} ではなく src/server/adapter/tsukumo-home.ts（理由は
 * そのファイルの冒頭。配線層から配る道が無い）。
 */
export const HOME_ENV_NAME = "TSUKUMO_HOME"

/**
 * セッションの駆動の種類。`fake` は本物の claude を起こさず、疑似セッションどおりにイベントを
 * 流す（src/server/session-driver/adapter/fake-driver.ts）。目視確認・Playwright 用（docs/design.md 10章）。
 */
export type DriverKind = "sdk" | "fake"

export type Config = {
  /**
   * `TSUKUMO_VIEW_PORT` の生の値。ここでは数として解釈しない（既定か明示かの区別と
   * ずらす判断は src/server/view-server/core/port-resolution.ts が持つ）。
   */
  readonly rawViewPort: string | undefined
  /**
   * `TSUKUMO_VIEW_PORT_FALLBACK_BASE` の生の値。ここでは数として解釈しない
   * （{@link resolveViewPortFallbackBase} が読み解く）。
   */
  readonly rawViewPortFallbackBase: string | undefined
  /** キャラクターの指定（未設定なら undefined ＝ 同梱の既定を使う）。 */
  readonly character: string | undefined
  readonly openView: boolean
  readonly driver: DriverKind
  /**
   * fake driver で名指しする場面（未設定なら undefined ＝ 依頼を受けるまで `opening` だけ）。
   * 依頼を送らずに特定の画面を出すための口で、状態のカタログを撮るときに使う
   * （`docs/architecture.md`「手で確かめること」）。`driver` が `sdk` のときは効かない。
   */
  readonly fakeScene: string | undefined
  readonly newSession: boolean
  /**
   * `src/browser/` を見張って組み立て直すか。既定は見張らない。 `tsukumo` は `bun link` で
   * リポジトリを指しているので普段使いと開発が同じ経路になり、常に入れると仕事中の保存で
   * ページが読み込み直されうる（docs/design.md 11章）。
   */
  readonly watchUi: boolean
  /** 訪問のしきい値を縮めるか（{@link VISIT_QUICK_ENV_NAME}。既定は縮めない）。 */
  readonly quickVisit: boolean
  /**
   * 凍らせる瞬間（{@link FIXED_CLOCK_ENV_NAME}）。未設定・読めない値なら undefined ＝ 本物の時計。
   */
  readonly fixedClock: Temporal.Instant | undefined
  /**
   * 起こした環境変数の全部。claude の子プロセスへそのまま引き継ぐためのもので、tsukumo 自身は
   * ここから読まない（読むのは上の各フィールド）。SDK の `env` は tsukumo 自身の環境と混ぜずに丸ごと
   * 置き換えるので、足したい変数（`src/server/session-driver/core/visible-output-nudge.ts`）と一緒に渡す必要が
   * あり、環境変数を読む場所（`src/cli.ts`）を増やさずに済ませるためにここで運ぶ。
   */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
}

/**
 * 環境変数を1回だけ読んで設定にする。不正な値でここでは落とさない（読めない値は既定へ
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
