import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

import { buildFeatureEdgeTable, type EdgeRule } from "../../scripts/document/feature-edge-table.ts"
import { SERVER_FEATURES } from "./feature-graph.ts"

type Rule = EdgeRule & {
  readonly severity: string
  readonly to: { readonly path?: string; readonly pathNot?: string }
}

const FEATURE_RULE_PREFIX = "server-feature-edge:"

const config: { readonly forbidden: readonly Rule[] } = createRequire(import.meta.url)(
  "../../.dependency-cruiser.cjs",
)

const featureRules = config.forbidden.filter((rule) => rule.name.startsWith(FEATURE_RULE_PREFIX))

// 解決できた npm パッケージの `node_modules/.pnpm/…` の道と、解決できないパッケージの名前そのまま
// （`@orpc/*` は解決されず、名前が道になる）の両方。
const RESOLVED_ORPC_SERVER =
  "node_modules/.pnpm/@orpc+server@1.0.0/node_modules/@orpc/server/dist/index.mjs"

function pathPatternOf(name: string): RegExp {
  const pattern = config.forbidden.find((rule) => rule.name === name)?.to.path
  if (pattern === undefined) {
    throw new Error(`${name} の to.path が無い`)
  }
  return new RegExp(pattern)
}

function pathNotPatternOf(name: string): RegExp {
  const pattern = config.forbidden.find((rule) => rule.name === name)?.to.pathNot
  if (pattern === undefined) {
    throw new Error(`${name} の to.pathNot が無い`)
  }
  return new RegExp(pattern)
}

describe(".dependency-cruiser.cjs の規則", () => {
  it("規則が1本以上あり、全部が error で、名前が重ならない", () => {
    const names = config.forbidden.map((rule) => rule.name)

    expect(names.length).toBeGreaterThan(0)
    expect(config.forbidden.filter((rule) => rule.severity !== "error")).toEqual([])
    expect(new Set(names).size).toBe(names.length)
  })

  it("機能ごとの規則の機能は、SERVER_FEATURES と過不足なく一致する", () => {
    const ruleFeatures = featureRules.map((rule) => rule.name.slice(FEATURE_RULE_PREFIX.length))

    expect(ruleFeatures.toSorted()).toEqual([...SERVER_FEATURES].toSorted())
  })

  it("機能の規則が許す先は、SERVER_FEATURES の機能だけ", () => {
    const known = new Set<string>(SERVER_FEATURES)
    const allowedNames = buildFeatureEdgeTable(config.forbidden).rows.flatMap((cells) =>
      [...(cells[1] ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? ""),
    )

    expect(allowedNames.filter((name) => !known.has(name))).toEqual([])
  })

  it("`@orpc/server` を読む規則は、解決できた道と解決できない名前の両方に当たる", () => {
    const pattern = pathPatternOf("orpc-server-reader")

    expect(pattern.test("@orpc/server")).toBe(true)
    expect(pattern.test(RESOLVED_ORPC_SERVER)).toBe(true)
    expect(pattern.test("@orpc/contract")).toBe(false)
    expect(pattern.test("@orpc/server-extra")).toBe(false)
  })

  it("shared の外部パッケージの規則は、解決できない名前も落とし、許した3つは通す", () => {
    const rule = config.forbidden.find((candidate) => candidate.name === "shared-packages")
    const target = new RegExp(rule?.to.path ?? "(?!)")
    const allowed = pathNotPatternOf("shared-packages")
    const forbids = (path: string): boolean => target.test(path) && !allowed.test(path)

    expect(forbids("left-pad-not-installed")).toBe(true)
    expect(forbids("@orpc/server")).toBe(true)
    expect(forbids("node_modules/.pnpm/ws@8.22.0/node_modules/ws/index.js")).toBe(true)
    expect(forbids("@orpc/contract")).toBe(false)
    expect(forbids("zod")).toBe(false)
    expect(forbids("node_modules/.pnpm/remeda@2.50.0/node_modules/remeda/dist/index.cjs")).toBe(
      false,
    )
    expect(forbids("src/shared/a.ts")).toBe(false)
  })

  it("型宣言（src/types/*.d.ts）から src の中への import を落とす規則がある", () => {
    const rule = config.forbidden.find((candidate) => candidate.name === "layer-ambient")

    expect(rule).toBeDefined()
  })
})
