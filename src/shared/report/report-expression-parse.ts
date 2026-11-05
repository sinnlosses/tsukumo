const MAX_EXPRESSION_LENGTH = 200
export const MAX_EXPRESSION_LIST_LENGTH = 101
export const MAX_EXPRESSION_DEFS = 20

export type ExprOrigin = { where: "source" } | { where: "def"; name: string }

export type ExprErrorKind =
  | "too-long"
  | "unreadable-char"
  | "unexpected-end"
  | "unexpected-token"
  | "trailing"
  | "unknown-name"
  | "unknown-function"
  | "arity"
  | "type"
  | "length-mismatch"
  | "out-of-range"
  | "too-many-items"
  | "not-finite"

export type ExprError =
  | { kind: ExprErrorKind; at: number; reason: string; origin: ExprOrigin }
  | { kind: "cycle"; at: number; reason: string; origin: ExprOrigin; names: readonly string[] }

export type ExprBinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "&&"
  | "||"

export type ExprNode =
  | { kind: "literal"; value: number | string | boolean; at: number }
  | { kind: "list"; items: readonly ExprNode[]; at: number }
  | { kind: "name"; name: string; at: number }
  | { kind: "unary"; op: "-" | "!"; operand: ExprNode; at: number }
  | { kind: "binary"; op: ExprBinaryOp; left: ExprNode; right: ExprNode; at: number }
  | { kind: "conditional"; cond: ExprNode; whenTrue: ExprNode; whenFalse: ExprNode; at: number }
  | { kind: "call"; name: string; args: readonly ExprNode[]; at: number }

export type ParseResult = { ok: true; node: ExprNode } | { ok: false; error: ExprError }

export type ExprReferences = { names: readonly string[]; functions: readonly string[] }

type Token =
  | { type: "num"; value: number; at: number }
  | { type: "str"; value: string; at: number }
  | { type: "id"; value: string; at: number }
  | { type: "op"; value: string; at: number }

type TokenizeResult = { ok: true; tokens: readonly Token[] } | { ok: false; error: ExprError }
type Step<T> = { ok: true; value: T; next: number } | { ok: false; error: ExprError }

const TOKEN_PATTERN =
  /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*")|([A-Za-z_]\w*)|(<=|>=|==|!=|&&|\|\||[-+*/%<>!?:(),[\]]))/y

const BINARY_LEVELS: readonly (readonly ExprBinaryOp[])[] = [
  ["||"],
  ["&&"],
  ["==", "!="],
  ["<", "<=", ">", ">="],
  ["+", "-"],
  ["*", "/", "%"],
]

const STRING_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  n: "\n",
  t: "\t",
}

export function parseExpression(source: string): ParseResult {
  if (source.length > MAX_EXPRESSION_LENGTH) {
    return fail(
      "too-long",
      MAX_EXPRESSION_LENGTH,
      `式は ${MAX_EXPRESSION_LENGTH} 字までです（${source.length} 字）`,
    )
  }
  const lexed = tokenize(source)
  if (!lexed.ok) return lexed
  const tokens = lexed.tokens
  const endAt = source.length

  const opAt = (i: number, values: readonly string[]): string | undefined => {
    const token = tokens[i]
    return token !== undefined && token.type === "op" && values.includes(token.value)
      ? token.value
      : undefined
  }

  const expect = (i: number, value: string): Step<undefined> => {
    const token = tokens[i]
    if (token === undefined) return failStep("unexpected-end", endAt, `「${value}」が要ります`)
    if (token.type !== "op" || token.value !== value) {
      return failStep("unexpected-token", token.at, `「${value}」が要ります`)
    }
    return { ok: true, value: undefined, next: i + 1 }
  }

  const conditional = (i: number): Step<ExprNode> => {
    const cond = binary(0, i)
    if (!cond.ok || opAt(cond.next, ["?"]) === undefined) return cond
    const whenTrue = conditional(cond.next + 1)
    if (!whenTrue.ok) return whenTrue
    const colon = expect(whenTrue.next, ":")
    if (!colon.ok) return colon
    const whenFalse = conditional(colon.next)
    if (!whenFalse.ok) return whenFalse
    return {
      ok: true,
      value: {
        kind: "conditional",
        cond: cond.value,
        whenTrue: whenTrue.value,
        whenFalse: whenFalse.value,
        at: tokenAt(cond.next),
      },
      next: whenFalse.next,
    }
  }

  const tokenAt = (i: number): number => tokens[i]?.at ?? endAt

  const binary = (level: number, i: number): Step<ExprNode> => {
    const levelOps = BINARY_LEVELS[level]
    if (levelOps === undefined) return unary(i)
    const left = binary(level + 1, i)
    return left.ok ? binaryTail(level, levelOps, left.value, left.next) : left
  }

  const binaryTail = (
    level: number,
    levelOps: readonly ExprBinaryOp[],
    left: ExprNode,
    i: number,
  ): Step<ExprNode> => {
    const op = levelOps.find((candidate) => opAt(i, [candidate]) !== undefined)
    if (op === undefined) return { ok: true, value: left, next: i }
    const right = binary(level + 1, i + 1)
    if (!right.ok) return right
    const node: ExprNode = { kind: "binary", op, left, right: right.value, at: tokenAt(i) }
    return binaryTail(level, levelOps, node, right.next)
  }

  const unary = (i: number): Step<ExprNode> => {
    const op = opAt(i, ["-", "!"])
    if (op !== "-" && op !== "!") return primary(i)
    const operand = unary(i + 1)
    if (!operand.ok) return operand
    return {
      ok: true,
      value: { kind: "unary", op, operand: operand.value, at: tokenAt(i) },
      next: operand.next,
    }
  }

  const itemsUntil = (
    close: string,
    i: number,
    collected: readonly ExprNode[],
  ): Step<readonly ExprNode[]> => {
    if (collected.length === 0 && opAt(i, [close]) !== undefined) {
      return { ok: true, value: collected, next: i + 1 }
    }
    const item = conditional(i)
    if (!item.ok) return item
    const items = [...collected, item.value]
    if (opAt(item.next, [","]) !== undefined) return itemsUntil(close, item.next + 1, items)
    const closed = expect(item.next, close)
    return closed.ok ? { ok: true, value: items, next: closed.next } : closed
  }

  const primary = (i: number): Step<ExprNode> => {
    const token = tokens[i]
    if (token === undefined) return failStep("unexpected-end", endAt, "式が途中で終わっています")
    if (token.type === "num" || token.type === "str") {
      return { ok: true, value: { kind: "literal", value: token.value, at: token.at }, next: i + 1 }
    }
    if (token.type === "id") return identifier(token, i)
    if (token.value === "(") {
      const inner = conditional(i + 1)
      if (!inner.ok) return inner
      const closed = expect(inner.next, ")")
      return closed.ok ? { ok: true, value: inner.value, next: closed.next } : closed
    }
    if (token.value === "[") {
      const items = itemsUntil("]", i + 1, [])
      if (!items.ok) return items
      return {
        ok: true,
        value: { kind: "list", items: items.value, at: token.at },
        next: items.next,
      }
    }
    return failStep("unexpected-token", token.at, `ここに「${token.value}」は置けません`)
  }

  const identifier = (token: Token & { type: "id" }, i: number): Step<ExprNode> => {
    if (token.value === "true" || token.value === "false") {
      return {
        ok: true,
        value: { kind: "literal", value: token.value === "true", at: token.at },
        next: i + 1,
      }
    }
    if (opAt(i + 1, ["("]) === undefined) {
      return { ok: true, value: { kind: "name", name: token.value, at: token.at }, next: i + 1 }
    }
    const args = itemsUntil(")", i + 2, [])
    if (!args.ok) return args
    return {
      ok: true,
      value: { kind: "call", name: token.value, args: args.value, at: token.at },
      next: args.next,
    }
  }

  const tree = conditional(0)
  if (!tree.ok) return tree
  const rest = tokens[tree.next]
  if (rest !== undefined) {
    return fail("trailing", rest.at, `式の終わりのあとに「${rest.value}」が余っています`)
  }
  return { ok: true, node: tree.value }
}

