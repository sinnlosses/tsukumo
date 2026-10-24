import { type ChildProcess, spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { afterEach, describe, expect, test } from "vitest"

import { describeFreshness, findRunningTsukumo } from "../../../scripts/shared/instance-location.ts"
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

describe("describeFreshness", () => {
  test("同じなら最新、違えば短い HEAD で古い、どちらかが読めなければ不明", () => {
    expect(describeFreshness("abc1234567", "abc1234567")).toBe("最新")
    expect(describeFreshness("abc1234567", "def5678901")).toBe("古い（起動 abc1234 → 今 def5678）")
    expect(describeFreshness(undefined, "def5678901")).toBe("不明")
    expect(describeFreshness("abc1234567", undefined)).toBe("不明")
    expect(describeFreshness("abc1234567", "")).toBe("不明")
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
    put(`${String(located.pid)}.json`, {
      ...location(located.pid),
      port: located.port,
      head: "abc1234567",
    })

    const found = findRunningTsukumo([located.port, old.port], dir())

    expect(found.map((entry) => entry.pid).toSorted()).toEqual([located.pid, old.pid].toSorted())
    expect(found.find((entry) => entry.pid === located.pid)?.command).toBe("/架空")
    expect(found.find((entry) => entry.pid === located.pid)?.startHead).toBe("abc1234567")
    expect(found.find((entry) => entry.pid === old.pid)?.startHead).toBeUndefined()
  })
})
