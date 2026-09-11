// tsukumo のエントリポイント。Agent SDK で Claude Code のセッションを起こし、届いたイベントを
// HTML のビューに変えて、ローカルの HTTP サーバから配り続ける。
//
// ここは「配線」の層。引数・環境変数の受け取り、起動時の前提チェック、状態を1つ持つこと、
// 1回分の `try`/`catch` がここの仕事で、判断そのものは持たない。

import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import {
  availableExpressions,
  type CharacterDefinition,
  classifyPortraitFile,
  isPlausibleSvgMarkup,
  parseCharacterDefinition,
  rasterMimeType,
  resolveOutfitAccent,
  resolvePortraitFile,
} from "./character.ts"
import { type Expression, expressionLabel, type Outfit, resolveOutfit } from "./expression.ts"
import { type Host } from "./host.ts"
import { createOrcaHost } from "./orca-host.ts"
import { DEFAULT_PERMISSION_MODE, type SessionDriver, startSession } from "./session-driver.ts"
import { type SessionEvent } from "./session-event.ts"
import {
  applySessionEvent,
  currentExpression,
  INITIAL_SESSION_VIEW,
  mainViewEntries,
  recentToolNames,
  type SessionView,
} from "./session-view.ts"
import { type TaskStatusCounts, countTaskStatuses } from "./tasks.ts"
import { startViewServer, type ViewServer } from "./view-server.ts"
import {
  buildCharacterBody,
  buildMainBody,
  buildSidebarBody,
  type CharacterPortraitSource,
  type CharacterViewData,
  type SidebarData,
  VIEW_NAMES,
} from "./view.ts"

// ビューを配るポート。固定にしてあるのは、開き直したブラウザタブが同じ URL のまま使えるように
// するため（docs/architecture.md「HTML はローカルの HTTP サーバから配る」）。
const DEFAULT_VIEW_PORT = 7327
const VIEW_PORT_ENV_NAME = "TSUKUMO_VIEW_PORT"
// 起動時にレイアウトページのタブを自動で開くかどうか。既定は開く（コマンド1つで完成させるため）。
const OPEN_VIEW_ENV_NAME = "TSUKUMO_OPEN_VIEW"

const USAGE = `tsukumo — キャラクターと一緒に仕事をするためのターミナル環境

使い方:
  bun run start

起動すると Claude Code のセッションが立ち上がり、ビューの配信とレイアウトページのタブを
開くところまで1コマンドで進む。**セッションは毎回新規**で、再開はしない。

環境変数:
  TSUKUMO_VIEW_PORT       ビューを配るポート（既定 ${String(DEFAULT_VIEW_PORT)}。0 を渡すと空きポートを使う）
  TSUKUMO_CHARACTER_DIR   キャラクター定義ディレクトリ（既定は characters/tsukumo-spirit。
                          自分の素材を使うときは characters/local などを指す。cwd 相対にも対応）
  TSUKUMO_OPEN_VIEW       起動時にタブを自動で開くか（既定は開く。0 を渡すと開かない）
`

// ビューを配り直す間隔。本文はトークン単位で流れてくるので、断片1つごとに全ビューを組み直すと
// 無駄が大きい。まとめて配ることで転送量を抑える（反映の遅延目安は1秒以内。
// docs/requirements.md「5. 実行環境・非機能要件」）。
const PUBLISH_INTERVAL_MS = 100

// develop/tasks.json は起動時の cwd（リポジトリ直下で `bun run start` する運用）からの相対で読む。
// セッションに依存しない、tsukumo 自身の進捗管理ファイルのため。
const TASKS_FILE_RELATIVE_PATH: readonly string[] = ["develop", "tasks.json"]

// キャラクター定義ディレクトリの既定値。自作で権利がクリーンな tsukumo-spirit を使う
// （docs/requirements.md 4.4）。develop/tasks.json と同じく cwd 相対で読む。
const DEFAULT_CHARACTER_DIR_RELATIVE_PATH: readonly string[] = ["characters", "tsukumo-spirit"]
// 利用者が用意した素材（`characters/local/` など。characters/README.md）を使いたいときに
// 直接指すための環境変数。
const CHARACTER_DIR_ENV_NAME = "TSUKUMO_CHARACTER_DIR"
const CHARACTER_DEFINITION_FILE_NAME = "character.json"
// character.json が無い・壊れている、または name が無いときの立ち絵 alt テキストの既定名。
const DEFAULT_CHARACTER_ALT_NAME = "キャラクター"

