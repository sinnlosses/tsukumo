// 触れるレポートの式の評価器。構文木を、つまみの値と `defs` で評価する。
// 誤りは例外で返さず、判別合併型で返す（内側の `EvaluationFailure` はこのファイルの外へ出さない）。

import { zip } from "remeda"

import {
  MAX_EXPRESSION_LIST_LENGTH,
  parseExpression,
  type ExprBinaryOp,
  type ExprError,
  type ExprErrorKind,
  type ExprNode,
  type ExprOrigin,
} from "./report-expression-parse.ts"

type Scalar = number | string | boolean

export type ExprValue = Scalar | readonly Scalar[]

/** つまみの値。数のつまみは数、真偽のつまみは真偽。 */
export type ExprParams = Readonly<Record<string, number | boolean>>

export type EvalResult =
  | { readonly ok: true; readonly value: ExprValue }
  | { readonly ok: false; readonly error: ExprError }

export type FormatResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: ExprError }

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

  const resolveName = (name: string, at: number, run: Run): ExprValue => {
    const param = Object.hasOwn(context.params, name) ? context.params[name] : undefined
    if (param !== undefined) return param
    const source = Object.hasOwn(context.defs, name) ? context.defs[name] : undefined
    if (source === undefined) {
      return fail("unknown-name", at, `無い名前です: ${name}`, run.origin)
    }
    const cached = cache.get(name)
    if (cached !== undefined) return cached
    if (run.stack.includes(name)) {
      const names = [...run.stack.slice(run.stack.indexOf(name)), name]
      throw new EvaluationFailure({
        kind: "cycle",
        at,
        reason: `式が自分を読んでいます: ${names.join(" → ")}`,
        origin: run.origin,
        names,
      })
    }
    const origin: ExprOrigin = { where: "def", name }
    const parsed = parseExpression(source)
    if (!parsed.ok) throw new EvaluationFailure({ ...parsed.error, origin })
    const value = evalNode(parsed.node, { origin, stack: [...run.stack, name] })
    cache.set(name, value)
    return value
  }

  const evalNode = (node: ExprNode, run: Run): ExprValue => {
    switch (node.kind) {
      case "literal":
        return node.value
      case "list": {
        if (node.items.length > MAX_EXPRESSION_LIST_LENGTH) return tooMany(node.at, run)
        return node.items.map((item) => scalarOf(evalNode(item, run), item.at, run))
      }
      case "name":
        return resolveName(node.name, node.at, run)
      case "unary": {
        const operand = evalNode(node.operand, run)
        return mapEach(operand, (value) => applyUnary(node.op, value, node.at, run))
      }
      case "binary": {
        const left = evalNode(node.left, run)
        const right = evalNode(node.right, run)
        return mapPairs(left, right, node.at, run, (x, y) =>
          applyBinary(node.op, x, y, node.at, run),
        )
      }
      case "conditional":
        return evalConditional(node, run)
      case "call": {
        const spec = Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : undefined
        if (spec === undefined) {
          return fail("unknown-function", node.at, `無い関数です: ${node.name}`, run.origin)
        }
        if (node.args.length < spec.min || node.args.length > spec.max) {
          return arityFail(node.name, spec, node.at, run.origin)
        }
        const args = node.args.map((argument) => evalNode(argument, run))
        return spec.run(args, { at: node.at, run })
      }
    }
  }

  const evalConditional = (
    node: Extract<ExprNode, { kind: "conditional" }>,
    run: Run,
  ): ExprValue => {
    const cond = evalNode(node.cond, run)
    if (!isList(cond)) {
      const flag = booleanOf(cond, node.at, run)
      return flag ? evalNode(node.whenTrue, run) : evalNode(node.whenFalse, run)
    }
    const whenTrue = evalNode(node.whenTrue, run)
    const whenFalse = evalNode(node.whenFalse, run)
    for (const branch of [whenTrue, whenFalse]) {
      if (isList(branch) && branch.length !== cond.length) {
        return fail("length-mismatch", node.at, "並びの長さが違います", run.origin)
      }
    }
    return cond.map((flag, j) =>
      elementAt(booleanOf(flag, node.at, run) ? whenTrue : whenFalse, j, node.at, run),
    )
  }

  const evaluateSource = (source: string): EvalResult => {
    const parsed = parseExpression(source)
    if (!parsed.ok) return parsed
    try {
      return { ok: true, value: evalNode(parsed.node, { origin: { where: "source" }, stack: [] }) }
    } catch (thrown) {
      if (thrown instanceof EvaluationFailure) return { ok: false, error: thrown.detail }
      throw thrown
    }
  }

  const formatTemplate = (template: string): FormatResult => {
    const failure = templateExpressions(template)
      .map((part) => {
        const result = evaluateSource(part.source)
        return result.ok ? undefined : { ...result.error, at: part.at + result.error.at }
      })
      .find((error) => error !== undefined)
    if (failure !== undefined) return { ok: false, error: failure }
    const value = template.replace(TEMPLATE_PATTERN, (_, source: string) => {
      const result = evaluateSource(source)
      return result.ok ? textOf(result.value) : ""
    })
    return { ok: true, value }
  }

  return { evaluate: evaluateSource, format: formatTemplate }
}

