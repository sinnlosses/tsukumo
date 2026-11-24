// 触れるレポートの式の評価器。構文木を、つまみの値と `defs` で評価する。
// 誤りは例外で返さず、判別合併型（`Evaluated`）で返す。

import { FUNCTIONS, type FunctionSpec } from "./expression-function.ts"
import {
  booleanOf,
  elementAt,
  finite,
  isList,
  mapEach,
  mapPairs,
  numberAt,
  scalarOf,
  textOf,
  tooMany,
  type ExprValue,
  type Run,
  type Scalar,
} from "./expression-value.ts"
import { andThen, collect, fail, invalid, ok, type Evaluated } from "./report-evaluated.ts"
import {
  MAX_EXPRESSION_LIST_LENGTH,
  parseExpression,
  type ExprBinaryOp,
  type ExprError,
  type ExprNode,
  type ExprOrigin,
} from "./report-expression-parse.ts"

export type { ExprValue }

/** つまみの値。数のつまみは数、真偽のつまみは真偽。 */
export type ExprParams = Readonly<Record<string, number | boolean>>

export type EvalResult =
  | { readonly kind: "ok"; readonly value: ExprValue }
  | { readonly kind: "invalid"; readonly error: ExprError }

export type FormatResult =
  | { readonly kind: "ok"; readonly value: string }
  | { readonly kind: "invalid"; readonly error: ExprError }

export type ExpressionEvaluator = {
  /** 式 1 つを評価する。`defs` の名前だけを渡せば、その定義を評価する。 */
  readonly evaluate: (source: string) => EvalResult
  /** 文字の中の `${…}` を式の結果で埋める。 */
  readonly format: (template: string) => FormatResult
}

/** `format` の `${…}` 1 つ。`at` は `template` の中で式が始まる位置。 */
export type TemplateExpression = { readonly source: string; readonly at: number }

const TEMPLATE_PATTERN = /\$\{([^}]*)\}/g

export function templateExpressions(template: string): readonly TemplateExpression[] {
  return [...template.matchAll(TEMPLATE_PATTERN)].map((match) => ({
    source: match[1] ?? "",
    at: match.index + 2,
  }))
}

