import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  arrayField,
  descendants,
  objectField,
  stringField,
  type AstNode,
} from "../../scripts/shared/ast-node.ts"
import { listSourceFiles, parseSourceProgram, SRC_ROOT } from "./source-file.ts"

// schema の `.refine((v) => parseX(v) !== undefined)` は、検査はしても出力の型が入力のまま（string）になり、
// parseX が返すブランド型を捨てる。ブランド型は `.refine(isX)`（型ガード）で渡す。
// 許可するのは、parseX の戻り値が検査済みの構造（画像）で、ブランド型ではないもの。
// キーは "src からの相対パス#parse の関数名"、値は件数。
const ALLOWED: Readonly<Record<string, { readonly count: number; readonly reason: string }>> = {
  "shared/contract/item.ts#parseItemImage": { count: 1, reason: "戻り値は画像の構造" },
  "shared/contract/session.ts#parsePromptImage": { count: 1, reason: "戻り値は画像の構造" },
  "shared/contract/session.ts#parsePromptImageThumbnail": {
    count: 1,
    reason: "戻り値は画像の構造",
  },
  "shared/contract/character-pack.ts#parsePortraitImage": {
    count: 1,
    reason: "戻り値は画像の構造",
  },
  "shared/contract/character-pack.ts#parseBackgroundImage": {
    count: 1,
    reason: "戻り値は画像の構造",
  },
  "shared/contract/character-pack.ts#parseFaceImage": { count: 1, reason: "戻り値は画像の構造" },
  "shared/contract/character-pack.ts#parseMiniImage": { count: 1, reason: "戻り値は画像の構造" },
  "shared/contract/character-pack.ts#parsePromptImage": {
    count: 1,
    reason: "戻り値は画像の構造",
  },
}

describe("ブランド型を落とす refine", () => {
  it("src の refine は parse…(…) !== undefined だけの形を、許可の件数を超えて持たない", () => {
    const counts: Record<string, number> = {}
    for (const relPath of listSourceFiles(SRC_ROOT)) {
      for (const name of discardingParseNames(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))) {
        const key = `${relPath}#${name}`
        counts[key] = (counts[key] ?? 0) + 1
      }
    }
    expect(brandSchemaProblems(counts)).toEqual([])
  })

  it.each([
    ["アロー関数の式", "z.string().refine((v) => parseThing(v) !== undefined)", ["parseThing"]],
    [
      "ブロック本体の return",
      "z.string().refine((v) => { return parseThing(v) !== undefined })",
      ["parseThing"],
    ],
  ])("落ちる入力を拾う: %s", (_name, source, names) => {
    expect(discardingParseNames(source)).toEqual(names)
  })

  it.each([
    ["型ガードを渡す", "z.string().refine(isThing)"],
    ["戻り値を比べる形ではない", "z.string().refine((v) => parseThing(v) === v)"],
    ["別の条件と合わせる", 'z.string().refine((v) => v === "" || parseThing(v) !== undefined)'],
    ["parse で始まらない関数", "z.string().refine((v) => readThing(v) !== undefined)"],
  ])("拾わない: %s", (_name, source) => {
    expect(discardingParseNames(source)).toEqual([])
  })

  it("許可の外の件数は問題として返す", () => {
    expect(brandSchemaProblems({ "shared/x.ts#parseThing": 1 })).toHaveLength(1)
  })
})

function brandSchemaProblems(counts: Readonly<Record<string, number>>): readonly string[] {
  return Object.entries(counts).flatMap(([key, count]) => {
    const allowed = ALLOWED[key]?.count ?? 0
    return count > allowed
      ? [
          `${key} が ${count} 件。戻り値がブランド型なら述語の関数（\`value is X\`）を作って \`.refine(isX)\` に渡す。検査済みの構造を返すだけなら ALLOWED に理由つきで足す`,
        ]
      : []
  })
}

function discardingParseNames(source: string): readonly string[] {
  return descendants(parseSourceProgram(source, "sample.ts"))
    .filter(isRefineCall)
    .flatMap((call) => {
      const callback = arrayField(call, "arguments")[0]
      const expression = callbackExpression(callback)
      return expression === undefined ? [] : parseNameCompared(expression)
    })
}

function isRefineCall(node: AstNode): boolean {
  if (stringField(node, "type") !== "CallExpression") {
    return false
  }
  const callee = objectField(node, "callee")
  return (
    stringField(callee, "type") === "MemberExpression" &&
    stringField(objectField(callee, "property"), "name") === "refine"
  )
}

function callbackExpression(callback?: AstNode): AstNode | undefined {
  if (stringField(callback, "type") !== "ArrowFunctionExpression") {
    return undefined
  }
  const body = objectField(callback, "body")
  if (stringField(body, "type") !== "BlockStatement") {
    return body
  }
  const statements = arrayField(body, "body")
  const only = statements.length === 1 ? statements[0] : undefined
  return stringField(only, "type") === "ReturnStatement" ? objectField(only, "argument") : undefined
}

function parseNameCompared(expression: AstNode): readonly string[] {
  if (
    stringField(expression, "type") !== "BinaryExpression" ||
    stringField(expression, "operator") !== "!==" ||
    stringField(objectField(expression, "right"), "name") !== "undefined"
  ) {
    return []
  }
  const left = objectField(expression, "left")
  const name =
    stringField(left, "type") === "CallExpression"
      ? stringField(objectField(left, "callee"), "name")
      : undefined
  return name?.startsWith("parse") === true ? [name] : []
}
