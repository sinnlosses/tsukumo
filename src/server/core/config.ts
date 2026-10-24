// 環境変数の解釈と、環境変数の名前の表。
// 値の意味と既定は各名前の doc コメントが正典で、利用者向けの一覧は `docs/readme/configuration.md`「環境変数」。
// セッションの印（`sessionTag` / `readSessionMark`）は環境変数ではないので、ここには置かない。

import type { ReportSchemaVariant } from "../../shared/report/schema-variant.ts"

/**
 * tsukumo が読む環境変数の名前の全部。`audience` が `user` の名前は `docs/readme/configuration.md` に載せる。
 * `test` はテスト・撮影・試し用の口。
 */
export const ENV_NAMES = {
  /**
   * ビューを配るポート（既定は `DEFAULT_VIEW_PORT`）。
   * 既定のまま塞がっていれば +1 ずつ20個まで試し、明示したときはずらさない（`resolveViewPort`）。
   */
  viewPort: { name: "TSUKUMO_VIEW_PORT", audience: "user" },
  /**
   * `TSUKUMO_VIEW_PORT` が未設定のときに使う既定ポートの起点を差し替える（既定は `DEFAULT_VIEW_PORT`）。
   * 読めない値は無視して既定を使い、`TSUKUMO_VIEW_PORT` と違って起動を止めない。
   * `TSUKUMO_VIEW_PORT` を明示したときは効かない。
   *
   * 実際の既定ポート帯（`DEFAULT_VIEW_PORT`〜+19）はほかの tsukumo が普段使っているので、そこを丸ごと塞いで「全部塞がっている」経路を確かめるテストはそこを使えない。
   * この口で起点をテストごとの私的な帯へ逃がす。
   */
  viewPortFallbackBase: { name: "TSUKUMO_VIEW_PORT_FALLBACK_BASE", audience: "test" },
  /**
   * キャラクターパック定義ディレクトリのパス（相対は cwd 相対、絶対はそのまま。既定は同梱の `tsukumo-spirit`）。
   * パスとしてだけ解き、パックの名前では指せない（`local` は `<cwd>/local`）。
   * 一覧は同梱・ホーム・起動先の `characters/local` を常に返すので、要るのはその外に置いたときだけ。
   */
  character: { name: "TSUKUMO_CHARACTER", audience: "user" },
  /** 起動時にタブを自動で開くか（`0` のときだけ開かない）。 */
  openView: { name: "TSUKUMO_OPEN_VIEW", audience: "user" },
  /** セッションドライバ（`sdk` / `fake`。既定は `sdk`）。 */
  driver: { name: "TSUKUMO_DRIVER", audience: "user" },
  /** ビューとファイルを開くホスト（`orca` / `browser` / `none`。未設定・知らない値は Orca の中なら `orca`、外なら `browser`）。 */
  host: { name: "TSUKUMO_HOST", audience: "user" },
  /** fake driver で、起こした直後に流す場面の名前（疑似セッションの `turns[].name`）。 */
  fakeScene: { name: "TSUKUMO_FAKE_SCENE", audience: "test" },
  /** fake driver で、名指しした場面の手を先頭から何個まで流すか（正の整数）。 */
  fakeSceneUntil: { name: "TSUKUMO_FAKE_SCENE_UNTIL", audience: "test" },
  /**
   * fake driver が読む疑似セッションのファイルのパス（相対は cwd 相対。既定は同梱の `test/fixture/fake-session.json`）。
   * 読ませるのは架空の会話だけで、利用者と Claude の実物の会話（transcript・SDK のイベント）を渡さない。
   */
  fakeSession: { name: "TSUKUMO_FAKE_SESSION", audience: "test" },
  /**
   * ワークフローの設定を読み書きするときに呼ぶ `tw` のパス（既定は取り込みの `bin/tw`。取り込みを載せないときは PATH の `tw`）。
   * 疑似セッションの撮影や自動テストで、取り込みを書き換えずに偽の `tw` へ差し替える口。
   */
  tw: { name: "TSUKUMO_TW", audience: "test" },
  /**
   * サーバの時計を凍らせる瞬間（ISO 8601 の瞬間。末尾に `Z` かオフセットが要る）。
   * E2E が走らせるたびに同じ成果物を得るための口で、進まない時計になる。
   */
  fixedClock: { name: "TSUKUMO_FIXED_CLOCK", audience: "test" },
  /**
   * tsukumo が自分の持ち物を置くホームのパス（相対は cwd 相対、絶対はそのまま。`~` は展開しない。既定は `~/.tsukumo`）。
   * 渡すのは tsukumo を2つ並行させる人が明示するときだけで、`TSUKUMO_VIEW_PORT` と揃えて分けないとホームは共有されたまま。
   * 読むのは {@link readConfig} ではなく `tsukumoHomeDir`（配線層から配る道が無い）。
   */
  home: { name: "TSUKUMO_HOME", audience: "user" },
  /**
   * `report` の塊の型の渡し方（`json-schema` / `short-type`。既定は `json-schema`）。
   * `short-type` のときだけ短い型の表記で渡す試しの版になり、ほかの値は既定に倒す。
   */
  reportSchema: { name: "TSUKUMO_REPORT_SCHEMA", audience: "test" },
} as const satisfies Record<string, { name: string; audience: "user" | "test" }>

