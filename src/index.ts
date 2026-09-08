// tsukumo のエントリポイント。transcript(JSONL) を追従し、
// 最新の assistant 発話を吹き出しとして描画し続ける。

import { readFileSync, statSync } from "node:fs"
import process from "node:process"

import { buildBalloon } from "./balloon.ts"
import { draw, terminalWidth } from "./draw.ts"
import { extractLatestUtterance } from "./transcript.ts"

const USAGE = `tsukumo — Claude Code の発話を立ち絵と吹き出しで表示するサイドカー

使い方:
  bun run start <transcript.jsonl>
`

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
  const transcriptPath = args[0]
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

  renderOnce(transcriptPath)
  followResize(transcriptPath)
  followTranscript(transcriptPath, initialSnapshot)

  return 0
}

// ペイン幅は描画のたびに読み直すが、描画が起きるのは transcript が変わったときだけ。
// リサイズを拾わないと、幅を変えても箱が前の幅のまま残り、行が新しい幅を超えて
// 折り返され、枠の右辺が次の行へ押し出される。
function followResize(transcriptPath: string): void {
  process.stdout.on("resize", () => {
    renderOnce(transcriptPath)
  })
}

/** 追記を検知して描画を更新するポーリングループ。ファイルの mtime/size を見るだけで十分とした。 */
function followTranscript(transcriptPath: string, initialSnapshot: FileSnapshot): void {
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
    renderOnce(transcriptPath)
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

// 「読む → 決める → 描く」の1回分をまるごと包む唯一の場所。ここでの失敗は次のポーリングに
// 任せて諦める（docs/coding-standards.md「エラーハンドリング」— 描画ループの中に try/catch
// を散らさない）。
function renderOnce(transcriptPath: string): void {
  try {
    const content = readFileSync(transcriptPath, "utf8")
    const utterance = extractLatestUtterance(content)
    const lines = buildBalloon(utterance, terminalWidth())
    draw(lines)
  } catch {
    process.stderr.write("tsukumo: 描画に失敗した。次の更新を待つ\n")
  }
}

const exitCode = main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
