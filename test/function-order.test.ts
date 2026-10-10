import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { functionOrderViolations } from "./function-order.ts"

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "")
const CHECKED_ROOTS = ["src", "scripts"] as const

const check = (source: string) => functionOrderViolations("a.ts", source)

describe("src/ と scripts/ のテスト以外のソース", () => {
  it("export する関数は、export しない関数より前に並んでいる", () => {
    const files = CHECKED_ROOTS.flatMap((root) => sourceFiles(`${REPOSITORY_ROOT}/${root}`))
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((file) =>
      functionOrderViolations(file.slice(REPOSITORY_ROOT.length + 1), readFileSync(file, "utf8")),
    )

    expect(violations).toEqual([])
  })
})

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = `${dir}/${name}`
    if (statSync(fullPath).isDirectory()) {
      return sourceFiles(fullPath)
    }
    return /\.tsx?$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [fullPath] : []
  })
}

describe("export する関数は export しない関数より前に置く", () => {
  it("export の関数宣言のあとに非公開の関数宣言が来るのは通る", () => {
    expect(check("export function a() {}\nfunction b() {}\n")).toEqual([])
  })

  it("非公開の関数宣言のあとに export の関数宣言が来ると落ちる", () => {
    expect(check("function b() {}\nexport function a() {}\n")).toEqual([
      "a.ts: export の a（2 行目）が export しない b（1 行目）より後ろ",
    ])
  })

  it("const の関数も数える", () => {
    expect(check("const b = () => 1\nexport const a = async (x: number) => x\n")).toHaveLength(1)
    expect(check("const b = function () {}\nexport const a = (x) => x\n")).toHaveLength(1)
  })

  it("export default function も export として数える", () => {
    expect(check("const b = () => 1\nexport default function () {}\n")).toHaveLength(1)
  })

  it("末尾の export { f } が指す宣言は export として数える", () => {
    expect(check("function g() {}\nfunction f() {}\nexport { f }\n")).toHaveLength(1)
    expect(check("function f() {}\nfunction g() {}\nexport { f }\n")).toEqual([])
  })

  it("字下げのある関数・メソッド・包んだ関数・関数でない const・コメントは数えない", () => {
    const source = [
      "export function a() {",
      "  function inner() {}",
      "}",
      "class K {",
      "  method() {}",
      "}",
      "const wrapped = memo(function Wrapped() {})",
      "const value = 1",
      "// function commented() {}",
      "export const b = () => 1",
      "",
    ].join("\n")
    expect(check(source)).toEqual([])
  })

  it("非公開だけ・関数が無いファイルは通る", () => {
    expect(check("function a() {}\nfunction b() {}\n")).toEqual([])
    expect(check("export const X = 1\n")).toEqual([])
  })
})
