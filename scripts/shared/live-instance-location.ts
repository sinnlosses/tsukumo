// 動いている tsukumo が書いた所在のファイルを読み、書いたプロセスがまだ生きているものだけを返す。
// 読む側は古いファイルを消さない。

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { isProcessAlive } from "../../src/server/session-driver/adapter/process-alive.ts"
import {
  instanceLocationSchema,
  type InstanceLocation,
} from "../../src/server/view-server/adapter/instance-location-file.ts"
import { parseJsonWith } from "../../src/shared/utils/parse-json.ts"

/** 所在のファイルを1つ読む。読めない・形が違うときは undefined。 */
export function readInstanceLocation(path: string): InstanceLocation | undefined {
  try {
    return parseJsonWith(instanceLocationSchema, readFileSync(path, "utf8"))
  } catch {
    return undefined
  }
}

/** 所在のファイルの置き場 `dir` の中で、書いたプロセスがまだ生きているものだけ。 */
export function readLiveInstanceLocations(dir: string): readonly InstanceLocation[] {
  return listFileNames(dir)
    .flatMap((name) => readInstanceLocation(join(dir, name)) ?? [])
    .filter((location) => isProcessAlive(location.pid))
}

function listFileNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir).filter((name) => /^\d+\.json$/u.test(name))
  } catch {
    return []
  }
}
