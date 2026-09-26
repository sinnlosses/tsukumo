// 手元で動いている tsukumo を数え上げ、ポートで名指しした1つだけを止める。
//
// 複数の tsukumo を並べて動かすと、プロセスのコマンドラインはどれも `bun run src/cli.ts` に
// なって見分けが付かない（`bun run dev` 経由でも同じ）。そのため名前やパターンで止めると
// 利用者が使っている本体まで落ちる。見分けが付く手がかりは待ち受けているポートだけなので、
// この道具はポートを入口にする。`scripts/deny-broad-kill.ts` が広い `kill` を拒否したとき、
// 代わりに案内する先がここ。
//
// 使い方:
//   bun run scripts/stop.ts                # 動いている tsukumo を一覧する（止めない）
//   bun run scripts/stop.ts --port 7398    # そのポートで待っているものだけ止める

import process from "node:process"

import {
  DEFAULT_VIEW_PORT,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "../src/server/view-server/core/port-resolution.ts"
import { candidatePorts, findListener } from "./lib/port-listener.ts"

const USAGE = `使い方:
  bun run scripts/stop.ts                # 動いている tsukumo を一覧する（止めない）
  bun run scripts/stop.ts --port <ポート>  # そのポートで待っているものだけ止める`

/** SIGTERM を送ってから、本当に終わったかを見に行くまでの待ち時間（ミリ秒）。 */
const TERMINATION_GRACE_MS = 700

const port = parsePortOption(process.argv.slice(2))
if (port === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

if (port === "none") {
  listAll()
} else {
  await stopOne(port)
}

/** 既定のポートから数えた探索範囲を全部引いて、見つかったものを表にして出す。 */
function listAll(): void {
  const listeners = candidatePorts().flatMap((candidate) => findListener(candidate) ?? [])
  if (listeners.length === 0) {
    process.stdout.write(
      `動いている tsukumo は見つからなかった（${String(DEFAULT_VIEW_PORT)} から ${String(
        VIEW_PORT_FALLBACK_ATTEMPTS,
      )} 個ぶんを見た）\n`,
    )
    return
  }

  process.stdout.write("ポート\tpid\tコマンド\n")
  for (const listener of listeners) {
    process.stdout.write(`${String(listener.port)}\t${String(listener.pid)}\t${listener.command}\n`)
  }
  process.stdout.write(`\n止めるには: bun run scripts/stop.ts --port <ポート>\n`)
}

/** 名指しされたポートのものだけに SIGTERM を送り、終わったかどうかまで見届ける。 */
async function stopOne(target: number): Promise<void> {
  const listener = findListener(target)
  if (listener === undefined) {
    process.stdout.write(`ポート ${String(target)} で待っているプロセスは無い\n`)
    return
  }

  process.stdout.write(`止める: ${String(listener.pid)} (${listener.command})\n`)
  try {
    process.kill(listener.pid, "SIGTERM")
  } catch (error) {
    process.stderr.write(`止められなかった: ${String(error)}\n`)
    process.exit(1)
  }

  await delay(TERMINATION_GRACE_MS)
  if (isAlive(listener.pid)) {
    process.stdout.write(
      `まだ生きている: ${String(listener.pid)}（SIGTERM を受けて片付け中かもしれない。` +
        `残るようなら kill -9 ${String(listener.pid)}）\n`,
    )
    return
  }
  process.stdout.write(`止まった: ${String(listener.pid)}\n`)
}

/** `--port` の指定を読む。無指定は `"none"`、数として読めないものは `"invalid"`。 */
function parsePortOption(args: readonly string[]): number | "none" | "invalid" {
  if (args.length === 0) {
    return "none"
  }
  if (args.length !== 2 || args[0] !== "--port") {
    return "invalid"
  }

  const parsed = Number(args[1])
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return "invalid"
  }
  return parsed
}

/** シグナル 0 は「送らずに届くかどうかだけ確かめる」（プロセスの生死を見る常套手段）。 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
