// 所在のファイルから配信 URL を待つ判断を検証する。tsukumo 本体は起こさず、`node -e` の子で代える。

import { type ChildProcess, spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, test } from "vitest"

import { waitForViewUrl } from "../../../scripts/shared/fake-tsukumo-process.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const home = useTempDir("fake-tsukumo-process")
const children: ChildProcess[] = []

function spawnScript(script: string): ChildProcess {
  const child = spawn("node", ["-e", script], { stdio: ["ignore", "pipe", "pipe"] })
  children.push(child)
  return child
}

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill("SIGKILL")
  }
})

describe("waitForViewUrl", () => {
  test("子の pid の所在のファイルに書かれた URL を返す。stdout の URL は見ない", async () => {
    const child = spawnScript(
      "process.stdout.write('警告 http://127.0.0.1:1/?t=other\\n'); setTimeout(() => {}, 5000)",
    )
    const dir = join(home(), "instance-location")
    mkdirSync(dir)
    writeFileSync(
      join(dir, `${String(child.pid)}.json`),
      JSON.stringify({
        pid: child.pid,
        port: 1234,
        url: "http://127.0.0.1:1234/?t=a",
        cwd: "/架空",
      }),
    )

    await expect(waitForViewUrl(child, home(), 3000)).resolves.toBe("http://127.0.0.1:1234/?t=a")
  })

  test("所在を書かずに終わったら、標準エラーを添えて落ちる", async () => {
    const child = spawnScript("process.stderr.write('壊れた'); process.exit(3)")
    await expect(waitForViewUrl(child, home(), 3000)).rejects.toThrow(/コード 3[\s\S]*壊れた/)
  })

  test("上限まで所在が書かれなければ落ちる", async () => {
    const child = spawnScript("setTimeout(() => {}, 5000)")
    await expect(waitForViewUrl(child, home(), 100)).rejects.toThrow(/所在を書かない（100ms）/)
  })
})
