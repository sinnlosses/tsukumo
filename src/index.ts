// tsukumo のエントリポイント。transcript(JSONL) と hook の状態ファイルを追従し、
// ローカルの HTTP サーバから HTML のビューを配り続ける。

import { readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { describeStatus, resolveExpression, resolveOutfit } from "./expression.ts"
import { parseStateFile } from "./state.ts"
import { extractLatestUtterance } from "./transcript.ts"
import { startViewServer, type ViewServer } from "./view-server.ts"
import { buildCharacterBody, buildPlaceholderBody, VIEW_NAMES } from "./view.ts"

// ビューを配るポート。固定にしてあるのは、開き直したブラウザタブが同じ URL のまま使えるように
// するため（docs/architecture.md「HTML はローカルの HTTP サーバから配る」）。
const DEFAULT_VIEW_PORT = 7327
const VIEW_PORT_ENV_NAME = "TSUKUMO_VIEW_PORT"

const USAGE = `tsukumo — Claude Code の発話を HTML のビューに出すサイドカー

使い方:
  bun run start <transcript.jsonl>

引数を省略すると、SessionStart hook が書き出す ~/.tsukumo/transcript-path を追従先にする
（引数を渡した場合はそちらを優先する）。

環境変数:
  TSUKUMO_VIEW_PORT  ビューを配るポート（既定 ${String(DEFAULT_VIEW_PORT)}。0 を渡すと空きポートを使う）
`

// hook（hooks/state.sh）が書く既知の場所。ディレクトリ名・ファイル名を変えるときは
// 両方を直す（docs/architecture.md「hookは状態ファイルを書くだけにする」）。
const TSUKUMO_DIR_NAME = ".tsukumo"
const STATE_FILE_NAME = "state.json"
const TRANSCRIPT_PATH_FILE_NAME = "transcript-path"

// ポーリング間隔。追従の遅延目安1秒以内（docs/requirements.md「5. 実行環境・非機能要件」）
// に対して余裕を持たせている。
const POLL_INTERVAL_MS = 500

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

  const server = await startViewServer(port).catch((error: unknown) => {
    process.stderr.write(`tsukumo: ビューを配れない: ${describeError(error)}\n`)
    return undefined
  })
  if (server === undefined) {
    return 1
  }

  // メインビューとサイドバーの中身は後続の作業で入る。ここでは場所だけを確保しておく。
  server.publish("main", buildPlaceholderBody("main"))
  server.publish("sidebar", buildPlaceholderBody("sidebar"))

  publishCharacterView(server, transcriptPath, homeDir)
  followTranscript(server, transcriptPath, homeDir, initialSnapshot)
  announce(server)

  return 0
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
  homeDir: string,
  initialSnapshot: FileSnapshot,
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
    publishCharacterView(server, transcriptPath, homeDir)
  }, POLL_INTERVAL_MS)
}

// 「読む → 決める → 配る」の1回分をまるごと包む唯一の場所。ここでの失敗は次のポーリングに
// 任せて諦める（docs/coding-standards.md「エラーハンドリング」— ループの中に try/catch を
// 散らさない）。
function publishCharacterView(server: ViewServer, transcriptPath: string, homeDir: string): void {
  try {
    const utterance = extractLatestUtterance(readFileSync(transcriptPath, "utf8"))

    // 状態ファイルが無い・壊れている・未知のイベント種別のときも、parseStateFile /
    // resolveExpression / resolveOutfit が undefined ・ "default" に落として吸収するので、
    // ここではそれ以上分岐しない。
    const stateFileContent = readOptionalFile(stateFilePath(homeDir))
    const state = stateFileContent !== undefined ? parseStateFile(stateFileContent) : undefined
    const status = describeStatus(resolveExpression(state), resolveOutfit(state))

    server.publish("character", buildCharacterBody(status, utterance))
  } catch {
    process.stderr.write("tsukumo: ビューの更新に失敗した。次の更新を待つ\n")
  }
}

// 起動したことと URL は、ペインに残る唯一の出力。ここに会話の内容は出さない
// （docs/coding-standards.md「会話内容の扱い」）。
function announce(server: ViewServer): void {
  const lines = VIEW_NAMES.map((view) => `  ${server.urlOf(view)}`)
  process.stdout.write(`tsukumo: ビューを配信中\n${lines.join("\n")}\n`)
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
