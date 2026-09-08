import { describe, expect, it } from "bun:test"

import { buildBalloon } from "../src/balloon.ts"

describe("buildBalloon", () => {
  it("発話を枠で囲んで返す", () => {
    const lines = buildBalloon("こんにちは", 20)

    expect(lines[0]?.startsWith("┌")).toBe(true)
    expect(lines.at(-1)?.startsWith("└")).toBe(true)
    expect(lines.some((line) => line.includes("こんにちは"))).toBe(true)
  })

  it("発話がまだ無いとき、プレースホルダーを表示する", () => {
    // 折り返されて分断されないよう、プレースホルダーが1行に収まる幅で確認する
    const lines = buildBalloon(undefined, 30)

    expect(lines.join("\n")).toContain("まだ発話がありません")
  })

  it("ペイン幅を超える発話は複数行に折り返す", () => {
    const lines = buildBalloon("a".repeat(100), 20)

    // 上下の枠1行ずつを除いた本文が複数行になる
    expect(lines.length - 2).toBeGreaterThan(1)
  })

  it("全角文字は半角の2倍の幅として折り返す", () => {
    // innerWidth = 20 - 4 = 16。全角の「あ」は幅2なので、1行に8文字までしか収まらない
    const lines = buildBalloon("あ".repeat(10), 20)
    const bodyLines = lines.slice(1, -1)

    expect(bodyLines.length).toBe(2)
    expect(bodyLines[0]).toContain("あ".repeat(8))
  })

  it("すべての行の幅が揃う（半角文字のみなら文字数で確認できる）", () => {
    const lines = buildBalloon("short\na much longer line than the first one", 24)
    const widths = new Set(lines.map((line) => line.length))

    expect(widths.size).toBe(1)
  })

  it("本文が上限行数を超えるとき、末尾を残して先頭を省略記号で示す", () => {
    const longUtterance = Array.from({ length: 20 }, (_, i) => `${i}行目の発話`).join("\n")
    const lines = buildBalloon(longUtterance, 20)
    const bodyLines = lines.slice(1, -1)

    expect(bodyLines[0]).toContain("…")
    expect(bodyLines.at(-1)).toContain("19行目の発話")
    // 先頭の方の行(0行目)は切り捨てられて出てこない
    expect(lines.join("\n")).not.toContain("0行目の発話")
  })
})
