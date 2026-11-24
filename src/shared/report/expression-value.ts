// 触れるレポートの式の値と、評価器と関数の表が共に使う値の変換の補助。

import { zip } from "remeda"

import { andThen, collect, fail, ok, type Evaluated } from "./report-evaluated.ts"
import { MAX_EXPRESSION_LIST_LENGTH, type ExprOrigin } from "./report-expression-parse.ts"

export type Scalar = number | string | boolean

export type ExprValue = Scalar | readonly Scalar[]

export type Run = { readonly origin: ExprOrigin; readonly stack: readonly string[] }

export type Site = { readonly at: number; readonly run: Run }

export function tooMany(at: number, run: Run): Evaluated<never> {
  return fail(
    "too-many-items",
    at,
    `並びは ${String(MAX_EXPRESSION_LIST_LENGTH)} 個までです`,
    run.origin,
  )
}

export function isList(value: ExprValue): value is readonly Scalar[] {
  return Array.isArray(value)
}

export function elementAt(
  value: ExprValue,
  index: number,
  at: number,
  run: Run,
): Evaluated<Scalar> {
  if (!isList(value)) return ok(value)
  const item = value[index]
  return item === undefined
    ? fail("length-mismatch", at, "並びの長さが違います", run.origin)
    : ok(item)
}

export function mapEach(
  value: ExprValue,
  op: (item: Scalar) => Evaluated<Scalar>,
): Evaluated<ExprValue> {
  return isList(value) ? collect(value, op) : op(value)
}

export function mapPairs(
  a: ExprValue,
  b: ExprValue,
  at: number,
  run: Run,
  op: (x: Scalar, y: Scalar) => Evaluated<Scalar>,
): Evaluated<ExprValue> {
  if (isList(a)) {
    if (isList(b)) {
      if (a.length !== b.length) {
        return fail("length-mismatch", at, "並びの長さが違います", run.origin)
      }
      return collect(zip(a, b), ([x, y]) => op(x, y))
    }
    return collect(a, (x) => op(x, b))
  }
  if (isList(b)) return collect(b, (y) => op(a, y))
  return op(a, b)
}

export function scalarOf(value: ExprValue, at: number, run: Run): Evaluated<Scalar> {
  if (isList(value)) return fail("type", at, "並びの中に並びは置けません", run.origin)
  return ok(value)
}

export function booleanOf(value: Scalar, at: number, run: Run): Evaluated<boolean> {
  return typeof value === "boolean"
    ? ok(value)
    : fail("type", at, "真偽が要るところに真偽でない値があります", run.origin)
}

export function numberAt(value: Scalar, at: number, run: Run): Evaluated<number> {
  return typeof value === "number"
    ? ok(value)
    : fail("type", at, "数が要るところに数でない値があります", run.origin)
}

export function finite(value: number, at: number, run: Run): Evaluated<number> {
  return Number.isFinite(value)
    ? ok(value)
    : fail("not-finite", at, "有限でない数になります（0 での割り算など）", run.origin)
}

export function numberOf(value: Scalar, site: Site): Evaluated<number> {
  return numberAt(value, site.at, site.run)
}

export function integerOf(value: ExprValue, site: Site): Evaluated<number> {
  return andThen(scalarOf(value, site.at, site.run), (scalar) =>
    andThen(numberOf(scalar, site), (number) =>
      Number.isInteger(number)
        ? ok(number)
        : fail("type", site.at, "整数が要るところに整数でない値があります", site.run.origin),
    ),
  )
}

export function listOf(value: ExprValue, site: Site): Evaluated<readonly Scalar[]> {
  return isList(value)
    ? ok(value)
    : fail("type", site.at, "並びが要るところに並びでない値があります", site.run.origin)
}

/** 数を文字にする決まり。整数はそのまま、それ以外は小数 1 桁に四捨五入して末尾の 0 を落とす。 */
export function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

export function textOf(value: ExprValue): string {
  if (isList(value)) return value.map(textOf).join(", ")
  return typeof value === "number" ? numberText(value) : String(value)
}
