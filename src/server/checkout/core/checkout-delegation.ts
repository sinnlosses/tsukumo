// 打った場所のチェックアウトと、いま動いている自分のチェックアウトを比べ、どちらを起こすかを決める。

/** cwd がどのチェックアウトの中にあるか。 */
export type CwdCheckout =
  | { readonly kind: "outside" }
  | {
      readonly kind: "inside"
      readonly root: string
      readonly entry: string
      readonly entryExists: boolean
    }

export type CheckoutDelegation =
  | { readonly kind: "self" }
  | { readonly kind: "delegate"; readonly entry: string }
  | { readonly kind: "mismatch"; readonly message: string }

export function decideCheckoutDelegation(
  ownRoot: string,
  cwdCheckout: CwdCheckout,
): CheckoutDelegation {
  if (cwdCheckout.kind === "outside" || cwdCheckout.root === ownRoot) {
    return { kind: "self" }
  }
  if (cwdCheckout.entryExists) {
    return { kind: "delegate", entry: cwdCheckout.entry }
  }

  return {
    kind: "mismatch",
    message: `tsukumo: ${cwdCheckout.root} の中で打たれたが、起きようとしたのは ${ownRoot}（${cwdCheckout.entry} が無いので委ねられない）`,
  }
}