export function collectExpressionReferences(node: ExprNode): ExprReferences {
  const found = collect(node)
  return { names: [...new Set(found.names)], functions: [...new Set(found.functions)] }
}

function collect(node: ExprNode): { names: readonly string[]; functions: readonly string[] } {
  switch (node.kind) {
    case "literal":
      return { names: [], functions: [] }
    case "name":
      return { names: [node.name], functions: [] }
    case "list":
      return merge(node.items.map(collect))
    case "unary":
      return collect(node.operand)
    case "binary":
      return merge([collect(node.left), collect(node.right)])
    case "conditional":
      return merge([collect(node.cond), collect(node.whenTrue), collect(node.whenFalse)])
    case "call": {
      const inner = merge(node.args.map(collect))
      return { names: inner.names, functions: [node.name, ...inner.functions] }
    }
  }
}

function merge(parts: readonly { names: readonly string[]; functions: readonly string[] }[]): {
  names: readonly string[]
  functions: readonly string[]
} {
  return {
    names: parts.flatMap((part) => part.names),
    functions: parts.flatMap((part) => part.functions),
  }
}

function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = []
  let pos = 0
  while (pos < source.length) {
    if (/^\s*$/.test(source.slice(pos))) break
    TOKEN_PATTERN.lastIndex = pos
    const match = TOKEN_PATTERN.exec(source)
    if (match === null) {
      const at = pos + (source.slice(pos).length - source.slice(pos).trimStart().length)
      return fail("unreadable-char", at, `読めない字です: ${source.slice(at, at + 8)}`)
    }
    const start = TOKEN_PATTERN.lastIndex - match[0].trimStart().length
    pos = TOKEN_PATTERN.lastIndex
    const [, num, str, id, op] = match
    if (num !== undefined) tokens.push({ type: "num", value: Number(num), at: start })
    else if (str !== undefined) {
      const text = unescapeString(str.slice(1, -1))
      if (text === undefined)
        return fail("unreadable-char", start, "文字の中の「\\」の使い方が読めません")
      tokens.push({ type: "str", value: text, at: start })
    } else if (id !== undefined) tokens.push({ type: "id", value: id, at: start })
    else if (op !== undefined) tokens.push({ type: "op", value: op, at: start })
  }
  return { ok: true, tokens }
}

function unescapeString(body: string): string | undefined {
  const pairs = [...body.matchAll(/\\(.)/gs)]
  if (pairs.some((pair) => STRING_ESCAPES[pair[1] ?? ""] === undefined)) return undefined
  return body.replace(/\\(.)/gs, (_, char: string) => STRING_ESCAPES[char] ?? char)
}

function fail(kind: ExprErrorKind, at: number, reason: string): { ok: false; error: ExprError } {
  return { ok: false, error: { kind, at, reason, origin: { where: "source" } } }
}

function failStep(kind: ExprErrorKind, at: number, reason: string): Step<never> {
  return fail(kind, at, reason)
}