/**
 * 終了コードを返す。0 のときはビューサーバとセッションを残したままプロセスを生かし続けるので、
 * 呼び出し側は 0 以外のときだけ `process.exit` する。
 */
async function main(args: readonly string[]): Promise<number> {
  if (args.includes("--help")) {
    process.stdout.write(USAGE)
    return 0
  }

  // 起動時に前提（ポートが空いている）が満たされていないときだけ即時終了する
  // （docs/coding-standards.md「エラーハンドリング」）。
  const port = resolveViewPort(process.env[VIEW_PORT_ENV_NAME])
  if (port === undefined) {
    process.stderr.write(`tsukumo: ${VIEW_PORT_ENV_NAME} がポート番号として読めない\n`)
    return 1
  }

  const host = createOrcaHost()

  // ビューサーバとセッションは互いを必要とする（サーバは依頼をセッションへ渡し、セッションは
  // 配るためにサーバを要る）。**先に立てるのはサーバ**にして、セッションはあとから入る形にした。
  // 起動直後の依頼は受け取れずに 503 で返るだけで、どちらかが欠けて黙って落ちることがない。
  let driver: SessionDriver | undefined = undefined
  const server = await startViewServer(
    port,
    host,
    (text) => {
      if (driver === undefined) {
        return false
      }
      driver.prompt(text)
      return true
    },
    () => (driver === undefined ? Promise.resolve() : driver.interrupt()),
  ).catch((error: unknown) => {
    process.stderr.write(`tsukumo: ビューを配れない: ${describeError(error)}\n`)
    return undefined
  })
  if (server === undefined) {
    return 1
  }

  const characterDir = resolveCharacterDir(process.env[CHARACTER_DIR_ENV_NAME], process.cwd())
  const publish = throttle(createViewPublisher(server, characterDir), PUBLISH_INTERVAL_MS)
  publish(INITIAL_SESSION_VIEW)

  driver = startSession({
    cwd: process.cwd(),
    expressions: availableExpressions(readCharacterDefinition(characterDir)),
    permissionMode: DEFAULT_PERMISSION_MODE,
    onEvent: createEventSink(publish, server.publishTurnStatus),
  })
  stopSessionOnExit(driver)
  announce(server)

  if (resolveOpenView(process.env[OPEN_VIEW_ENV_NAME])) {
    await openLayoutView(host, server)
  }

  return 0
}

/**
 * イベントを受けて姿を更新し、配る係を呼ぶ。**セッションの姿を持つのはここ1箇所だけ**
 * （畳み込みそのものは純粋関数。src/session-view.ts）。
 *
 * **`turnInProgress` が変わったときだけ `publishTurnStatus` を呼ぶ。** 書きかけの本文は
 * トークン単位で届くため、変わっていないのに毎回押すと入力欄の SSE だけ無駄に流れてしまう。
 */
function createEventSink(
  publish: (view: SessionView) => void,
  publishTurnStatus: (inProgress: boolean) => void,
): (event: SessionEvent) => void {
  let view = INITIAL_SESSION_VIEW

  return (event) => {
    const next = applySessionEvent(view, event)
    if (next.turnInProgress !== view.turnInProgress) {
      publishTurnStatus(next.turnInProgress)
    }
    view = next
    if (event.kind === "session-ended") {
      process.stderr.write(`tsukumo: セッションが終わった: ${event.reason}\n`)
    }
    publish(view)
  }
}

/**
 * ビューを配る係を作る。**「決める → 配る」1回分をまるごと包む唯一の場所**で、ここでの失敗は
 * 次の更新に任せて諦める（docs/coding-standards.md「エラーハンドリング」— 描画ループの中に
 * `try`/`catch` を散らさない）。
 */
