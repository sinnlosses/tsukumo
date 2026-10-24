// 動いている tsukumo を、所在のファイルから見つける、という概念1つを持つ。
// 所在のファイルを書かない古いプロセスのために、ポートの走査を併用する。

import { defaultInstanceLocationDir } from "../../src/server/view-server/adapter/instance-location-file.ts"
import { readLiveInstanceLocations } from "./live-instance-location.ts"
import { findListener, type Listener } from "./port-listener.ts"

/** 動いている tsukumo。所在を書かない古いプロセスは `cwd`・`startHead` が無い。 */
export type RunningTsukumo = Listener & {
  readonly cwd: string | undefined
  readonly startHead: string | undefined
}

const SHORT_HEAD_LENGTH = 7

/** 起動時の HEAD と今の HEAD を比べた表示。どちらかが読めなければ「不明」。 */
export function describeFreshness(
  startHead: string | undefined,
  currentHead: string | undefined,
): string {
  if (startHead === undefined || currentHead === undefined || currentHead === "") {
    return "不明"
  }
  return currentHead === startHead
    ? "最新"
    : `古い（起動 ${startHead.slice(0, SHORT_HEAD_LENGTH)} → 今 ${currentHead.slice(0, SHORT_HEAD_LENGTH)}）`
}

/**
 * 動いている tsukumo。所在のファイルに書かれたポートで、書いた pid が実際に待ち受けているものに、
 * 所在を書かない古いプロセスのために `scanPorts` を走査して見つかった、所在に同じ pid が無いものを足す。
 * pid が別のプロセスに再利用された古いファイルは、待ち受けている pid が合わないので採らない。
 */
export function findRunningTsukumo(
  scanPorts: readonly number[],
  dir = defaultInstanceLocationDir(),
): readonly RunningTsukumo[] {
  const scanned = scanPorts.flatMap((port) => findListener(port) ?? [])
  const confirmed = readLiveInstanceLocations(dir).flatMap((location): RunningTsukumo[] => {
    const listener =
      scanned.find((found) => found.port === location.port) ?? findListener(location.port)
    return listener?.pid === location.pid
      ? [
          {
            port: location.port,
            pid: location.pid,
            command: location.cwd,
            cwd: location.cwd,
            startHead: location.head,
          },
        ]
      : []
  })
  const confirmedPids = new Set(confirmed.map((found) => found.pid))
  const unlocated = scanned
    .filter((found) => !confirmedPids.has(found.pid))
    .map((found): RunningTsukumo => ({ ...found, cwd: undefined, startHead: undefined }))
  return [...confirmed, ...unlocated].toSorted((a, b) => a.port - b.port)
}
