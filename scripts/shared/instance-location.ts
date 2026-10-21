// 動いている tsukumo を、所在のファイルから見つける、という概念1つを持つ。
// 所在のファイルを書かない古いプロセスのために、ポートの走査を併用する。

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { z } from "zod"

import {
  defaultInstanceLocationDir,
  type InstanceLocation,
} from "../../src/server/view-server/adapter/instance-location-file.ts"
import { findListener, type Listener } from "./port-listener.ts"

const instanceLocationSchema = z.object({
  pid: z.number().int().positive(),
  port: z.number().int().min(0).max(65535),
  url: z.string(),
  cwd: z.string(),
}) satisfies z.ZodType<InstanceLocation>

/** 所在のファイルを1つ読む。読めない・形が違うときは undefined。 */
export function readInstanceLocation(path: string): InstanceLocation | undefined {
  try {
    const parsed = instanceLocationSchema.safeParse(JSON.parse(readFileSync(path, "utf8")))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/** 所在のファイルの置き場の中で、書いたプロセスがまだ生きているものだけ。読む側は古いファイルを消さない。 */
export function readLiveInstanceLocations(
  dir = defaultInstanceLocationDir(),
): readonly InstanceLocation[] {
  return listFileNames(dir)
    .flatMap((name) => readInstanceLocation(join(dir, name)) ?? [])
    .filter((location) => isAlive(location.pid))
}

/**
 * 動いている tsukumo。所在のファイルに書かれたポートで、書いた pid が実際に待ち受けているものに、
 * 所在を書かない古いプロセスのために `scanPorts` を走査して見つかった、所在に同じ pid が無いものを足す。
 * pid が別のプロセスに再利用された古いファイルは、待ち受けている pid が合わないので採らない。
 */
export function findRunningTsukumo(
  scanPorts: readonly number[],
  dir = defaultInstanceLocationDir(),
): readonly Listener[] {
  const scanned = scanPorts.flatMap((port) => findListener(port) ?? [])
  const confirmed = readLiveInstanceLocations(dir).flatMap((location) => {
    const listener =
      scanned.find((found) => found.port === location.port) ?? findListener(location.port)
    return listener?.pid === location.pid
      ? [{ port: location.port, pid: location.pid, command: location.cwd }]
      : []
  })
  const confirmedPids = new Set(confirmed.map((found) => found.pid))
  return [...confirmed, ...scanned.filter((found) => !confirmedPids.has(found.pid))].toSorted(
    (a, b) => a.port - b.port,
  )
}

function listFileNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir).filter((name) => /^\d+\.json$/u.test(name))
  } catch {
    return []
  }
}

/** シグナル 0 は届くかどうかだけを見る。別の利用者のプロセス（`EPERM`）も生きている。 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}
