// E2E ファイルの本文から、そのファイルが期待値 `test/e2e/expected/<場面>.<種類>.json` の持ち主になりうる場面の名前を集める。
// 構文木の文字列リテラルとテンプレートの頭を名前の候補にする。
// 場面の名前として使われる位置（`scenario:` の値、`openXxxRoom(run, 名前, …)` の引数）の式が、
// リテラルまで辿れると言い切れる形でなければ、そのファイルはどの場面の持ち主にもなりうるとする。

import {
  arrayField,
  type AstNode,
  descendants,
  literalString,
  objectField,
  parseProgram,
  stringField,
} from "./ast-node.ts"
import { ROOM_OPENER } from "./room-opener-name.ts"

export type ScenarioNames = {
  /** 文字列リテラル（式を含まないテンプレートも）の値。 */
  readonly names: ReadonlySet<string>
  /** `` `prefix-${x}` `` の `prefix-`。 */
  readonly prefixes: readonly string[]
  /** 名前を辿れない書き方がある。どの場面の持ち主にもなりうる。 */
  readonly open: boolean
}

/** 識別子を宣言まで辿る深さの上限。超えたら辿れないとみなす。 */
const TRACE_DEPTH = 6

export function readScenarioNames(source: string): ScenarioNames {
  const program = parseProgram("source.ts", source)
  if (program === undefined) {
    return { names: new Set(), prefixes: [], open: true }
  }
  const nodes = descendants(program)
  const heads = nodes
    .filter((node) => stringField(node, "type") === "TemplateLiteral")
    .filter((node) => arrayField(node, "expressions").length > 0)
    .map(templateHead)
  return {
    names: new Set(nodes.flatMap((node) => literalString(node) ?? [])),
    prefixes: heads.filter((head) => head !== ""),
    open: nameExpressions(nodes).some((expression) => !isTraceable(expression, nodes, TRACE_DEPTH)),
  }
}

/** 場面 `scenario` の期待値の持ち主になりうるファイル。 */
export function scenarioOwners(
  scenario: string,
  candidates: ReadonlyMap<string, ScenarioNames>,
): string[] {
  return [...candidates]
    .filter(
      ([, found]) =>
        found.open ||
        found.names.has(scenario) ||
        found.prefixes.some((prefix) => scenario.startsWith(prefix)),
    )
    .map(([file]) => file)
}

/** 場面の名前として使われる位置の式。 */
function nameExpressions(nodes: readonly AstNode[]): readonly AstNode[] {
  const localFunctions = new Set(
    nodes.filter(isFunction).flatMap((node) => functionName(node, nodes) ?? []),
  )
  return nodes.flatMap((node) => {
    if (stringField(node, "type") === "Property") {
      const key = objectField(node, "key")
      const isScenario =
        stringField(key, "name") === "scenario" || stringField(key, "value") === "scenario"
      return isScenario ? (objectField(node, "value") ?? []) : []
    }
    if (stringField(node, "type") !== "CallExpression") {
      return []
    }
    const callee = objectField(node, "callee")
    if (callee === undefined) {
      return []
    }
    const name = calleeName(callee)
    if (name === undefined || !ROOM_OPENER.test(name)) {
      return []
    }
    if (stringField(callee, "type") === "Identifier" && localFunctions.has(name)) {
      return []
    }
    const [first, second] = arrayField(node, "arguments")
    return (first !== undefined && isIdentifierNamed(first, "run") ? second : first) ?? []
  })
}

