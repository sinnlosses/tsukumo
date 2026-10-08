// 取り込み・検証・送り出しの順序とやり直しの上限という概念を持つ。`git`・`pnpm run check`
// そのものは呼ばず、呼び出し元が渡す `ShipPlanHooks` だけを呼ぶ。

export type ShipPlanHooks = {
  readonly isOwnWorktreeClean: () => boolean
  readonly isMainWorktreeClean: () => boolean
  readonly rebaseOntoMain: () => "ok" | "conflict"
  readonly verify: () => number
  readonly mergeFfOnly: () => "ok" | "not-fast-forward"
}

export type ShipPlanResult =
  | { readonly outcome: "ok" }
  | { readonly outcome: "own-worktree-dirty" }
  | { readonly outcome: "main-worktree-dirty" }
  | { readonly outcome: "rebase-conflict" }
  | { readonly outcome: "verify-failed"; readonly status: number }
  | { readonly outcome: "merge-ff-only-exhausted"; readonly attempts: number }

const DEFAULT_MAX_RETRIES = 2

/**
 * {@link ShipPlanHooks} を決まった順で呼び、`--ff-only` が先回りで落ちたら `maxRetries` 回まで
 * 取り込みと検証をやり直す。 */
export function runShipPlan(
  hooks: ShipPlanHooks,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): ShipPlanResult {
  if (!hooks.isOwnWorktreeClean()) {
    return { outcome: "own-worktree-dirty" }
  }
  if (!hooks.isMainWorktreeClean()) {
    return { outcome: "main-worktree-dirty" }
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
      return { outcome: "ok" }
    }

    if (attempt >= maxRetries) {
      return { outcome: "merge-ff-only-exhausted", attempts: attempt }
    }
  }
}
