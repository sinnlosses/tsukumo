// ポートで listen しているプロセスを lsof で引く、という概念1つを持つ。
//
// scripts/stop.ts（動いている tsukumo を数え上げて止める）と scripts/open-room-grid.ts
// （動いている部屋を格子に並べる）の両方が同じ探し方を要るので、ここに1つだけ置く。

import { execFileSync } from "node:child_process"

import {
  DEFAULT_VIEW_PORT,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "../../src/server/core/port-resolution.ts"

/** ポートで待っている1つのプロセス。 */
export type Listener = {
  readonly port: number
  readonly pid: number
  readonly command: string
}

/** 既定のポートから、ずらして試される範囲までのポート番号。 */
export function candidatePorts(): readonly number[] {
  return Array.from(
    { length: VIEW_PORT_FALLBACK_ATTEMPTS },
    (_unused, index) => DEFAULT_VIEW_PORT + index,
  )
}

/**
 * そのポートで **listen している** プロセスを引く。接続してきた側（ブラウザ）を拾わないよう
 * `-sTCP:LISTEN` を付ける。見つからないとき `lsof` は終了コード 1 で終わるので、例外は
 * 「居なかった」として畳む。
 */
export function findListener(listenPort: number): Listener | undefined {
  const pid = firstNumber(run("lsof", ["-ti", `tcp:${String(listenPort)}`, "-sTCP:LISTEN"]))
  if (pid === undefined) {
    return undefined
  }
  const command = run("ps", ["-p", String(pid), "-o", "command="]).trim()
  return { port: listenPort, pid, command: command === "" ? "(不明)" : command }
}

export function run(file: string, args: readonly string[]): string {
  try {
    return execFileSync(file, [...args], { encoding: "utf8" })
  } catch {
    return ""
  }
}

function firstNumber(output: string): number | undefined {
  const first = output.split("\n")[0]?.trim()
  if (first === undefined || first === "") {
    return undefined
  }
  const parsed = Number(first)
  return Number.isInteger(parsed) ? parsed : undefined
}
