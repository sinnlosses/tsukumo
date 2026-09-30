// 子プロセスから配信 URL を待つ判断を検証する。tsukumo 本体は起こさず、`node -e` の子で代える。

import { type ChildProcess, spawn } from "node:child_process"

import { afterEach, describe, expect, test } from "vitest"

import { waitForViewUrl } from "../../scripts/lib/fake-tsukumo-process.ts"

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
  test("標準出力に出た最初の URL を返す", async () => {
    const child = spawnScript(
      "process.stdout.write('待ち受け http://127.0.0.1:1234/?t=a\\n'); setTimeout(() => {}, 5000)",
    )
    await expect(waitForViewUrl(child, 3000)).resolves.toBe("http://127.0.0.1:1234/?t=a")
  })

  test("URL を出さずに終わったら、標準エラーを添えて落ちる", async () => {
    const child = spawnScript("process.stderr.write('壊れた'); process.exit(3)")
    await expect(waitForViewUrl(child, 3000)).rejects.toThrow(/コード 3[\s\S]*壊れた/)
  })

  test("上限まで URL が出なければ落ちる", async () => {
    const child = spawnScript("setTimeout(() => {}, 5000)")
    await expect(waitForViewUrl(child, 100)).rejects.toThrow(/URL を出さない（100ms）/)
  })
})
