import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { countRunning, registerRunning } from "../../../scripts/dev/lib/check-running.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

describe("countRunning", () => {
  const tempDir = useTempDir("check-running")
  const directory = () => join(tempDir(), "check-running")

  test("自分の印だけなら1本、別の生きた検証を足すと2本と数える", () => {
    registerRunning(directory(), 100)
    expect(countRunning(directory(), () => true)).toBe(1)

    registerRunning(directory(), 200)
    expect(countRunning(directory(), () => true)).toBe(2)
  })

  test("死んだ pid の印は数えずに消す", () => {
    registerRunning(directory(), 100)
    registerRunning(directory(), 200)

    expect(countRunning(directory(), (pid) => pid === 100)).toBe(1)
    expect(existsSync(join(directory(), "200"))).toBe(false)
  })

  test("印を消す関数で自分のファイルが消える", () => {
    const unregister = registerRunning(directory(), 100)
    unregister()

    expect(existsSync(join(directory(), "100"))).toBe(false)
  })

  test("ディレクトリが無ければ0本", () => {
    expect(countRunning(directory(), () => true)).toBe(0)
  })
})