function createViewPublisher(
  server: ViewServer,
  characterDir: string,
): (view: SessionView) => void {
  return (view) => {
    try {
      const data: CharacterViewData = {
        // 直近のセリフを1つのまとまりとして出す（docs/requirements.md 4.2「続けて並べた行は
        // 1つのまとまり」）。`buildCharacterBody` は1つの文字列しか受け取らないので改行で連結する。
        speech: view.speeches.length === 0 ? undefined : view.speeches.join("\n"),
        ...readCharacterAssets(characterDir, currentExpression(view), resolveOutfit(view.model)),
      }
      server.publish("character", buildCharacterBody(data))
      server.publish("main", buildMainBody(mainViewEntries(view)))
      server.publish("sidebar", buildSidebarBody(sidebarData(view)))
    } catch {
      process.stderr.write("tsukumo: ビューの更新に失敗した。次の更新を待つ\n")
    }
  }
}

/**
 * サイドバーに出す値。**いま何をしているかは実行中・直近のツール名だけ**にとどめる
 * （引数と結果は会話の内容なので出さない。docs/coding-standards.md「会話内容の扱い」）。
 * 区画そのものの作り直しは後続タスクなので、いまは既存の部品にツール名を流し込んでいる。
 */
function sidebarData(view: SessionView): SidebarData {
  return {
    contextTokens: undefined,
    subagents: {
      pendingCount: undefined,
      recentActivity: recentToolNames(view).map((name) => ({
        description: undefined,
        model: undefined,
        latestToolName: name,
      })),
    },
    taskCounts: readTaskCounts(),
  }
}

/**
 * 呼び出しをまとめる。**最後の1回は必ず配る**（間隔の終わりに、そのとき最新の姿を配る）ので、
 * 流れが止まったあとに古い画面が残ることがない。
 */
function throttle(
  publish: (view: SessionView) => void,
  intervalMs: number,
): (view: SessionView) => void {
  let latest: SessionView | undefined = undefined
  let timer: ReturnType<typeof setTimeout> | undefined = undefined

  return (view) => {
    latest = view
    if (timer !== undefined) {
      return
    }

    timer = setTimeout(() => {
      timer = undefined
      const pending = latest
      latest = undefined
      if (pending !== undefined) {
        publish(pending)
      }
    }, intervalMs)
  }
}

/**
 * プロセスが終わるときにセッションを閉じる。**閉じないと claude の子プロセスが残る**ので、
 * 割り込み（Ctrl-C）と終了要求の両方で入力を閉じてから抜ける。
 */
function stopSessionOnExit(driver: SessionDriver): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      driver.close()
      process.exit(0)
    })
  }
}

/**
 * レイアウトページのタブを開く。**失敗しても起動は続ける**（`orca` が無い環境では
 * `host.showView` が失敗を返すだけで例外は投げない。docs/coding-standards.md
 * 「エラーハンドリング」— 常駐プロセスは描画1回の失敗で落ちない）。
 */
async function openLayoutView(host: Host, server: ViewServer): Promise<void> {
  const result = await host.showView(server.layoutUrl)
  if (!result.ok) {
    process.stderr.write(`tsukumo: ビューのタブを開けなかった: ${result.reason}\n`)
  }
}

/**
 * キャラクター定義ディレクトリを決める。**環境変数が読み取りの唯一の場所**
 * （docs/coding-standards.md「外部の入力を読む場所を1つにする」）。空でなければそれを cwd 相対
 * （絶対パスならそのまま）で解決し、無ければ既定の tsukumo-spirit を使う。
 */
function resolveCharacterDir(envValue: string | undefined, cwd: string): string {
  const trimmed = envValue?.trim()
  if (trimmed !== undefined && trimmed !== "") {
    return resolve(cwd, trimmed)
  }

  return join(cwd, ...DEFAULT_CHARACTER_DIR_RELATIVE_PATH)
}

/**
 * 起動時にレイアウトページのタブを自動で開くかどうかを決める。**環境変数が読み取りの唯一の場所**
 * （docs/coding-standards.md「外部の入力を読む場所を1つにする」）。"0" のときだけ開かない
 * （ポート番号のような不正値の弾き方は不要で、それ以外の値はすべて「開く」に倒す）。
 */
function resolveOpenView(rawValue: string | undefined): boolean {
  return rawValue?.trim() !== "0"
}

/** 環境変数のポート番号を読む。読めない値のときは undefined を返し、既定にも落とさない。 */
function resolveViewPort(rawPort: string | undefined): number | undefined {
  const trimmed = rawPort?.trim()
  if (trimmed === undefined || trimmed === "") {
    return DEFAULT_VIEW_PORT
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    return undefined
  }

  return parsed
}

