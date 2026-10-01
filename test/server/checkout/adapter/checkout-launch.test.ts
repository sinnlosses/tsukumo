import { chmodSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  delegateToCheckout,
  readCwdCheckout,
} from "../../../../src/server/checkout/adapter/checkout-launch.ts"
import { runSubprocess } from "../../../fixture/subprocess.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const CLI = new URL("../../../../src/cli.ts", import.meta.url).pathname

const dir = useTempDir("checkout")

function writeCheckout(root: string, name: string, entryBody: string | undefined): void {
  mkdirSync(join(root, "bin"), { recursive: true })
  writeFileSync(join(root, "package.json"), JSON.stringify({ name }))
  if (entryBody !== undefined) {
    const entry = join(root, "bin", "tsukumo")
    writeFileSync(entry, `#!/usr/bin/env node\n${entryBody}`)
    chmodSync(entry, 0o755)
  }
}

describe("readCwdCheckout", () => {
  it("下位のディレクトリからでも、package.json の name が tsukumo の根を返す", () => {
    const root = realpathSync(dir())
    writeCheckout(root, "tsukumo", "")
    mkdirSync(join(root, "src", "deep"), { recursive: true })

    expect(readCwdCheckout(join(root, "src", "deep"))).toEqual({
      kind: "inside",
      root,
      entry: join(root, "bin", "tsukumo"),
      entryExists: true,
    })
  })

  it("name が違う package.json は飛ばして上へ辿る", () => {
    const root = realpathSync(dir())
    writeCheckout(root, "tsukumo", undefined)
    mkdirSync(join(root, "packages", "other"), { recursive: true })
    writeFileSync(join(root, "packages", "other", "package.json"), JSON.stringify({ name: "x" }))

    expect(readCwdCheckout(join(root, "packages", "other"))).toMatchObject({
      kind: "inside",
      root,
      entryExists: false,
    })
  })

  it("tsukumo の package.json が無い場所は外", () => {
    const root = realpathSync(dir())
    writeCheckout(root, "other", "")

    expect(readCwdCheckout(root)).toEqual({ kind: "outside" })
  })
})

describe("delegateToCheckout", () => {
  it("子の終了コードをそのまま返す", async () => {
    const root = realpathSync(dir())
    writeCheckout(root, "tsukumo", "process.exit(7)\n")

    expect(await delegateToCheckout(join(root, "bin", "tsukumo"), [])).toBe(7)
  })
})

describe("cli.ts", () => {
  it("別のチェックアウトの中で打つと、そこの bin/tsukumo が同じ引数で起きて終了コードが伝わる", async () => {
    const root = realpathSync(dir())
    writeCheckout(
      root,
      "tsukumo",
      "console.log(`child ${process.argv.slice(2).join(' ')}`)\nprocess.exit(5)\n",
    )

    const result = await runSubprocess("node", [CLI, "--dev"], { cwd: root, env: process.env })

    expect(result).toMatchObject({ exitCode: 5, stdout: "child --dev\n" })
  })

  it("bin/tsukumo が無いチェックアウトの中で打つと、食い違いを出して 1 で止まる", async () => {
    const root = realpathSync(dir())
    writeCheckout(root, "tsukumo", undefined)

    const result = await runSubprocess("node", [CLI], { cwd: root, env: process.env })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(root)
  })
})