type FunctionSpec = {
  readonly min: number
  readonly max: number
  readonly run: (args: readonly ExprValue[], site: Site) => ExprValue
}

type Site = { readonly at: number; readonly run: Run }

type Run = { readonly origin: ExprOrigin; readonly stack: readonly string[] }

class EvaluationFailure extends Error {
  readonly detail: ExprError

  constructor(detail: ExprError) {
    super(detail.reason)
    this.detail = detail
  }
}

const FUNCTIONS: Readonly<Record<string, FunctionSpec>> = {
  range: {
    min: 2,
    max: 2,
    run: (args, site) => {
      const start = integerOf(arg(args, 0, site), site)
      const end = integerOf(arg(args, 1, site), site)
      if (end < start)
        return fail("out-of-range", site.at, "range は from が to 以下です", site.run.origin)
      if (end - start + 1 > MAX_EXPRESSION_LIST_LENGTH) return tooMany(site.at, site.run)
      return Array.from({ length: end - start + 1 }, (_, j) => start + j)
    },
  },
  min: {
    min: 2,
    max: 2,
    run: (args, site) =>
      mapPairs(arg(args, 0, site), arg(args, 1, site), site.at, site.run, (x, y) =>
        Math.min(numberOf(x, site), numberOf(y, site)),
      ),
  },
  max: {
    min: 2,
    max: 2,
    run: (args, site) =>
      mapPairs(arg(args, 0, site), arg(args, 1, site), site.at, site.run, (x, y) =>
        Math.max(numberOf(x, site), numberOf(y, site)),
      ),
  },
  round: {
    min: 1,
    max: 2,
    run: (args, site) =>
      mapPairs(arg(args, 0, site), args[1] ?? 0, site.at, site.run, (value, d) => {
        const scale = 10 ** digitsOf(d, site)
        return Math.round(numberOf(value, site) * scale) / scale
      }),
  },
  fixed: {
    min: 2,
    max: 2,
    run: (args, site) =>
      mapPairs(arg(args, 0, site), arg(args, 1, site), site.at, site.run, (value, d) =>
        numberOf(value, site).toFixed(digitsOf(d, site)),
      ),
  },
  sum: {
    min: 1,
    max: 1,
    run: (args, site) =>
      numbersOf(arg(args, 0, site), site).reduce((total, value) => total + value, 0),
  },
  len: { min: 1, max: 1, run: (args, site) => listOf(arg(args, 0, site), site).length },
  minOf: {
    min: 1,
    max: 1,
    run: (args, site) => Math.min(...nonEmptyNumbers(arg(args, 0, site), site)),
  },
  maxOf: {
    min: 1,
    max: 1,
    run: (args, site) => Math.max(...nonEmptyNumbers(arg(args, 0, site), site)),
  },
  argmin: {
    min: 1,
    max: 1,
    run: (args, site) => {
      const values = nonEmptyNumbers(arg(args, 0, site), site)
      return values.indexOf(Math.min(...values))
    },
  },
  argmax: {
    min: 1,
    max: 1,
    run: (args, site) => {
      const values = nonEmptyNumbers(arg(args, 0, site), site)
      return values.indexOf(Math.max(...values))
    },
  },
  at: {
    min: 2,
    max: 2,
    run: (args, site) => {
      const items = listOf(arg(args, 0, site), site)
      const position = integerOf(arg(args, 1, site), site)
      const item = items[position]
      if (position < 0 || item === undefined) {
        return fail("out-of-range", site.at, "at の位置が並びの外です", site.run.origin)
      }
      return item
    },
  },
  text: {
    min: 1,
    max: 2,
    run: (args, site) => {
      const suffix = args[1]
      const tail = suffix === undefined ? "" : textOf(suffix)
      return numbersOf(arg(args, 0, site), site).map((value) => `${numberText(value)}${tail}`)
    },
  },
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

function arityFail(name: string, spec: FunctionSpec, at: number, origin: ExprOrigin): never {
  throw new EvaluationFailure(arityError(name, spec, at, origin))
}

function fail(kind: ExprErrorKind, at: number, reason: string, origin: ExprOrigin): never {
  throw new EvaluationFailure({ kind, at, reason, origin })
}

function arg(args: readonly ExprValue[], index: number, site: Site): ExprValue {
  return args[index] ?? fail("arity", site.at, "引数が足りません", site.run.origin)
}

function tooMany(at: number, run: Run): never {
  return fail(
    "too-many-items",
    at,
    `並びは ${String(MAX_EXPRESSION_LIST_LENGTH)} 個までです`,
    run.origin,
  )
}

function isList(value: ExprValue): value is readonly Scalar[] {
  return Array.isArray(value)
}

function elementAt(value: ExprValue, index: number, at: number, run: Run): Scalar {
  if (!isList(value)) return value
  return value[index] ?? fail("length-mismatch", at, "並びの長さが違います", run.origin)
}

function mapEach(value: ExprValue, op: (item: Scalar) => Scalar): ExprValue {
  return isList(value) ? value.map(op) : op(value)
}

function mapPairs(
  a: ExprValue,
  b: ExprValue,
  at: number,
  run: Run,
  op: (x: Scalar, y: Scalar) => Scalar,
): ExprValue {
  if (isList(a)) {
    if (isList(b)) {
      if (a.length !== b.length) {
        return fail("length-mismatch", at, "並びの長さが違います", run.origin)
      }
      return zip(a, b).map(([x, y]) => op(x, y))
    }
    return a.map((x) => op(x, b))
  }
  if (isList(b)) return b.map((y) => op(a, y))
  return op(a, b)
}

function scalarOf(value: ExprValue, at: number, run: Run): Scalar {
  if (isList(value)) return fail("type", at, "並びの中に並びは置けません", run.origin)
  return value
}

function booleanOf(value: Scalar, at: number, run: Run): boolean {
  return typeof value === "boolean"
    ? value
    : fail("type", at, "真偽が要るところに真偽でない値があります", run.origin)
}

function applyUnary(op: "-" | "!", value: Scalar, at: number, run: Run): Scalar {
  if (op === "!") return !booleanOf(value, at, run)
  if (typeof value !== "number") return fail("type", at, "「-」は数にだけ付けられます", run.origin)
  return -value
}

function applyBinary(op: ExprBinaryOp, x: Scalar, y: Scalar, at: number, run: Run): Scalar {
  switch (op) {
    case "&&":
      return booleanOf(x, at, run) && booleanOf(y, at, run)
    case "||":
      return booleanOf(x, at, run) || booleanOf(y, at, run)
    case "==":
      return x === y
    case "!=":
      return x !== y
    case "<":
    case "<=":
    case ">":
    case ">=":
      return compare(op, x, y, at, run)
    case "+":
      if (typeof x === "string" || typeof y === "string") {
        return `${textOf(x)}${textOf(y)}`
      }
      return finite(numberAt(x, at, run) + numberAt(y, at, run), at, run)
    case "-":
      return finite(numberAt(x, at, run) - numberAt(y, at, run), at, run)
    case "*":
      return finite(numberAt(x, at, run) * numberAt(y, at, run), at, run)
    case "/":
      return finite(numberAt(x, at, run) / numberAt(y, at, run), at, run)
    case "%":
      return finite(numberAt(x, at, run) % numberAt(y, at, run), at, run)
  }
}

function compare(op: "<" | "<=" | ">" | ">=", x: Scalar, y: Scalar, at: number, run: Run): boolean {
  if (typeof x === "number" && typeof y === "number") return compareValues(op, x, y)
  if (typeof x === "string" && typeof y === "string") return compareValues(op, x, y)
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

function numberAt(value: Scalar, at: number, run: Run): number {
  return typeof value === "number"
    ? value
    : fail("type", at, "数が要るところに数でない値があります", run.origin)
}

function finite(value: number, at: number, run: Run): number {
  return Number.isFinite(value)
    ? value
    : fail("not-finite", at, "有限でない数になります（0 での割り算など）", run.origin)
}

function numberOf(value: Scalar, site: Site): number {
  return numberAt(value, site.at, site.run)
}

function integerOf(value: ExprValue, site: Site): number {
  const scalar = scalarOf(value, site.at, site.run)
  const number = numberOf(scalar, site)
  return Number.isInteger(number)
    ? number
    : fail("type", site.at, "整数が要るところに整数でない値があります", site.run.origin)
}

function digitsOf(value: Scalar, site: Site): number {
  const digits = integerOf(value, site)
  return digits >= 0 && digits <= 20
    ? digits
    : fail("out-of-range", site.at, "桁数は 0〜20 です", site.run.origin)
}

function listOf(value: ExprValue, site: Site): readonly Scalar[] {
  return isList(value)
    ? value
    : fail("type", site.at, "並びが要るところに並びでない値があります", site.run.origin)
}

function numbersOf(value: ExprValue, site: Site): readonly number[] {
  return listOf(value, site).map((item) => numberOf(item, site))
}

function nonEmptyNumbers(value: ExprValue, site: Site): readonly number[] {
  const numbers = numbersOf(value, site)
  return numbers.length > 0
    ? numbers
    : fail("out-of-range", site.at, "空の並びです", site.run.origin)
}

/** 数を文字にする決まり。整数はそのまま、それ以外は小数 1 桁に四捨五入して末尾の 0 を落とす。 */
function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function textOf(value: ExprValue): string {
  if (isList(value)) return value.map(textOf).join(", ")
  return typeof value === "number" ? numberText(value) : String(value)
}
