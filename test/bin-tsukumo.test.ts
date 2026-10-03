import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { runSubprocess } from "./fixture/subprocess.ts"
import { useTempDir } from "./fixture/temp-dir.ts"

const BIN = new URL("../bin/tsukumo", import.meta.url).pathname
const PACKAGE_JSON = new URL("../package.json", import.meta.url).pathname

const dir = useTempDir("bin-tsukumo")

/** 版を聞かれたら `version` を答え、それ以外で起こされたら `ran` を出す偽の node と、それを使う bin/tsukumo の写しを置く。 */
function writeCheckout(version: string): { readonly entry: string; readonly path: string } {
  const root = dir()
  mkdirSync(join(root, "bin"), { recursive: true })
  mkdirSync(join(root, "fake"), { recursive: true })
  writeFileSync(join(root, "package.json"), JSON.stringify({ engines: { node: ">=26" } }))
  const entry = join(root, "bin", "tsukumo")
  writeFileSync(entry, readFileSync(BIN, "utf8"))
  chmodSync(entry, 0o755)
  const node = join(root, "fake", "node")
  writeFileSync(
    node,
    `#!/bin/sh\ncase "$*" in\n  *process.versions*) echo ${version} ;;\n  *engines*) echo '>=26' ;;\n  *) echo ran ;;\nesac\n`,
  )
  chmodSync(node, 0o755)
  // mise が PATH に無い環境にして、PATH の node へ落ちる経路で試す。
  return { entry, path: `${join(root, "fake")}:/usr/bin:/bin` }
}

describe("package.json の engines", () => {
  it("bin/tsukumo が読める >=<数> の形", () => {
    const parsed: unknown = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"))

    expect(parsed).toMatchObject({ engines: { node: expect.stringMatching(/^>=\d+/) } })
  })
})

describe("bin/tsukumo の node の版の確認", () => {
  it("下限より古い node なら案内を出して 1 で止まる", async () => {
    const { entry, path } = writeCheckout("24.1.0")

    const result = await runSubprocess(entry, [], { env: { PATH: path } })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("node 24.1.0 が古い")
    expect(result.stdout).toBe("")
  })

  it("下限を満たす node なら案内を出さずに起こす", async () => {
    const { entry, path } = writeCheckout("26.10.0")

    const result = await runSubprocess(entry, [], { env: { PATH: path } })

    expect(result).toMatchObject({ exitCode: 0, stdout: "ran\n", stderr: "" })
  })
})
