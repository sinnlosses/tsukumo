// 受け入れ・取り込み・検証・送り出しの順序とやり直しの上限という概念を持つ。`git`・`pnpm run check`
// そのものは呼ばず、呼び出し元が渡す `ShipPlanHooks` だけを呼ぶ。

import type { ShipReviewOutcome } from "./ship-review.ts"

export type ShipPlanHooks = {
  readonly hasOpenClaim: () => boolean
  readonly isOwnWorktreeClean: () => boolean
  readonly isMainWorktreeClean: () => boolean
  readonly review: () => ShipReviewOutcome
  readonly rebaseOntoMain: () => "ok" | "conflict"
  readonly verify: () => number
  readonly mergeFfOnly: () => "ok" | "not-fast-forward"
  readonly syncSubmodules: () => void
}

export type ShipPlanResult =
  | { readonly outcome: "ok" }
  | { readonly outcome: "task-claimed" }
  | { readonly outcome: "own-worktree-dirty" }
  | { readonly outcome: "main-worktree-dirty" }
  | { readonly outcome: "review-rejected"; readonly findings: readonly string[] }
  | { readonly outcome: "review-exhausted"; readonly findings: readonly string[] }
  | { readonly outcome: "review-unavailable"; readonly reason: string }
  | { readonly outcome: "rebase-conflict" }
  | { readonly outcome: "verify-failed"; readonly status: number }
  | { readonly outcome: "merge-ff-only-exhausted"; readonly attempts: number }

const DEFAULT_MAX_RETRIES = 2

/**
 * {@link ShipPlanHooks} を決まった順で呼び、`--ff-only` が先回りで落ちたら `maxRetries` 回まで
 * 取り込みと検証をやり直す。受け入れはやり直しに含めず、最初に1回だけ呼ぶ。 */
export function runShipPlan(
  hooks: ShipPlanHooks,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): ShipPlanResult {
  if (hooks.hasOpenClaim()) {
    return { outcome: "task-claimed" }
  }
  if (!hooks.isOwnWorktreeClean()) {
    return { outcome: "own-worktree-dirty" }
  }
  if (!hooks.isMainWorktreeClean()) {
    return { outcome: "main-worktree-dirty" }
  }

  const review = hooks.review()
  switch (review.kind) {
    case "rejected":
      return { outcome: "review-rejected", findings: review.findings }
    case "exhausted":
      return { outcome: "review-exhausted", findings: review.findings }
    case "unavailable":
      return { outcome: "review-unavailable", reason: review.reason }
    case "skipped":
    case "passed":
      break
  }

  for (let attempt = 0; ; attempt += 1) {
    if (hooks.rebaseOntoMain() === "conflict") {
      return { outcome: "rebase-conflict" }
    }

    const status = hooks.verify()
    if (status !== 0) {
      return { outcome: "verify-failed", status }
    }

    if (hooks.mergeFfOnly() === "ok") {
      hooks.syncSubmodules()
      return { outcome: "ok" }
    }

    if (attempt >= maxRetries) {
      return { outcome: "merge-ff-only-exhausted", attempts: attempt }
    }
  }
}
