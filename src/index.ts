// tsukumo のエントリポイント。transcript(JSONL) と hook の状態ファイルを追従し、
// ローカルの HTTP サーバから HTML のビューを配り続ける。

import { readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import process from "node:process"

import {
  classifyPortraitFile,
  isPlausibleSvgMarkup,
  parseCharacterDefinition,
  rasterMimeType,
  resolveOutfitAccent,
  resolvePortraitFile,
} from "./character.ts"
import {
  type Expression,
  expressionLabel,
  type Outfit,
  resolveExpression,
  resolveOutfit,
} from "./expression.ts"
import { type Host } from "./host.ts"
import { createOrcaHost } from "./orca-host.ts"
import { parseStateFile } from "./state.ts"
import { extractAgentMeta, extractLatestToolName } from "./subagents.ts"
import { type TaskStatusCounts, countTaskStatuses } from "./tasks.ts"
import {
  extractContextUsage,
  extractLatestPendingBackgroundAgentCount,
  extractLatestUtterance,
  extractMainViewEntries,
  splitUtterance,
} from "./transcript.ts"
import { startViewServer, type ViewServer } from "./view-server.ts"
import {
  buildCharacterBody,
  buildMainBody,
  buildSidebarBody,
  type CharacterPortraitSource,
  type CharacterViewData,
  type SidebarData,
  type SubagentActivity,
  VIEW_NAMES,
} from "./view.ts"

// ビューを配るポート。固定にしてあるのは、開き直したブラウザタブが同じ URL のまま使えるように
// するため（docs/architecture.md「HTML はローカルの HTTP サーバから配る」）。
const DEFAULT_VIEW_PORT = 7327
const VIEW_PORT_ENV_NAME = "TSUKUMO_VIEW_PORT"
// 起動時にレイアウトページのタブを自動で開くかどうか。既定は開く（コマンド1つで完成させるため）。
const OPEN_VIEW_ENV_NAME = "TSUKUMO_OPEN_VIEW"
// セリフの行頭マーカー。出力スタイルの規約（docs/requirements.md 4.2）とそろえる。
// 末尾の半角スペースまでが1つのマーカー。
const DEFAULT_SPEECH_MARKER = "アスナ: "
const SPEECH_MARKER_ENV_NAME = "TSUKUMO_SPEECH_MARKER"

const USAGE = `tsukumo — Claude Code の発話を HTML のビューに出すサイドカー

使い方:
  bun run start [transcript.jsonl]

起動すると、ビューの配信とレイアウトページのタブを開くところまで1コマンドで進む。
引数を省略すると、SessionStart hook が書き出す ~/.tsukumo/transcript-path を追従先にする
（引数を渡した場合はそちらを優先する）。

環境変数:
  TSUKUMO_VIEW_PORT       ビューを配るポート（既定 ${String(DEFAULT_VIEW_PORT)}。0 を渡すと空きポートを使う）
  TSUKUMO_CHARACTER_DIR   キャラクター定義ディレクトリ（既定は characters/tsukumo-spirit。
                          自分の素材を使うときは characters/local などを指す。cwd 相対にも対応）
  TSUKUMO_OPEN_VIEW       起動時にタブを自動で開くか（既定は開く。0 を渡すと開かない）
  TSUKUMO_SPEECH_MARKER   セリフの行頭マーカー（既定は「${DEFAULT_SPEECH_MARKER}」。
                          出力スタイル側の名前を変えたときに合わせる。末尾の空白も含めて扱う）
`

// hook（hooks/state.sh）が書く既知の場所。ディレクトリ名・ファイル名を変えるときは
// 両方を直す（docs/architecture.md「hookは状態ファイルを書くだけにする」）。
const TSUKUMO_DIR_NAME = ".tsukumo"
const STATE_FILE_NAME = "state.json"
const TRANSCRIPT_PATH_FILE_NAME = "transcript-path"

// ポーリング間隔。追従の遅延目安1秒以内（docs/requirements.md「5. 実行環境・非機能要件」）
// に対して余裕を持たせている。
const POLL_INTERVAL_MS = 500

// サイドバーは縦に狭い領域なので、サブエージェントの直近の活動は数件に絞る。
const MAX_RECENT_SUBAGENT_ACTIVITIES = 5

// メインビューは更新のたびに本文を丸ごと描き直す（docs/architecture.md「ビューの更新は
// Server-Sent Events で押す」）。セッションが長く続くほど転送量が増え続けないよう、
// 直近の記録だけに絞る。
const MAX_MAIN_VIEW_ENTRIES = 40

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

type FileSnapshot = {
  readonly mtimeMs: number
  readonly size: number
}

/**
 * 終了コードを返す。0 のときはビューサーバとポーリングループを残したままプロセスを生かし続けるので、
 * 呼び出し側は 0 以外のときだけ `process.exit` する。
 */
async function main(args: readonly string[]): Promise<number> {
  const homeDir = homedir()
  const transcriptPath = resolveTranscriptPath(args[0], homeDir)
  if (transcriptPath === undefined) {
    process.stderr.write(USAGE)
    return 2
  }

  // 起動時に前提（transcript が読める・ポートが空いている）が満たされていないときだけ即時終了する
  // （docs/coding-standards.md「エラーハンドリング」）。
  const initialSnapshot = readSnapshot(transcriptPath)
  if (initialSnapshot === undefined) {
    process.stderr.write(`tsukumo: transcript を読み込めない: ${transcriptPath}\n`)
    return 1
  }

  const port = resolveViewPort(process.env[VIEW_PORT_ENV_NAME])
  if (port === undefined) {
    process.stderr.write(`tsukumo: ${VIEW_PORT_ENV_NAME} がポート番号として読めない\n`)
    return 1
  }

  const host = createOrcaHost()
  const server = await startViewServer(port, host).catch((error: unknown) => {
    process.stderr.write(`tsukumo: ビューを配れない: ${describeError(error)}\n`)
    return undefined
  })
  if (server === undefined) {
    return 1
  }

  const characterDir = resolveCharacterDir(process.env[CHARACTER_DIR_ENV_NAME], process.cwd())
  const speechMarker = resolveSpeechMarker(process.env[SPEECH_MARKER_ENV_NAME])
  const publishCharacterView = createCharacterViewPublisher(
    server,
    homeDir,
    characterDir,
    speechMarker,
  )

  publishCharacterView(transcriptPath)
  publishSidebarView(server, transcriptPath)
  publishMainView(server, transcriptPath, speechMarker)
  followTranscript(server, transcriptPath, initialSnapshot, publishCharacterView, speechMarker)
  announce(server)

  if (resolveOpenView(process.env[OPEN_VIEW_ENV_NAME])) {
    await openLayoutView(host, server)
  }

  return 0
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
 * 追従先の transcript パスを決める。**引数が優先**で、無ければ SessionStart hook が
 * 書き出した既知の場所（~/.tsukumo/transcript-path）を読む
 * （docs/architecture.md「追従先は自前でスラッグ化せず、hookが書いたパスを読む」）。
 */
function resolveTranscriptPath(argPath: string | undefined, homeDir: string): string | undefined {
  if (argPath !== undefined) {
    return argPath
  }

  const fileContent = readOptionalFile(transcriptPathFilePath(homeDir))
  const trimmed = fileContent?.trim()
  return trimmed !== undefined && trimmed !== "" ? trimmed : undefined
}

/**
 * 起動時にレイアウトページのタブを自動で開くかどうかを決める。**環境変数が読み取りの唯一の場所**
 * （docs/coding-standards.md「外部の入力を読む場所を1つにする」）。"0" のときだけ開かない
 * （ポート番号のような不正値の弾き方は不要で、それ以外の値はすべて「開く」に倒す）。
 */
function resolveOpenView(rawValue: string | undefined): boolean {
  return rawValue?.trim() !== "0"
}

/**
 * セリフの行頭マーカーを決める。**環境変数が読み取りの唯一の場所**
 * （docs/coding-standards.md「外部の入力を読む場所を1つにする」）。
 * **値は trim しない**（既定の「アスナ: 」のように、末尾の空白までがマーカーの一部になる）。
 * 未設定・空文字のときだけ既定に落とす。
 */
function resolveSpeechMarker(rawValue: string | undefined): string {
  return rawValue === undefined || rawValue === "" ? DEFAULT_SPEECH_MARKER : rawValue
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

/** 追記を検知してビューを更新するポーリングループ。ファイルの mtime/size を見るだけで十分とした。 */
function followTranscript(
  server: ViewServer,
  transcriptPath: string,
  initialSnapshot: FileSnapshot,
  publishCharacterView: (transcriptPath: string) => void,
  speechMarker: string,
): void {
  let lastSnapshot = initialSnapshot

  setInterval(() => {
    const current = readSnapshot(transcriptPath)
    if (current === undefined) {
      return
    }
    if (current.mtimeMs === lastSnapshot.mtimeMs && current.size === lastSnapshot.size) {
      return
    }

    lastSnapshot = current
    publishCharacterView(transcriptPath)
    // サイドバー・メインビューの更新も同じきっかけ（transcript の変化）に相乗りする。
    publishSidebarView(server, transcriptPath)
    publishMainView(server, transcriptPath, speechMarker)
  }, POLL_INTERVAL_MS)
}

/**
 * キャラビューの publish 関数を作る。**「直前のセリフ」を保持する場所はこの1箇所だけ**
 * （`docs/requirements.md` 4.2「規約に従っていない発話が来たときは、吹き出しは直前のセリフを
 * 出し続ける」）。閉じ込めた `lastSpeech` を、起動直後の1回目の呼び出しとポーリングループからの
 * 呼び出しの両方で共有することで、状態の持ち主を1つに保っている。
 *
 * 返す関数が「読む → 決める → 配る」の1回分をまるごと包む唯一の場所になる。ここでの失敗は
 * 次のポーリングに任せて諦める（docs/coding-standards.md「エラーハンドリング」— ループの中に
 * `try`/`catch` を散らさない）。
 */
function createCharacterViewPublisher(
  server: ViewServer,
  homeDir: string,
  characterDir: string,
  speechMarker: string,
): (transcriptPath: string) => void {
  let lastSpeech: string | undefined = undefined

  return (transcriptPath: string) => {
    try {
      const utterance = extractLatestUtterance(readFileSync(transcriptPath, "utf8"))
      const speech =
        utterance === undefined ? undefined : splitUtterance(utterance, speechMarker).speech
      if (speech !== undefined) {
        lastSpeech = speech
      }

      // 状態ファイルが無い・壊れている・未知のイベント種別のときも、parseStateFile /
      // resolveExpression / resolveOutfit が undefined ・ "default" に落として吸収するので、
      // ここではそれ以上分岐しない。
      const stateFileContent = readOptionalFile(stateFilePath(homeDir))
      const state = stateFileContent !== undefined ? parseStateFile(stateFileContent) : undefined
      const expression = resolveExpression(state)
      const outfit = resolveOutfit(state)

      const data: CharacterViewData = {
        speech: lastSpeech,
        ...readCharacterAssets(characterDir, expression, outfit),
      }

      server.publish("character", buildCharacterBody(data))
    } catch {
      process.stderr.write("tsukumo: ビューの更新に失敗した。次の更新を待つ\n")
    }
  }
}

/**
 * キャラクター定義（character.json）と立ち絵を読み、キャラビューに渡せる形にする。
 * character.json が無い・壊れている、表情に対応する立ち絵が無い、画像ファイル自体が
 * 読めない・種類を判定できない、といったときはすべて `portrait: undefined` に落ちて、
 * 呼び出し側（buildCharacterBody）が吹き出しだけの表示にフォールバックする
 * （docs/requirements.md 4.2「フォールバック」）。
 */
function readCharacterAssets(
  characterDir: string,
  expression: Expression,
  outfit: Outfit,
): Omit<CharacterViewData, "speech"> {
  const definitionContent = readOptionalFile(join(characterDir, CHARACTER_DEFINITION_FILE_NAME))
  const definition =
    definitionContent === undefined ? undefined : parseCharacterDefinition(definitionContent)

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

// サイドバーの「読む → 決める → 配る」1回分。コンテキスト使用量・サブエージェントの状況・
// タスクの進捗の3つは互いに独立した情報源を持つので、どれか1つが読めなくても
// buildSidebarBody 側が「不明」に倒して残りを表示する（ここでは分岐しない）。
function publishSidebarView(server: ViewServer, transcriptPath: string): void {
  try {
    const transcriptContent = readFileSync(transcriptPath, "utf8")

    const data: SidebarData = {
      contextTokens: extractContextUsage(transcriptContent),
      subagents: {
        pendingCount: extractLatestPendingBackgroundAgentCount(transcriptContent),
        recentActivity: readRecentSubagentActivity(transcriptPath),
      },
      taskCounts: readTaskCounts(),
    }

    server.publish("sidebar", buildSidebarBody(data))
  } catch {
    process.stderr.write("tsukumo: サイドバーの更新に失敗した。次の更新を待つ\n")
  }
}

// メインビューの「読む → 決める → 配る」1回分。extractMainViewEntries が transcript 全体から
// 時系列の記録を作り、直近の分だけに絞って渡す（作業中/完了後の切り替えは行わない理由は
// src/transcript.ts の extractMainViewEntries を参照）。
function publishMainView(server: ViewServer, transcriptPath: string, speechMarker: string): void {
  try {
    const transcriptContent = readFileSync(transcriptPath, "utf8")
    const entries = extractMainViewEntries(transcriptContent, speechMarker).slice(
      -MAX_MAIN_VIEW_ENTRIES,
    )

    server.publish("main", buildMainBody(entries))
  } catch {
    process.stderr.write("tsukumo: メインビューの更新に失敗した。次の更新を待つ\n")
  }
}

/**
 * 直近に更新されたサブエージェントの記録から、それぞれの状況（meta.json のラベル＋直近の
 * ツール名）を集める。ディレクトリが無い・空のときは空配列（サブエージェントがまだ1つも
 * 居ないのと同じ扱い）。「今も走っているか」は判定できないため、ここでは mtime の新しい順に
 * 並べるだけに留める（src/subagents.ts のコメント参照）。
 */
function readRecentSubagentActivity(transcriptPath: string): readonly SubagentActivity[] {
  const dir = subagentsDirFor(transcriptPath)
  const files = readOptionalDirEntries(dir).filter((name) => name.endsWith(".jsonl"))

  const withMtime = files
    .map((name) => {
      const filePath = join(dir, name)
      const mtimeMs = readOptionalMtimeMs(filePath)
      return mtimeMs === undefined ? undefined : { filePath, mtimeMs }
    })
    .filter(
      (entry): entry is { readonly filePath: string; readonly mtimeMs: number } =>
        entry !== undefined,
    )

  const recentFilePaths = [...withMtime]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_RECENT_SUBAGENT_ACTIVITIES)
    .map((entry) => entry.filePath)

  return recentFilePaths
    .map((filePath) => subagentActivityAt(filePath))
    .filter((activity): activity is SubagentActivity => activity !== undefined)
}

/**
 * 1件のサブエージェントの transcript パスから、直近のツール名と meta.json のラベルを合わせる。
 * どちらも読み取れない（transcript にツール使用が無く、meta.json も無い・壊れている）ときだけ
 * undefined を返し、一覧から外す。**meta.json が無い場合はツール名だけで出す**
 * （列から消さない。ユーザーとの合意事項）。
 */
function subagentActivityAt(transcriptFilePath: string): SubagentActivity | undefined {
  const transcriptContent = readOptionalFile(transcriptFilePath)
  const latestToolName =
    transcriptContent === undefined ? undefined : extractLatestToolName(transcriptContent)

  const metaContent = readOptionalFile(metaFilePathFor(transcriptFilePath))
  const meta = metaContent === undefined ? undefined : extractAgentMeta(metaContent)

  if (latestToolName === undefined && meta === undefined) {
    return undefined
  }

  return {
    description: meta?.description,
    model: meta?.model,
    latestToolName,
  }
}

/**
 * サブエージェントの transcript が置かれるディレクトリ
 * （`<主 transcript のディレクトリ>/<session-id>/subagents`、実測。docs/architecture.md
 * 「採用アーキテクチャ」）。主 transcript のファイル名（拡張子抜き）が session-id にあたる。
 */
function subagentsDirFor(transcriptPath: string): string {
  const sessionId = basename(transcriptPath, ".jsonl")
  return join(dirname(transcriptPath), sessionId, "subagents")
}

/** `agent-<id>.jsonl` の隣にある `agent-<id>.meta.json` のパス（実測）。 */
function metaFilePathFor(transcriptFilePath: string): string {
  const idWithoutExtension = basename(transcriptFilePath, ".jsonl")
  return join(dirname(transcriptFilePath), `${idWithoutExtension}.meta.json`)
}

function readTaskCounts(): TaskStatusCounts | undefined {
  const content = readOptionalFile(join(process.cwd(), ...TASKS_FILE_RELATIVE_PATH))
  return content === undefined ? undefined : countTaskStatuses(content)
}

// 起動したことと URL は、ペインに残る唯一の出力。ここに会話の内容は出さない
// （docs/coding-standards.md「会話内容の扱い」）。
// 利用者が実際に開くのは layoutUrl（3領域をまとめた1枚）だけでよい。個別の URL は
// デバッグ用に残してあるので、併せて表示しておく（`docs/architecture.md`「3つのビューは
// 1枚のページにまとめる」）。
function announce(server: ViewServer): void {
  const individualLines = VIEW_NAMES.map((view) => `    ${server.urlOf(view)}`)
  process.stdout.write(
    `tsukumo: ビューを配信中\n  ${server.layoutUrl}\n` +
      `  （個別ビュー・デバッグ用）\n${individualLines.join("\n")}\n`,
  )
}

function readSnapshot(path: string): FileSnapshot | undefined {
  try {
    const stat = statSync(path)
    return { mtimeMs: stat.mtimeMs, size: stat.size }
  } catch {
    return undefined
  }
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

/** 無くてもよいディレクトリの中身を列挙する。存在しない・読めないときは空配列を返す。 */
function readOptionalDirEntries(path: string): readonly string[] {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

/** 無くてもよいファイルの最終更新時刻を読む。存在しない・読めないときは undefined を返す。 */
function readOptionalMtimeMs(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

function transcriptPathFilePath(homeDir: string): string {
  return join(homeDir, TSUKUMO_DIR_NAME, TRANSCRIPT_PATH_FILE_NAME)
}

function stateFilePath(homeDir: string): string {
  return join(homeDir, TSUKUMO_DIR_NAME, STATE_FILE_NAME)
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "原因不明"
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