/** Orca のターミナルが付ける環境変数。この値が {@link ORCA_TERM_PROGRAM} なら Orca の中。 */
const TERM_PROGRAM_ENV_NAME = "TERM_PROGRAM"
const ORCA_TERM_PROGRAM = "Orca"
/**
 * Claude Code の設定ディレクトリ（Claude Code の変数で、tsukumo 用ではない）。
 * 未設定・空は `~`。相対は cwd 相対、`~` は展開しない（`TSUKUMO_HOME` と同じ）。
 */
const CLAUDE_CONFIG_DIR_ENV_NAME = "CLAUDE_CONFIG_DIR"

/**
 * セッションドライバの種類。
 * `fake` は本物の claude を起こさず、疑似セッションどおりにイベントを流す（`readFakeSession`）。
 */
export type ConfigDriver =
  | { readonly kind: "sdk" }
  | {
      readonly kind: "fake"
      /** 疑似セッションのファイルのパス。未設定・空なら undefined ＝ 同梱のファイル。 */
      readonly sessionPath: string | undefined
      /** 名指しする場面。未設定なら undefined ＝ 依頼を受けるまで `opening` だけ。 */
      readonly scene: string | undefined
      /** `scene` の手を流す個数の上限。未設定・正の整数でない値なら undefined ＝ 全部流す。 */
      readonly sceneUntil: number | undefined
    }

/**
 * ビューとファイルを開くホストの種類。
 * `browser` は macOS の既定のブラウザ・アプリで開く。
 * `none` は何も開かない（URL は起動時に出るので手で開く）。
 */
export type HostKind = "orca" | "browser" | "none"

export type Config = {
  /** `TSUKUMO_VIEW_PORT` の生の値。既定か明示かの区別とずらす判断は `resolveViewPort` が持つ。 */
  readonly rawViewPort: string | undefined
  /** `TSUKUMO_VIEW_PORT_FALLBACK_BASE` の生の値。読み解くのは `resolveViewPortFallbackBase`。 */
  readonly rawViewPortFallbackBase: string | undefined
  /** キャラクターの指定（未設定なら undefined ＝ 同梱の既定を使う）。 */
  readonly character: string | undefined
  readonly openView: boolean
  readonly driver: ConfigDriver
  readonly host: HostKind
  /** `TSUKUMO_TW` の値（未設定・空なら undefined ＝ 既定の `tw`）。 */
  readonly twCommand: string | undefined
  /** `CLAUDE_CONFIG_DIR` の値（未設定・空なら undefined ＝ `~`）。 */
  readonly claudeConfigDir: string | undefined
  /** 凍らせる瞬間。未設定・読めない値なら undefined ＝ 本物の時計。 */
  readonly fixedClock: Temporal.Instant | undefined
  readonly reportSchema: ReportSchemaVariant
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
  const driver: ConfigDriver =
    env[ENV_NAMES.driver.name]?.trim() === "fake"
      ? {
          kind: "fake",
          sessionPath: nonEmpty(env[ENV_NAMES.fakeSession.name]),
          scene: nonEmpty(env[ENV_NAMES.fakeScene.name]),
          sceneUntil: parsePositiveInteger(env[ENV_NAMES.fakeSceneUntil.name]),
        }
      : { kind: "sdk" }
  return {
    rawViewPort: env[ENV_NAMES.viewPort.name],
    rawViewPortFallbackBase: env[ENV_NAMES.viewPortFallbackBase.name],
    character: nonEmpty(env[ENV_NAMES.character.name]),
    openView: env[ENV_NAMES.openView.name]?.trim() !== "0",
    driver,
    host: readHost(env),
    twCommand: nonEmpty(env[ENV_NAMES.tw.name]),
    claudeConfigDir: nonEmpty(env[CLAUDE_CONFIG_DIR_ENV_NAME]),
    fixedClock: parseInstant(env[ENV_NAMES.fixedClock.name]),
    reportSchema:
      env[ENV_NAMES.reportSchema.name]?.trim() === "short-type" ? "short-type" : "json-schema",
    inheritedEnv: env,
  }
}

function readHost(env: Readonly<Record<string, string | undefined>>): HostKind {
  const value = env[ENV_NAMES.host.name]?.trim()
  if (value === "orca" || value === "browser" || value === "none") {
    return value
  }

  return env[TERM_PROGRAM_ENV_NAME]?.trim() === ORCA_TERM_PROGRAM ? "orca" : "browser"
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const trimmed = nonEmpty(value)
  if (trimmed === undefined || !/^\d+$/.test(trimmed)) {
    return undefined
  }
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
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
