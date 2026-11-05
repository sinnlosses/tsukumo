// 式の評価の途中の結果。失敗は例外にせず、再帰の戻り値で運ぶ。

import type { ExprError, ExprErrorKind, ExprOrigin } from "./report-expression-parse.ts"

export type Evaluated<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "invalid"; readonly error: ExprError }

export function ok<T>(value: T): Evaluated<T> {
  return { kind: "ok", value }
}

export function invalid(error: ExprError): Evaluated<never> {
  return { kind: "invalid", error }
}

export function fail(
  kind: ExprErrorKind,
  at: number,
  reason: string,
  origin: ExprOrigin,
): Evaluated<never> {
  return invalid({ kind, at, reason, origin })
}

/** 成功なら次へ進み、失敗ならその失敗をそのまま返す。 */
export function andThen<A, B>(
  result: Evaluated<A>,
  next: (value: A) => Evaluated<B>,
): Evaluated<B> {
  return result.kind === "ok" ? next(result.value) : result
}

/** 先頭から順に評価し、最初の失敗で止める。 */
export function collect<A, B>(
  items: readonly A[],
  op: (item: A, index: number) => Evaluated<B>,
): Evaluated<readonly B[]> {
  const values: B[] = []
  for (const [index, item] of items.entries()) {
    const result = op(item, index)
    if (result.kind === "invalid") return result
    values.push(result.value)
  }
  return ok(values)
}
