import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  arrayField,
  descendants,
  objectField,
  stringField,
  type AstNode,
} from "../../scripts/shared/ast-node.ts"
import { astNumber } from "./ast-node.ts"
import { listSourceFiles, parseSourceProgram, SRC_ROOT } from "./source-file.ts"

// 条件付きの描画は `{条件 && <部品 />}` で書き、JSX の子に `{条件 ? <部品 /> : null}` を書かない
// （docs/coding-standards/react.md「条件付きの描画は `&&` で書く」）。属性の値と JSX の外の三項は見ない。
describe("JSX の子の三項", () => {
  it("src/browser の *.tsx で、片方の枝が null の三項を JSX の子に書かない", () => {
    const browserRoot = `${SRC_ROOT}/browser`
    const offenders = listSourceFiles(browserRoot, browserRoot, [".tsx"]).flatMap((relPath) =>
      nullBranchLines(readFileSync(`${browserRoot}/${relPath}`, "utf8")).map(
        (line) => `src/browser/${relPath}:${line}`,
      ),
    )

    expect(offenders).toEqual([])
  })

  it.each([
    ["真の枝が部品で偽の枝が null", "const a = <div>{ok ? <b /> : null}</div>", [1]],
    ["真の枝が null", "const a = <div>{ok ? null : <b />}</div>", [1]],
    ["断片の子", "const a = <>{ok ? <b /> : null}</>", [1]],
    [
      "入れ子の子の行番号",
      "const a = (\n  <div>\n    <p>{ok ? <b /> : null}</p>\n  </div>\n)",
      [3],
    ],
    ["三項の連鎖の最後が null", "const a = <div>{ok ? <b /> : other ? <d /> : null}</div>", [1]],
    ["&& の中の三項", "const a = <div>{ok && (other ? <d /> : null)}</div>", [1]],
    ["括弧の中の三項", "const a = <div>{(ok ? <b /> : null)}</div>", [1]],
  ])("見本を拾う: %s", (_name, source, lines) => {
    expect(nullBranchLines(source)).toEqual(lines)
  })

  it.each([
    ["両方の枝が部品", "const a = <div>{ok ? <b /> : <c />}</div>"],
    ["&& で書く", "const a = <div>{ok && <b />}</div>"],
    ["属性の値の三項", "const a = <div title={ok ? 'x' : null} />"],
    ["JSX の外の三項", "function f() { return ok ? <b /> : null }"],
    ["null でない枝", "const a = <div>{ok ? <b /> : undefined}</div>"],
  ])("見本を拾わない: %s", (_name, source) => {
    expect(nullBranchLines(source)).toEqual([])
  })
})

function nullBranchLines(source: string): readonly number[] {
  return descendants(parseSourceProgram(source))
    .filter(
      (node) =>
        stringField(node, "type") === "JSXElement" || stringField(node, "type") === "JSXFragment",
    )
    .flatMap((element) => arrayField(element, "children"))
    .filter((child) => stringField(child, "type") === "JSXExpressionContainer")
    .flatMap((container) => nullBranchConditionals(objectField(container, "expression")))
    .map((conditional) => lineOf(source, astNumber(conditional, "start") ?? 0))
}

// 子の式から、三項・`&&` / `||` / `??`・括弧の中をたどり、片方の枝が null の三項を集める。
// 中の JSX の要素には入らない（その子は呼ぶ側が別に見る）。
function nullBranchConditionals(expression: AstNode | undefined): readonly AstNode[] {
  if (expression === undefined) {
    return []
  }
  switch (stringField(expression, "type")) {
    case "ConditionalExpression": {
      const consequent = objectField(expression, "consequent")
      const alternate = objectField(expression, "alternate")
      return [
        ...(isNullLiteral(consequent) || isNullLiteral(alternate) ? [expression] : []),
        ...nullBranchConditionals(consequent),
        ...nullBranchConditionals(alternate),
      ]
    }
    case "LogicalExpression":
      return [
        ...nullBranchConditionals(objectField(expression, "left")),
        ...nullBranchConditionals(objectField(expression, "right")),
      ]
    case "ParenthesizedExpression":
      return nullBranchConditionals(objectField(expression, "expression"))
    default:
      return []
  }
}

function isNullLiteral(node: object | undefined): boolean {
  return stringField(node, "type") === "Literal" && stringField(node, "raw") === "null"
}

function lineOf(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length
}