export function createExpressionEvaluator(context: {
  readonly params: ExprParams
  readonly defs: Readonly<Record<string, string>>
}): ExpressionEvaluator {
  const cache = new Map<string, ExprValue>()

  const resolveName = (name: string, at: number, run: Run): Evaluated<ExprValue> => {
    const param = Object.hasOwn(context.params, name) ? context.params[name] : undefined
    if (param !== undefined) return ok(param)
    const source = Object.hasOwn(context.defs, name) ? context.defs[name] : undefined
    if (source === undefined) {
      return fail("unknown-name", at, `無い名前です: ${name}`, run.origin)
    }
    const cached = cache.get(name)
    if (cached !== undefined) return ok(cached)
    if (run.stack.includes(name)) {
      const names = [...run.stack.slice(run.stack.indexOf(name)), name]
      return invalid({
        kind: "cycle",
        at,
        reason: `式が自分を読んでいます: ${names.join(" → ")}`,
        origin: run.origin,
        names,
      })
    }
    const origin: ExprOrigin = { where: "def", name }
    const parsed = parseExpression(source)
    if (parsed.kind === "invalid") return invalid({ ...parsed.error, origin })
    return andThen(evalNode(parsed.node, { origin, stack: [...run.stack, name] }), (value) => {
      cache.set(name, value)
      return ok(value)
    })
  }

  const evalNode = (node: ExprNode, run: Run): Evaluated<ExprValue> => {
    switch (node.kind) {
      case "literal":
        return ok(node.value)
      case "list": {
        if (node.items.length > MAX_EXPRESSION_LIST_LENGTH) return tooMany(node.at, run)
        return collect(node.items, (item) =>
          andThen(evalNode(item, run), (value) => scalarOf(value, item.at, run)),
        )
      }
      case "name":
        return resolveName(node.name, node.at, run)
      case "unary":
        return andThen(evalNode(node.operand, run), (operand) =>
          mapEach(operand, (value) => applyUnary(node.op, value, node.at, run)),
        )
      case "binary":
        return andThen(evalNode(node.left, run), (left) =>
          andThen(evalNode(node.right, run), (right) =>
            mapPairs(left, right, node.at, run, (x, y) => applyBinary(node.op, x, y, node.at, run)),
          ),
        )
      case "conditional":
        return evalConditional(node, run)
      case "call": {
        const spec = Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : undefined
        if (spec === undefined) {
          return fail("unknown-function", node.at, `無い関数です: ${node.name}`, run.origin)
        }
        if (node.args.length < spec.min || node.args.length > spec.max) {
          return invalid(arityError(node.name, spec, node.at, run.origin))
        }
        return andThen(
          collect(node.args, (argument) => evalNode(argument, run)),
          (args) => spec.run(args, { at: node.at, run }),
        )
      }
    }
  }

  const evalConditional = (
    node: Extract<ExprNode, { kind: "conditional" }>,
    run: Run,
  ): Evaluated<ExprValue> =>
    andThen(evalNode(node.cond, run), (cond) => {
      if (!isList(cond)) {
        return andThen(booleanOf(cond, node.at, run), (flag) =>
          flag ? evalNode(node.whenTrue, run) : evalNode(node.whenFalse, run),
        )
      }
      return andThen(evalNode(node.whenTrue, run), (whenTrue) =>
        andThen(evalNode(node.whenFalse, run), (whenFalse) => {
          for (const branch of [whenTrue, whenFalse]) {
            if (isList(branch) && branch.length !== cond.length) {
              return fail("length-mismatch", node.at, "並びの長さが違います", run.origin)
            }
          }
          return collect(cond, (flag, j) =>
            andThen(booleanOf(flag, node.at, run), (chosen) =>
              elementAt(chosen ? whenTrue : whenFalse, j, node.at, run),
            ),
          )
        }),
      )
    })

  const evaluateSource = (source: string): EvalResult => {
    const parsed = parseExpression(source)
    if (parsed.kind === "invalid") return parsed
    return evalNode(parsed.node, { origin: { where: "source" }, stack: [] })
  }

  const formatTemplate = (template: string): FormatResult => {
    const failure = templateExpressions(template)
      .map((part) => {
        const result = evaluateSource(part.source)
        return result.kind === "ok" ? undefined : { ...result.error, at: part.at + result.error.at }
      })
      .find((error) => error !== undefined)
    if (failure !== undefined) return { kind: "invalid", error: failure }
    const value = template.replace(TEMPLATE_PATTERN, (_, source: string) => {
      const result = evaluateSource(source)
      return result.kind === "ok" ? textOf(result.value) : ""
    })
    return { kind: "ok", value }
  }

  return { evaluate: evaluateSource, format: formatTemplate }
}

/** 式の名前として使えない語（関数の名前と真偽のリテラル）。 */
export const RESERVED_EXPRESSION_NAMES: ReadonlySet<string> = new Set([
  ...Object.keys(FUNCTIONS),
  "true",
  "false",
])

/**
 * 構文木を評価せずに、無い名前・無い関数・引数の数の違いを先頭から 1 つ探す。
 * `knownNames` はつまみの名前と `defs` の名前。
 */
