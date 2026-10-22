// 常設の文章（AGENTS.md と .claude/rules/*.md）の字数が上限以内であること
// （docs/coding-standards.md「常設の文章の字数」）。

import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")
const RULES_DIR = `${REPOSITORY_ROOT}/.claude/rules`

const AGENTS_MD_LIMIT = 9000
const RULES_TOTAL_LIMIT = 2400

const REMEDY =
  "足すなら何かを削る（上限は上げない）。出し先の梯子は hook・検査 → スクリプト → スキル → サブエージェント → 常設の文章"

describe("常設の文章の字数", () => {
  it("AGENTS.md は上限以内", () => {
    const text = readFileSync(`${REPOSITORY_ROOT}/AGENTS.md`, "utf8")

    expect(overBudget("AGENTS.md", [text], AGENTS_MD_LIMIT)).toBe("")
  })

  it(".claude/rules/*.md の合計は上限以内", () => {
    const texts = readdirSync(RULES_DIR)
      .filter((name) => name.endsWith(".md"))
      .map((name) => readFileSync(`${RULES_DIR}/${name}`, "utf8"))

    expect(overBudget(".claude/rules の合計", texts, RULES_TOTAL_LIMIT)).toBe("")
  })

  it("上限ちょうどは通り、1字超えると「足すなら削る」と梯子つきで落ちる", () => {
    const agentsMd = readFileSync(`${REPOSITORY_ROOT}/AGENTS.md`, "utf8")
    const limit = [...agentsMd].length

    expect(overBudget("AGENTS.md", [agentsMd], limit)).toBe("")

    const message = overBudget("AGENTS.md", [`${agentsMd}あ`], limit)
    expect(message).toContain("足すなら何かを削る")
    expect(message).toContain("hook・検査 → スクリプト → スキル → サブエージェント → 常設の文章")
    expect(message).toContain(`${limit + 1}字`)
  })

  it("字数は UTF-16 の長さでなく文字数で数える", () => {
    expect(overBudget("x", ["😀😀"], 2)).toBe("")
    expect(overBudget("x", ["😀😀😀"], 2)).not.toBe("")
  })
})

/** 合計が上限を超えたら失敗文を、収まっていれば空文字を返す。 */
function overBudget(label: string, texts: readonly string[], limit: number): string {
  const total = texts.reduce((sum, text) => sum + [...text].length, 0)
  return total > limit ? `${label} が ${total}字で上限 ${limit}字を超えた。${REMEDY}` : ""
}
