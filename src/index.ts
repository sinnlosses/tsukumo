// tsukumo のエントリポイント。transcript(JSONL) を追従し、
// 最新の assistant 発話を吹き出しとして描画し続ける。

import { readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { buildBalloon } from "./balloon.ts"
import { draw, terminalWidth } from "./draw.ts"
import { describeStatus, resolveExpression, resolveOutfit } from "./expression.ts"
import { parseStateFile } from "./state.ts"
import { extractLatestUtterance } from "./transcript.ts"

const USAGE = `tsukumo — Claude Code の発話を立ち絵と吹き出しで表示するサイドカー

使い方:
  bun run start <transcript.jsonl>

引数を省略すると、SessionStart hook が書き出す ~/.tsukumo/transcript-path を追従先にする
（引数を渡した場合はそちらを優先する）。
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
 * 終了コードを返す。0 のときはポーリングループへ入ったままプロセスを生かし続けるので、
 * 呼び出し側は 0 以外のときだけ `process.exit` する。
 */
function main(args: readonly string[]): number {
  const homeDir = homedir()
  const transcriptPath = resolveTranscriptPath(args[0], homeDir)
  if (transcriptPath === undefined) {
    process.stderr.write(USAGE)
    return 2
  }

  const initialSnapshot = readSnapshot(transcriptPath)
  if (initialSnapshot === undefined) {
    // 起動時に前提（transcript が読める）が満たされていない: 即時終了する
    // （docs/coding-standards.md「エラーハンドリング」）。
    process.stderr.write(`tsukumo: transcript を読み込めない: ${transcriptPath}\n`)
    return 1
  }

  renderOnce(transcriptPath, homeDir)
  followResize(transcriptPath, homeDir)
  followTranscript(transcriptPath, homeDir, initialSnapshot)

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

// ペイン幅は描画のたびに読み直すが、描画が起きるのは transcript が変わったときだけ。
// リサイズを拾わないと、幅を変えても箱が前の幅のまま残り、行が新しい幅を超えて
// 折り返され、枠の右辺が次の行へ押し出される。
function followResize(transcriptPath: string, homeDir: string): void {
  process.stdout.on("resize", () => {
    renderOnce(transcriptPath, homeDir)
  })
}

/** 追記を検知して描画を更新するポーリングループ。ファイルの mtime/size を見るだけで十分とした。 */
function followTranscript(
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
    renderOnce(transcriptPath, homeDir)
  }, POLL_INTERVAL_MS)
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

// 「読む → 決める → 描く」の1回分をまるごと包む唯一の場所。ここでの失敗は次のポーリングに
// 任せて諦める（docs/coding-standards.md「エラーハンドリング」— 描画ループの中に try/catch
// を散らさない）。
function renderOnce(transcriptPath: string, homeDir: string): void {
  try {
    const content = readFileSync(transcriptPath, "utf8")
    const utterance = extractLatestUtterance(content)
    const balloonLines = buildBalloon(utterance, terminalWidth())

    // 状態ファイルが無い・壊れている・未知のイベント種別のときも、parseStateFile /
    // resolveExpression / resolveOutfit が undefined ・ "default" に落として吸収するので、
    // ここではそれ以上分岐しない。
    const stateFileContent = readOptionalFile(stateFilePath(homeDir))
    const state = stateFileContent !== undefined ? parseStateFile(stateFileContent) : undefined
    const expression = resolveExpression(state)
    const outfit = resolveOutfit(state)
    const statusLine = describeStatus(expression, outfit)

    draw([statusLine, ...balloonLines])
  } catch {
    process.stderr.write("tsukumo: 描画に失敗した。次の更新を待つ\n")
  }
}

const exitCode = main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
