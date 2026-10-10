import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { beforeAll, describe, expect, it } from "vitest"

import {
  createSessionClaimFile,
  readOccupiedSessionIds,
  type SessionClaimPlace,
} from "../../../../src/server/session-driver/adapter/session-claim-file.ts"
import { runSubprocessOrThrow } from "../../../fixture/subprocess.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("session-claim")

/** 自分として扱う pid。このテストのプロセス（`process.pid`）は、ほかの生きている tsukumo の役にする。 */
let ownPid = 0

beforeAll(async () => {
  ownPid = await endedPid()
})

function place(): SessionClaimPlace {
  return { dir: join(dir(), "session-claim"), ownPid }
}

/** ほかのプロセスの名乗りを手で置く。 */
function putClaim(pid: number, content: unknown, name = `${String(pid)}.json`): string {
  mkdirSync(place().dir, { recursive: true })
  const path = join(place().dir, name)
  writeFileSync(path, JSON.stringify(content))
  return path
}

/** 起こしてすぐ終わったプロセスの pid（もう生きていない）。 */
async function endedPid(): Promise<number> {
  return Number(
    await runSubprocessOrThrow(process.execPath, [
      "-e",
      "process.stdout.write(String(process.pid))",
    ]),
  )
}

describe("createSessionClaimFile", () => {
  it("名乗りを書き、空にすると消す。自分の名乗りは使用中に数えない", async () => {
    const failures: unknown[] = []
    const store = createSessionClaimFile({ place: place(), reportFailure: (e) => failures.push(e) })
    const path = join(place().dir, `${String(ownPid)}.json`)

    store.write(["架空のセッションA"])
    expect(existsSync(path)).toBe(true)
    expect(await store.readOthers()).toEqual([])

    store.write([])
    expect(existsSync(path)).toBe(false)
    expect(failures).toEqual([])
  })

  it("書けなかった失敗は投げずに渡す", () => {
    const failures: unknown[] = []
    // 置き場の名前でファイルを置いて、ディレクトリを作れなくする。
    writeFileSync(join(dir(), "session-claim"), "")
    const store = createSessionClaimFile({ place: place(), reportFailure: (e) => failures.push(e) })

    store.write(["架空のセッションA"])

    expect(failures.length).toBe(1)
  })
})

describe("readOccupiedSessionIds", () => {
  it("生きているほかのプロセスの名乗りを使用中にする", async () => {
    putClaim(process.pid, { pid: process.pid, sessionIds: ["架空のセッションA"] })

    expect(await readOccupiedSessionIds(place())).toEqual(["架空のセッションA"])
  })

  it("もういないプロセスの名乗りは使用中にせず、ファイルを消す", async () => {
    const pid = await endedPid()
    const path = putClaim(pid, { pid, sessionIds: ["架空のセッションA"] })

    expect(await readOccupiedSessionIds(place())).toEqual([])
    expect(existsSync(path)).toBe(false)
  })

  it("別の利用者のプロセス（pid 1）の名乗りは使用中にせず、ファイルも消さない", async () => {
    const path = putClaim(1, { pid: 1, sessionIds: ["架空のセッションA"] })

    expect(await readOccupiedSessionIds(place())).toEqual([])
    expect(existsSync(path)).toBe(true)
  })

  it("壊れた中身・名乗りの形でない名前は読まない", async () => {
    putClaim(process.pid, { pid: process.pid, sessionIds: "架空のセッションA" })
    putClaim(process.pid, { pid: process.pid, sessionIds: ["架空のセッションB"] }, "memo.json")
    writeFileSync(join(place().dir, "1.json"), "{")

    expect(await readOccupiedSessionIds(place())).toEqual([])
  })

  it("置き場が無ければ空", async () => {
    expect(await readOccupiedSessionIds(place())).toEqual([])
  })
})