export function staticExpressionError(
  node: ExprNode,
  knownNames: ReadonlySet<string>,
): ExprError | undefined {
  const origin: ExprOrigin = { where: "source" }
  switch (node.kind) {
    case "literal":
      return undefined
    case "name":
      return knownNames.has(node.name)
        ? undefined
        : { kind: "unknown-name", at: node.at, reason: `無い名前です: ${node.name}`, origin }
    case "list":
      return firstStaticError(node.items, knownNames)
    case "unary":
      return staticExpressionError(node.operand, knownNames)
    case "binary":
      return firstStaticError([node.left, node.right], knownNames)
    case "conditional":
      return firstStaticError([node.cond, node.whenTrue, node.whenFalse], knownNames)
    case "call": {
      const spec = Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : undefined
      if (spec === undefined) {
        return {
          kind: "unknown-function",
          at: node.at,
          reason: `無い関数です: ${node.name}`,
          origin,
        }
      }
      if (node.args.length < spec.min || node.args.length > spec.max) {
        return arityError(node.name, spec, node.at, origin)
      }
      return firstStaticError(node.args, knownNames)
    }
  }
}

function firstStaticError(
  nodes: readonly ExprNode[],
  knownNames: ReadonlySet<string>,
): ExprError | undefined {
  return nodes.map((node) => staticExpressionError(node, knownNames)).find((e) => e !== undefined)
}

function arityError(name: string, spec: FunctionSpec, at: number, origin: ExprOrigin): ExprError {
  const count =
    spec.min === spec.max ? `${String(spec.min)} 個` : `${String(spec.min)}〜${String(spec.max)} 個`
  return { kind: "arity", at, reason: `${name} の引数は ${count}です`, origin }
}

function applyUnary(op: "-" | "!", value: Scalar, at: number, run: Run): Evaluated<Scalar> {
  if (op === "!") return andThen(booleanOf(value, at, run), (flag) => ok(!flag))
  if (typeof value !== "number") return fail("type", at, "「-」は数にだけ付けられます", run.origin)
  return ok(-value)
}

function applyBinary(
  op: ExprBinaryOp,
  x: Scalar,
  y: Scalar,
  at: number,
  run: Run,
): Evaluated<Scalar> {
  switch (op) {
    case "&&":
      return andThen(booleanOf(x, at, run), (left) => (left ? booleanOf(y, at, run) : ok(false)))
    case "||":
      return andThen(booleanOf(x, at, run), (left) => (left ? ok(true) : booleanOf(y, at, run)))
    case "==":
      return ok(x === y)
    case "!=":
      return ok(x !== y)
    case "<":
    case "<=":
    case ">":
    case ">=":
      return compare(op, x, y, at, run)
    case "+":
      if (typeof x === "string" || typeof y === "string") {
        return ok(`${textOf(x)}${textOf(y)}`)
      }
      return arithmetic(x, y, at, run, (a, b) => a + b)
    case "-":
      return arithmetic(x, y, at, run, (a, b) => a - b)
    case "*":
      return arithmetic(x, y, at, run, (a, b) => a * b)
    case "/":
      return arithmetic(x, y, at, run, (a, b) => a / b)
    case "%":
      return arithmetic(x, y, at, run, (a, b) => a % b)
  }
}

function arithmetic(
  x: Scalar,
  y: Scalar,
  at: number,
  run: Run,
  op: (a: number, b: number) => number,
): Evaluated<Scalar> {
  return andThen(numberAt(x, at, run), (a) =>
    andThen(numberAt(y, at, run), (b) => finite(op(a, b), at, run)),
  )
}

function compare(
  op: "<" | "<=" | ">" | ">=",
  x: Scalar,
  y: Scalar,
  at: number,
  run: Run,
): Evaluated<boolean> {
  if (typeof x === "number" && typeof y === "number") return ok(compareValues(op, x, y))
  if (typeof x === "string" && typeof y === "string") return ok(compareValues(op, x, y))
  return fail("type", at, "比べられるのは数どうしか文字どうしです", run.origin)
}

function compareValues<T extends number | string>(
  op: "<" | "<=" | ">" | ">=",
  x: T,
  y: T,
): boolean {
  switch (op) {
    case "<":
      return x < y
    case "<=":
      return x <= y
    case ">":
      return x > y
    case ">=":
      return x >= y
  }
}
