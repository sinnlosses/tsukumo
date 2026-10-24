import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { describe, expect, test } from "vitest"

import {
  readInstanceLocation,
  readLiveInstanceLocations,
} from "../../../scripts/shared/live-instance-location.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const dir = useTempDir("live-instance-location")

function put(name: string, content: unknown): string {
  mkdirSync(dir(), { recursive: true })
  const path = join(dir(), name)
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content))
  return path
}

function location(pid: number): Record<string, unknown> {
  return { pid, port: 7330, url: "http://127.0.0.1:7330/?t=架空", cwd: "/架空" }
}

describe("readLiveInstanceLocations", () => {
  test("書いたプロセスが生きているものだけを返し、死んだものは消さずに無視する", () => {
    const deadPid = 2 ** 22 + 12345
    put(`${String(process.pid)}.json`, location(process.pid))
    const deadPath = put(`${String(deadPid)}.json`, location(deadPid))
    put("not-a-pid.json", location(process.pid))
    put("999.json", "壊れた中身")

    expect(readLiveInstanceLocations(dir()).map((entry) => entry.pid)).toEqual([process.pid])
    expect(readInstanceLocation(deadPath)?.pid).toBe(deadPid)
  })

  test("置き場が無ければ空", () => {
    expect(readLiveInstanceLocations(join(dir(), "無い"))).toEqual([])
  })
})

describe("readInstanceLocation", () => {
  test("head の欄を読み、欄の無い古いファイルは undefined で読む", () => {
    const withHead = put("111.json", { ...location(process.pid), head: "abc1234567" })
    const withoutHead = put("222.json", location(process.pid))

    expect(readInstanceLocation(withHead)?.head).toBe("abc1234567")
    expect(readInstanceLocation(withoutHead)?.pid).toBe(process.pid)
    expect(readInstanceLocation(withoutHead)?.head).toBeUndefined()
  })
})
