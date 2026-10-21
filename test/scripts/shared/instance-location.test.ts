import { type ChildProcess, spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { afterEach, describe, expect, test } from "vitest"

import {
  findRunningTsukumo,
  readInstanceLocation,
  readLiveInstanceLocations,
} from "../../../scripts/shared/instance-location.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const dir = useTempDir("instance-location-reader")

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

const children: ChildProcess[] = []

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill("SIGKILL")
  }
})

/** 空きポートで待ち受ける子を起こし、その pid とポートを返す。 */
async function spawnListener(): Promise<{ readonly pid: number; readonly port: number }> {
  const child = spawn(
    "node",
    [
      "-e",
      "const s = require('node:net').createServer().listen(0, '127.0.0.1', () => { process.stdout.write(String(s.address().port)) })",
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  )
  children.push(child)
  const port = await new Promise<number>((resolve) => {
    child.stdout.once("data", (chunk: Buffer) => {
      resolve(Number(chunk.toString("utf8")))
    })
  })
  return { pid: child.pid ?? 0, port }
}

describe("findRunningTsukumo", () => {
  test("所在の pid とポートで待っている pid が違うもの（pid の再利用）は採らない", async () => {
    const listener = await spawnListener()
    put(`${String(process.pid)}.json`, { ...location(process.pid), port: listener.port })

    expect(findRunningTsukumo([], dir()).map((found) => found.pid)).toEqual([])
  })

  test("所在を確かめた分に、所在に無い pid の走査の分を足して両方返す", async () => {
    const located = await spawnListener()
    const old = await spawnListener()
    put(`${String(located.pid)}.json`, { ...location(located.pid), port: located.port })

    const found = findRunningTsukumo([located.port, old.port], dir())

    expect(found.map((entry) => entry.pid).sort()).toEqual([located.pid, old.pid].sort())
    expect(found.find((entry) => entry.pid === located.pid)?.command).toBe("/架空")
  })
})