/** 式が、リテラルかテンプレートの頭まで辿れるか。 */
function isTraceable(expression: AstNode, nodes: readonly AstNode[], depth: number): boolean {
  if (depth === 0) {
    return false
  }
  switch (stringField(expression, "type")) {
    case "Literal":
      return true
    case "TemplateLiteral":
      return arrayField(expression, "expressions").length === 0 || templateHead(expression) !== ""
    case "ConditionalExpression": {
      const consequent = objectField(expression, "consequent")
      const alternate = objectField(expression, "alternate")
      return (
        consequent !== undefined &&
        alternate !== undefined &&
        isTraceable(consequent, nodes, depth - 1) &&
        isTraceable(alternate, nodes, depth - 1)
      )
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "ParenthesizedExpression": {
      const inner = objectField(expression, "expression")
      return inner !== undefined && isTraceable(inner, nodes, depth - 1)
    }
    case "Identifier": {
      const name = stringField(expression, "name")
      return name !== undefined && isIdentifierTraceable(name, nodes, depth - 1)
    }
    default:
      return false
  }
}

/** 同じファイルの `const` の初期値か関数の引数だけを辿る。`let`・`var`・再代入・import・宣言の無い名前は辿れない。 */
function isIdentifierTraceable(name: string, nodes: readonly AstNode[], depth: number): boolean {
  if (isReassignable(name, nodes)) {
    return false
  }
  const declarators = nodes.filter((node) => isDeclaratorOf(node, name))
  const functions = nodes.filter((node) => parameterIndex(node, name) !== undefined)
  if (declarators.length + functions.length === 0) {
    return false
  }
  return (
    declarators.every((declarator) => {
      const init = objectField(declarator, "init")
      return init !== undefined && isTraceable(init, nodes, depth)
    }) &&
    functions.every((fn) => isParameterTraceable(fn, parameterIndex(fn, name) ?? 0, nodes, depth))
  )
}

/** 名前のある関数なら、呼ぶ箇所の実引数を辿る。コールバックなら `.each(表)` の表がリテラルだけのときに辿れる。 */
function isParameterTraceable(
  fn: AstNode,
  index: number,
  nodes: readonly AstNode[],
  depth: number,
): boolean {
  const name = functionName(fn, nodes)
  if (name === undefined) {
    return isEachCallback(fn, nodes, depth)
  }
  return (
    isOnlyCalled(name, nodes) &&
    nodes
      .filter((node) => isCallTo(node, name))
      .every((call) => {
        const argument = arrayField(call, "arguments")[index]
        return argument !== undefined && isTraceable(argument, nodes, depth)
      })
  )
}

function isEachCallback(fn: AstNode, nodes: readonly AstNode[], depth: number): boolean {
  const call = nodes.find(
    (node) =>
      stringField(node, "type") === "CallExpression" && arrayField(node, "arguments").includes(fn),
  )
  const each = objectField(call, "callee")
  if (
    stringField(each, "type") !== "CallExpression" ||
    stringField(objectField(objectField(each, "callee"), "property"), "name") !== "each"
  ) {
    return false
  }
  const table = arrayField(each, "arguments")[0]
  return table !== undefined && isLiteralTable(table, nodes, depth)
}

/** リテラルだけでできた配列・オブジェクトか。 */
function isLiteralTable(expression: AstNode, nodes: readonly AstNode[], depth: number): boolean {
  if (depth === 0) {
    return false
  }
  switch (stringField(expression, "type")) {
    case "Literal":
      return true
    case "TemplateLiteral":
      return arrayField(expression, "expressions").length === 0
    case "ArrayExpression":
      return arrayField(expression, "elements").every((item) =>
        isLiteralTable(item, nodes, depth - 1),
      )
    case "ObjectExpression":
      return arrayField(expression, "properties").every((item) =>
        isLiteralTable(item, nodes, depth - 1),
      )
    case "Property": {
      const value = objectField(expression, "value")
      return value !== undefined && isLiteralTable(value, nodes, depth - 1)
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "ParenthesizedExpression": {
      const inner = objectField(expression, "expression")
      return inner !== undefined && isLiteralTable(inner, nodes, depth - 1)
    }
    case "Identifier": {
      const name = stringField(expression, "name")
      if (name === undefined) {
        return false
      }
      const declarators = nodes.filter((node) => isDeclaratorOf(node, name))
      return (
        !isReassignable(name, nodes) &&
        declarators.length > 0 &&
        declarators.every((declarator) => {
          const init = objectField(declarator, "init")
          return init !== undefined && isLiteralTable(init, nodes, depth - 1)
        })
      )
    }
    default:
      return false
  }
}

/** `let`・`var` で宣言されているか、代入されているか。 */
function isReassignable(name: string, nodes: readonly AstNode[]): boolean {
  return nodes.some(
    (node) =>
      (stringField(node, "type") === "AssignmentExpression" &&
        stringField(objectField(node, "left"), "name") === name) ||
      (stringField(node, "type") === "VariableDeclaration" &&
        stringField(node, "kind") !== "const" &&
        arrayField(node, "declarations").some((declarator) => isDeclaratorOf(declarator, name))),
  )
}

/** 関数の名前が、呼ぶ位置（callee）以外に現れないか（別名や値渡しをしていないか）。宣言の1つ分を数に入れる。 */
function isOnlyCalled(name: string, nodes: readonly AstNode[]): boolean {
  const mentions = nodes.filter(
    (node) => stringField(node, "type") === "Identifier" && stringField(node, "name") === name,
  )
  return mentions.length === nodes.filter((node) => isCallTo(node, name)).length + 1
}

function isCallTo(node: AstNode, name: string): boolean {
  const callee = objectField(node, "callee")
  return (
    stringField(node, "type") === "CallExpression" &&
    stringField(callee, "type") === "Identifier" &&
    stringField(callee, "name") === name
  )
}

function isDeclaratorOf(node: AstNode, name: string): boolean {
  return (
    stringField(node, "type") === "VariableDeclarator" &&
    stringField(objectField(node, "id"), "name") === name
  )
}

function calleeName(callee: AstNode): string | undefined {
  return stringField(callee, "type") === "MemberExpression"
    ? stringField(objectField(callee, "property"), "name")
    : stringField(callee, "name")
}

/** `fn` の名前（関数宣言、または変数に入れた関数式）。コールバックなど名前のない関数は `undefined`。 */
function functionName(fn: AstNode, nodes: readonly AstNode[]): string | undefined {
  if (stringField(fn, "type") === "FunctionDeclaration") {
    return stringField(objectField(fn, "id"), "name")
  }
  const holder = nodes.find(
    (node) =>
      stringField(node, "type") === "VariableDeclarator" && objectField(node, "init") === fn,
  )
  return stringField(objectField(holder, "id"), "name")
}

function isFunction(node: AstNode): boolean {
  const type = stringField(node, "type")
  return (
    type !== undefined &&
    ["FunctionDeclaration", "ArrowFunctionExpression", "FunctionExpression"].includes(type)
  )
}

function parameterIndex(fn: AstNode, name: string): number | undefined {
  if (!isFunction(fn)) {
    return undefined
  }
  const index = arrayField(fn, "params").findIndex((param) => {
    const target =
      stringField(param, "type") === "AssignmentPattern" ? objectField(param, "left") : param
    return stringField(target, "name") === name
  })
  return index === -1 ? undefined : index
}

function isIdentifierNamed(node: AstNode, name: string): boolean {
  return stringField(node, "type") === "Identifier" && stringField(node, "name") === name
}

function templateHead(template: object): string {
  return stringField(objectField(arrayField(template, "quasis")[0], "value"), "cooked") ?? ""
}
