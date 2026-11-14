// 使用量の目盛りが出している値の出どころ。

/** 出している値を取ったときの終わったターンの数（`state.finishedTurnCount`）。まだ値を出していない（骨組み）なら `none`。 */
export type UsageSource =
  | { readonly kind: "none" }
  | { readonly kind: "after"; readonly finishedTurnCount: number }
