// submodule が記録の版とずれていないかを `git submodule status` から読み、ずれていれば揃える概念を持つ。
// `git` だけを呼ぶ。

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

import { classifySubmoduleStatus, type SubmoduleEntry } from "./submodule-status.ts"

export type SubmoduleAlignment =
  | { readonly kind: "none" }
  | {
      readonly kind: "aligned"
      readonly moves: readonly {
        readonly path: string
        readonly from: string
        readonly to: string
      }[]
    }
  | { readonly kind: "blocked"; readonly reason: string }

const SHORT_SHA_LENGTH = 7
const FIX_HINT = "\n直し方: git submodule update --init"

/**
 * `root` の submodule がずれていれば `git submodule update --init` で記録した版へ揃える。
 * `.gitmodules` が無ければ何もしない。衝突・揃えられなかったとき、作業ツリーで進めて
 * `git add` していない版があるときは、戻さず `blocked` を返す。 */
export function alignSubmodules(root: string): SubmoduleAlignment {
  if (!existsSync(path.join(root, ".gitmodules"))) {
    return { kind: "none" }
  }
  try {
    const before = classifySubmoduleStatus(readStatus(root))
    if (before.conflicted.length > 0) {
      const paths = before.conflicted.map((entry) => entry.path).join(", ")
      return { kind: "blocked", reason: `submodule が衝突している: ${paths}${FIX_HINT}` }
    }
    if (before.drifted.length === 0) {
      return { kind: "none" }
    }
    const advanced = findAdvanced(root, before.drifted)
    if (advanced !== undefined) {
      return {
        kind: "blocked",
        reason:
          `作業ツリーで進めた版（${advanced.checkout}）が記録の版（${advanced.recorded}）と違う。` +
          `意図した変更なら git add ${advanced.path} してから打ち直す`,
      }
    }
    execFileSync("git", ["-C", root, "submodule", "update", "--init"], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    })
    const after = classifySubmoduleStatus(readStatus(root))
    const stillDrifted = [...after.drifted, ...after.conflicted]
    if (stillDrifted.length > 0) {
      const paths = stillDrifted.map((entry) => entry.path).join(", ")
      return {
        kind: "blocked",
        reason: `submodule を記録の版へ揃えられなかった: ${paths}${FIX_HINT}`,
      }
    }
    const moves = before.drifted.map((entry) => ({
      path: entry.path,
      from: entry.sha.slice(0, SHORT_SHA_LENGTH),
      to: (after.aligned.find((moved) => moved.path === entry.path)?.sha ?? "").slice(
        0,
        SHORT_SHA_LENGTH,
      ),
    }))
    return { kind: "aligned", moves }
  } catch (error) {
    return {
      kind: "blocked",
      reason: `submodule を揃えられなかった（${describeFailure(error)}）${FIX_HINT}`,
    }
  }
}

/** 記録の版が checkout の版の祖先で、両者が違う submodule（作業ツリーで進めて `git add` していないもの）。 */
function findAdvanced(
  root: string,
  drifted: readonly SubmoduleEntry[],
): { path: string; recorded: string; checkout: string } | undefined {
  for (const entry of drifted) {
    const recorded = execFileSync("git", ["-C", root, "rev-parse", `:${entry.path}`], {
      encoding: "utf8",
    }).trim()
    if (recorded !== entry.sha && isAncestor(path.join(root, entry.path), recorded, entry.sha)) {
      return {
        path: entry.path,
        recorded: recorded.slice(0, SHORT_SHA_LENGTH),
        checkout: entry.sha.slice(0, SHORT_SHA_LENGTH),
      }
    }
  }
  return undefined
}

/** 祖先でないときも、版が手元に無く判定できないときも false（揃える側に倒す）。 */
function isAncestor(submoduleRoot: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync(
      "git",
      ["-C", submoduleRoot, "merge-base", "--is-ancestor", ancestor, descendant],
      {
        stdio: "ignore",
      },
    )
    return true
  } catch {
    return false
  }
}

/** git の stderr の `fatal:`・`error:` の行（無ければ空でない最初の行）。stderr が無ければ例外のメッセージの1行目。 */
function describeFailure(error: unknown): string {
  if (error instanceof Error && "stderr" in error && typeof error.stderr === "string") {
    const lines = error.stderr.split("\n").filter((candidate) => candidate.trim() !== "")
    const line = lines.find((candidate) => /^(fatal|error):/.test(candidate)) ?? lines[0]
    if (line !== undefined) {
      return line.trim()
    }
  }
  return error instanceof Error ? (error.message.trim().split("\n")[0] ?? "") : String(error)
}

function readStatus(root: string): string {
  return execFileSync("git", ["-C", root, "submodule", "status"], { encoding: "utf8" })
}
