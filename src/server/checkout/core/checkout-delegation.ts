// 打った場所のチェックアウトと、いま動いている自分のチェックアウトを比べ、どちらを起こすかを決める。

const WORKTREE_LINE_PREFIX = "worktree "

/** cwd がどのチェックアウトの中にあるか。 */
export type CwdCheckout =
  | { readonly kind: "outside" }
  | {
      readonly kind: "inside"
      readonly root: string
      readonly entry: string
      readonly entryExists: boolean
      /** 根のディレクトリの持ち主が、tsukumo を起こした利用者か。 */
      readonly ownedByUser: boolean
    }

export type CheckoutDelegation =
  | { readonly kind: "self" }
  | { readonly kind: "delegate"; readonly entry: string }
  | { readonly kind: "mismatch"; readonly message: string }

/**
 * `ownWorktreeRoots` は自分のリポジトリに git が登録している作業ツリーの根（`worktreeRootsOf`）。
 * そこに無い根と利用者の持ち物でない根の `bin/tsukumo` は、他人が置いたものでありうるので起こさない。
 */
export function decideCheckoutDelegation(
  ownRoot: string,
  cwdCheckout: CwdCheckout,
  ownWorktreeRoots: readonly string[],
): CheckoutDelegation {
  if (cwdCheckout.kind === "outside" || cwdCheckout.root === ownRoot) {
    return { kind: "self" }
  }
  if (!cwdCheckout.ownedByUser || !ownWorktreeRoots.includes(cwdCheckout.root)) {
    return {
      kind: "mismatch",
      message: `tsukumo: ${cwdCheckout.root} の中で打たれたが、${ownRoot} のリポジトリに登録された利用者の持ち物の作業ツリーではないので、${cwdCheckout.entry} へは委ねない`,
    }
  }
  if (cwdCheckout.entryExists) {
    return { kind: "delegate", entry: cwdCheckout.entry }
  }

  return {
    kind: "mismatch",
    message: `tsukumo: ${cwdCheckout.root} の中で打たれたが、起きようとしたのは ${ownRoot}（${cwdCheckout.entry} が無いので委ねられない）`,
  }
}

/** `git worktree list --porcelain -z` の出力から、作業ツリーの根の絶対パスを拾う。 */
export function worktreeRootsOf(porcelain: string): readonly string[] {
  return porcelain
    .split("\0")
    .flatMap((line) =>
      line.startsWith(WORKTREE_LINE_PREFIX) ? [line.slice(WORKTREE_LINE_PREFIX.length)] : [],
    )
}