/**
 * キャラクター定義（character.json）を読む。無い・壊れているときは undefined を返し、
 * 呼び出し側は立ち絵なし・表情は `default` だけにフォールバックする。
 */
function readCharacterDefinition(characterDir: string): CharacterDefinition | undefined {
  const content = readOptionalFile(join(characterDir, CHARACTER_DEFINITION_FILE_NAME))
  return content === undefined ? undefined : parseCharacterDefinition(content)
}

/**
 * キャラクター定義と立ち絵を読み、キャラビューに渡せる形にする。character.json が無い・
 * 壊れている、表情に対応する立ち絵が無い、画像ファイル自体が読めない・種類を判定できない、
 * といったときはすべて `portrait: undefined` に落ちて、呼び出し側（buildCharacterBody）が
 * 吹き出しだけの表示にフォールバックする（docs/requirements.md 4.2「フォールバック」）。
 */
function readCharacterAssets(
  characterDir: string,
  expression: Expression,
  outfit: Outfit,
): Omit<CharacterViewData, "speech"> {
  const definition = readCharacterDefinition(characterDir)

  if (definition === undefined) {
    return {
      portrait: undefined,
      outfitAccent: undefined,
      altText: characterAltText(undefined, expression),
    }
  }

  const outfitAccent = resolveOutfitAccent(definition, outfit)
  const portraitFile = resolvePortraitFile(definition, expression)
  const altText = characterAltText(definition.name, expression)

  if (portraitFile === undefined) {
    return { portrait: undefined, outfitAccent, altText }
  }

  return { portrait: readPortraitSource(join(characterDir, portraitFile)), outfitAccent, altText }
}

function characterAltText(name: string | undefined, expression: Expression): string {
  return `${name ?? DEFAULT_CHARACTER_ALT_NAME}（${expressionLabel(expression)}）`
}

/**
 * 立ち絵1件を読む。SVG はファイルの中身をそのまま持ち出し、ラスタ画像はバイト列を
 * data URI にして持ち出す（view-server.ts がファイルを配る経路を増やさないため。
 * 会話内容と違って立ち絵は毎回同じ小さいファイルなので、都度読み直すコストは無視できる）。
 * 拡張子が SVG でもラスタでもない、中身が SVG らしくない、ファイルが読めない、
 * といったときは undefined を返す。
 */
function readPortraitSource(filePath: string): CharacterPortraitSource | undefined {
  const kind = classifyPortraitFile(filePath)
  if (kind === undefined) {
    return undefined
  }

  if (kind === "svg") {
    const content = readOptionalFile(filePath)
    return content !== undefined && isPlausibleSvgMarkup(content)
      ? { kind: "svg", svgMarkup: content }
      : undefined
  }

  const mimeType = rasterMimeType(filePath)
  const bytes = readOptionalBinaryFile(filePath)
  return mimeType !== undefined && bytes !== undefined
    ? { kind: "image", dataUri: `data:${mimeType};base64,${bytes.toString("base64")}` }
    : undefined
}

function readTaskCounts(): TaskStatusCounts | undefined {
  const content = readOptionalFile(join(process.cwd(), ...TASKS_FILE_RELATIVE_PATH))
  return content === undefined ? undefined : countTaskStatuses(content)
}

// 起動したことと URL は、ペインに残る唯一の出力。ここに会話の内容は出さない
// （docs/coding-standards.md「会話内容の扱い」）。
// 利用者が実際に開くのは layoutUrl（3領域をまとめた1枚）だけでよい。個別の URL は
// デバッグ用に残してあるので、併せて表示しておく（`docs/architecture.md`「ビューは
// 1枚のページにまとめる」）。
function announce(server: ViewServer): void {
  const individualLines = VIEW_NAMES.map((view) => `    ${server.urlOf(view)}`)
  process.stdout.write(
    `tsukumo: ビューを配信中\n  ${server.layoutUrl}\n` +
      `  （個別ビュー・デバッグ用）\n${individualLines.join("\n")}\n`,
  )
}

/** 無くてもよいファイルを読む。存在しない・読めないときは undefined を返す（例外にしない）。 */
function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

/** 無くてもよいバイナリファイル（立ち絵のラスタ画像）を読む。存在しない・読めないときは undefined。 */
function readOptionalBinaryFile(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "原因不明"
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
