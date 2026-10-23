// 手元で動いている tsukumo を数え上げ、ポートで名指しした1つだけを止める。
//
// 複数の tsukumo を並べて動かすと、プロセスのコマンドラインはどれも `node src/cli.ts` に
// なって見分けが付かない（`pnpm run dev` 経由でも同じ）。そのため名前やパターンで止めると
// 利用者が使っている本体まで落ちる。見分けが付く手がかりは、起動した tsukumo が書く
// 所在のファイルと待ち受けているポートで、この道具はポートを入口にする。所在を書かない
// 古いプロセスのために、ポートの走査を併用する。広く狙う形の `kill` を拒否する hook が、
// 代わりに案内する先がここ。
//
// 使い方:
//   node scripts/runtime/stop.ts                # 動いている tsukumo を一覧する（止めない）
//   node scripts/runtime/stop.ts --port 7398    # そのポートで待っているものだけ止める

import process from "node:process"
import { parseArgs } from "node:util"

import { z } from "zod"

import {
  DEFAULT_VIEW_PORT,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "../../src/server/view-server/core/port-resolution.ts"
import { queryGit } from "../shared/git-query.ts"
import {
  describeFreshness,
  findRunningTsukumo,
  type RunningTsukumo,
} from "../shared/instance-location.ts"
import { candidatePorts } from "../shared/port-listener.ts"
import { positiveIntegerArgument } from "../shared/positive-integer-argument.ts"

const portSchema = positiveIntegerArgument.pipe(z.number().max(65535))

const USAGE = `使い方:
  node scripts/runtime/stop.ts                # 動いている tsukumo を一覧する（止めない）
  node scripts/runtime/stop.ts --port <ポート>  # そのポートで待っているものだけ止める`

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

/** 動いている tsukumo を表にして出す。所在のファイルに加えて、既定のポートから数えた探索範囲も引く。 */
function listAll(): void {
  const listeners = findRunningTsukumo(candidatePorts())
  if (listeners.length === 0) {
    process.stdout.write(
      `動いている tsukumo は見つからなかった（${String(DEFAULT_VIEW_PORT)} から ${String(
        VIEW_PORT_FALLBACK_ATTEMPTS,
      )} 個ぶんを見た）\n`,
    )
    return
  }

  process.stdout.write("ポート\tpid\t鮮度\t場所・コマンド\n")
  for (const listener of listeners) {
    process.stdout.write(
      `${String(listener.port)}\t${String(listener.pid)}\t${freshnessOf(listener)}\t${listener.command}\n`,
    )
  }
  process.stdout.write(`\n止めるには: node scripts/runtime/stop.ts --port <ポート>\n`)
}

/** そのプロセスの `cwd` の今の HEAD を読んで、起動時の HEAD と比べる。 */
function freshnessOf(running: RunningTsukumo): string {
  const current =
    running.cwd === undefined ? undefined : queryGit(running.cwd, ["rev-parse", "HEAD"])?.trim()
  return describeFreshness(running.startHead, current)
}

/** 名指しされたポートのものだけに SIGTERM を送り、終わったかどうかまで見届ける。 */
async function stopOne(target: number): Promise<void> {
  const listener = findRunningTsukumo([target]).find((running) => running.port === target)
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
  try {
    const { values } = parseArgs({
      args: [...args],
      strict: true,
      options: { port: { type: "string" } },
    })
    if (values.port === undefined) {
      return "none"
    }
    const parsed = portSchema.safeParse(values.port)
    return parsed.success ? parsed.data : "invalid"
  } catch {
    return "invalid"
  }
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
