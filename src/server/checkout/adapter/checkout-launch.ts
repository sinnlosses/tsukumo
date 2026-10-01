// cwd のチェックアウトを探す・そのチェックアウトの bin/tsukumo を子として起こす、の2つで、ファイルと子プロセスに触る境界。

import { spawn } from "node:child_process"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join } from "node:path"
import process from "node:process"

import { bundledFilePath } from "../../adapter/bundled-path.ts"
import type { CwdCheckout } from "../core/checkout-delegation.ts"

const PACKAGE_NAME = "tsukumo"
const ENTRY_RELATIVE_SEGMENTS = ["bin", "tsukumo"] as const
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const

/** いま動いている tsukumo 自身のチェックアウトの根。symlink を解いた実パス。 */
export function readOwnCheckoutRoot(): string {
  return realpathSync(bundledFilePath())
}

/** cwd から上へ辿り、`package.json` の name が tsukumo の最初のディレクトリを cwd のチェックアウトとする。 */
export function readCwdCheckout(cwd: string): CwdCheckout {
  const root = findCheckoutRoot(realpathSync(cwd))
  if (root === undefined) {
    return { kind: "outside" }
  }
  const entry = join(root, ...ENTRY_RELATIVE_SEGMENTS)

  return { kind: "inside", root, entry, entryExists: existsSync(entry) }
}

/**
 * 子の終了コードを返す。シグナルで終わったときは、転送を外してから同じシグナルを自分へ投げ直す。
 * 起こせなかったときは理由を1行出して 1 を返す。
 */
export function delegateToCheckout(entry: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(entry, args, { stdio: "inherit" })
    const forwarders = FORWARDED_SIGNALS.map((signal) => {
      const forward = () => child.kill(signal)
      process.on(signal, forward)
      return [signal, forward] as const
    })
    const stopForwarding = () => {
      for (const [signal, forward] of forwarders) {
        process.off(signal, forward)
      }
    }

    child.on("error", (error) => {
      stopForwarding()
      process.stderr.write(`tsukumo: ${entry} を起こせない（${error.message}）\n`)
      resolve(1)
    })
    child.on("close", (code, signal) => {
      stopForwarding()
      if (signal === null) {
        resolve(code ?? 1)
        return
      }
      process.kill(process.pid, signal)
    })
  })
}

function findCheckoutRoot(dir: string): string | undefined {
  if (isTsukumoPackage(join(dir, "package.json"))) {
    return dir
  }
  const parent = dirname(dir)

  return parent === dir ? undefined : findCheckoutRoot(parent)
}

function isTsukumoPackage(packageJsonPath: string): boolean {
  try {
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"))

    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "name" in parsed &&
      parsed.name === PACKAGE_NAME
    )
  } catch {
    return false
  }
}
