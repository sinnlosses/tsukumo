import { readdirSync } from "node:fs"
import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

import { buildFeatureEdgeTable, type EdgeRule } from "../../scripts/document/feature-edge-table.ts"
import { SERVER_FEATURES } from "./feature-graph.ts"
import { SRC_ROOT } from "./source-file.ts"

type Rule = EdgeRule & {
  readonly severity: string
  readonly from: { readonly path?: string }
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

  describe("子ディレクトリの辺 (server-child-edge:)", () => {
    const CHILD_PREFIX = "server-child-edge:report/core/"
    const CORE = "src/server/report/core"
    const allChildRules = config.forbidden.filter((rule) =>
      rule.name.startsWith("server-child-edge:"),
    )
    const childRules = allChildRules.filter((rule) => rule.name.startsWith(CHILD_PREFIX))

    function childEdgeForbidden(from: string, to: string): boolean {
      return childRules.some((rule) => {
        return (
          new RegExp(rule.from.path ?? "(?!)").test(`${CORE}/${from}`) &&
          new RegExp(rule.to.path ?? "(?!)").test(`${CORE}/${to}`) &&
          !new RegExp(rule.to.pathNot ?? "(?!)").test(`${CORE}/${to}`)
        )
      })
    }

    it("逆向きの import を落とし、許す辺と同じ子の中は通す", () => {
      expect(childEdgeForbidden("rules/a.ts", "review/b.ts")).toBe(true)
      expect(childEdgeForbidden("review/a.ts", "usage/b.ts")).toBe(true)
      expect(childEdgeForbidden("image/a.ts", "usage/b.ts")).toBe(true)
      expect(childEdgeForbidden("prompt/a.ts", "rules/b.ts")).toBe(true)
      expect(childEdgeForbidden("review/a.ts", "rules/draft.ts")).toBe(false)
      expect(childEdgeForbidden("usage/a.ts", "image/b.ts")).toBe(false)
      expect(childEdgeForbidden("usage/a.ts", "rules/figure/diagram.ts")).toBe(false)
      expect(childEdgeForbidden("rules/block/a.ts", "rules/prose/b.ts")).toBe(false)
    })

    it("規則の子は report/core/ の実際のディレクトリと過不足なく一致する", () => {
      const ruleChildren = childRules.map((rule) => rule.name.slice(CHILD_PREFIX.length))
      const directories = readdirSync(`${SRC_ROOT}/server/report/core`)

      expect(ruleChildren.toSorted()).toEqual(directories.toSorted())
    })

    it("message/ から core/ 直下のファイルを読む import は通し、別の子への import は落とす", () => {
      const forbids = (from: string, to: string): boolean =>
        allChildRules.some(
          (rule) =>
            new RegExp(rule.from.path ?? "(?!)").test(from) &&
            new RegExp(rule.to.path ?? "(?!)").test(to) &&
            !new RegExp(rule.to.pathNot ?? "(?!)").test(to),
        )
      const CORE_DIR = "src/server/session-driver/core"

      expect(forbids(`${CORE_DIR}/message/a.ts`, `${CORE_DIR}/session-driver.ts`)).toBe(false)
      expect(forbids(`${CORE_DIR}/message/a.ts`, `${CORE_DIR}/message/b.ts`)).toBe(false)
      expect(forbids(`${CORE_DIR}/message/a.ts`, `${CORE_DIR}/other/b.ts`)).toBe(true)
    })

    it("session/ から core/ 直下のファイルと message/ を読む import は通し、逆向きと別の子への import は落とす", () => {
      const forbids = (from: string, to: string): boolean =>
        allChildRules.some(
          (rule) =>
            new RegExp(rule.from.path ?? "(?!)").test(from) &&
            new RegExp(rule.to.path ?? "(?!)").test(to) &&
            !new RegExp(rule.to.pathNot ?? "(?!)").test(to),
        )
      const CORE_DIR = "src/server/session-driver/core"

      expect(forbids(`${CORE_DIR}/session/a.ts`, `${CORE_DIR}/session-driver.ts`)).toBe(false)
      expect(forbids(`${CORE_DIR}/session/a.ts`, `${CORE_DIR}/message/b.ts`)).toBe(false)
      expect(forbids(`${CORE_DIR}/message/a.ts`, `${CORE_DIR}/session/b.ts`)).toBe(true)
      expect(forbids(`${CORE_DIR}/session/a.ts`, `${CORE_DIR}/other/b.ts`)).toBe(true)
    })

    it("session-driver/core/ の規則の子は実際のディレクトリと過不足なく一致する", () => {
      const prefix = "server-child-edge:session-driver/core/"
      const ruleChildren = allChildRules
        .filter((rule) => rule.name.startsWith(prefix))
        .map((rule) => rule.name.slice(prefix.length))
      const directories = readdirSync(`${SRC_ROOT}/server/session-driver/core`, {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)

      expect(ruleChildren.toSorted()).toEqual(directories.toSorted())
    })

    it("session-driver/adapter/ の規則の子は実際のディレクトリと過不足なく一致する", () => {
      const prefix = "server-child-edge:session-driver/adapter/"
      const ruleChildren = allChildRules
        .filter((rule) => rule.name.startsWith(prefix))
        .map((rule) => rule.name.slice(prefix.length))
      const directories = readdirSync(`${SRC_ROOT}/server/session-driver/adapter`, {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)

      expect(ruleChildren.toSorted()).toEqual(directories.toSorted())
    })

    it("session/core/ の規則の子は実際のディレクトリと過不足なく一致する", () => {
      const prefix = "server-child-edge:session/core/"
      const ruleChildren = allChildRules
        .filter((rule) => rule.name.startsWith(prefix))
        .map((rule) => rule.name.slice(prefix.length))
      const directories = readdirSync(`${SRC_ROOT}/server/session/core`, {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)

      expect(ruleChildren.toSorted()).toEqual(directories.toSorted())
    })

    it("event/ から core/ 直下の port を読む import は通し、別の子への import は落とす", () => {
      const forbids = (from: string, to: string): boolean =>
        allChildRules.some(
          (rule) =>
            new RegExp(rule.from.path ?? "(?!)").test(from) &&
            new RegExp(rule.to.path ?? "(?!)").test(to) &&
            !new RegExp(rule.to.pathNot ?? "(?!)").test(to),
        )
      const CORE_DIR = "src/server/session/core"

      expect(forbids(`${CORE_DIR}/event/a.ts`, `${CORE_DIR}/session-manager-port.ts`)).toBe(false)
      expect(forbids(`${CORE_DIR}/event/a.ts`, `${CORE_DIR}/event/b.ts`)).toBe(false)
      expect(forbids(`${CORE_DIR}/event/a.ts`, `${CORE_DIR}/other/b.ts`)).toBe(true)
    })

    it("sdk/ と fake/ は互いを読む import を落とし、adapter/ 直下のファイルは通す", () => {
      const forbids = (from: string, to: string): boolean =>
        allChildRules.some(
          (rule) =>
            new RegExp(rule.from.path ?? "(?!)").test(from) &&
            new RegExp(rule.to.path ?? "(?!)").test(to) &&
            !new RegExp(rule.to.pathNot ?? "(?!)").test(to),
        )
      const ADAPTER_DIR = "src/server/session-driver/adapter"

      expect(forbids(`${ADAPTER_DIR}/sdk/a.ts`, `${ADAPTER_DIR}/fake/b.ts`)).toBe(true)
      expect(forbids(`${ADAPTER_DIR}/fake/a.ts`, `${ADAPTER_DIR}/sdk/b.ts`)).toBe(true)
      expect(forbids(`${ADAPTER_DIR}/sdk/a.ts`, `${ADAPTER_DIR}/input-ledger-file.ts`)).toBe(false)
      expect(forbids(`${ADAPTER_DIR}/fake/a.ts`, `${ADAPTER_DIR}/workflow-plugin.ts`)).toBe(false)
      expect(forbids(`${ADAPTER_DIR}/sdk/a.ts`, `${ADAPTER_DIR}/sdk/b.ts`)).toBe(false)
    })

    it("view-server/adapter/ の規則の子は実際のディレクトリと過不足なく一致する", () => {
      const prefix = "server-child-edge:view-server/adapter/"
      const ruleChildren = allChildRules
        .filter((rule) => rule.name.startsWith(prefix))
        .map((rule) => rule.name.slice(prefix.length))
      const directories = readdirSync(`${SRC_ROOT}/server/view-server/adapter`, {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)

      expect(ruleChildren.toSorted()).toEqual(directories.toSorted())
    })

    it("build/ と rpc/ は互いを読む import を落とし、adapter/ 直下のファイルは通す", () => {
      const forbids = (from: string, to: string): boolean =>
        allChildRules.some(
          (rule) =>
            new RegExp(rule.from.path ?? "(?!)").test(from) &&
            new RegExp(rule.to.path ?? "(?!)").test(to) &&
            !new RegExp(rule.to.pathNot ?? "(?!)").test(to),
        )
      const ADAPTER_DIR = "src/server/view-server/adapter"

      expect(forbids(`${ADAPTER_DIR}/build/a.ts`, `${ADAPTER_DIR}/rpc/b.ts`)).toBe(true)
      expect(forbids(`${ADAPTER_DIR}/rpc/a.ts`, `${ADAPTER_DIR}/build/b.ts`)).toBe(true)
      expect(forbids(`${ADAPTER_DIR}/build/a.ts`, `${ADAPTER_DIR}/server-port.ts`)).toBe(false)
      expect(forbids(`${ADAPTER_DIR}/rpc/a.ts`, `${ADAPTER_DIR}/server-port.ts`)).toBe(false)
      expect(forbids(`${ADAPTER_DIR}/rpc/a.ts`, `${ADAPTER_DIR}/rpc/b.ts`)).toBe(false)
    })

    it("repository/adapter/ の規則の子は実際のディレクトリと過不足なく一致する", () => {
      const prefix = "server-child-edge:repository/adapter/"
      const ruleChildren = allChildRules
        .filter((rule) => rule.name.startsWith(prefix))
        .map((rule) => rule.name.slice(prefix.length))
      const directories = readdirSync(`${SRC_ROOT}/server/repository/adapter`, {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)

      expect(ruleChildren.toSorted()).toEqual(directories.toSorted())
    })

    it("task/ から beads/ と adapter/ 直下のファイルを読む import は通し、逆向きと別の子への import は落とす", () => {
      const forbids = (from: string, to: string): boolean =>
        allChildRules.some(
          (rule) =>
            new RegExp(rule.from.path ?? "(?!)").test(from) &&
            new RegExp(rule.to.path ?? "(?!)").test(to) &&
            !new RegExp(rule.to.pathNot ?? "(?!)").test(to),
        )
      const ADAPTER_DIR = "src/server/repository/adapter"

      expect(forbids(`${ADAPTER_DIR}/task/a.ts`, `${ADAPTER_DIR}/beads/b.ts`)).toBe(false)
      expect(forbids(`${ADAPTER_DIR}/task/a.ts`, `${ADAPTER_DIR}/git.ts`)).toBe(false)
      expect(forbids(`${ADAPTER_DIR}/beads/a.ts`, `${ADAPTER_DIR}/git.ts`)).toBe(false)
      expect(forbids(`${ADAPTER_DIR}/beads/a.ts`, `${ADAPTER_DIR}/task/b.ts`)).toBe(true)
      expect(forbids(`${ADAPTER_DIR}/task/a.ts`, `${ADAPTER_DIR}/other/b.ts`)).toBe(true)
    })

    it("許す先は表の子だけ", () => {
      const children = new Set(childRules.map((rule) => rule.name.slice(CHILD_PREFIX.length)))
      const allowed = childRules.flatMap((rule) =>
        [...(rule.to.pathNot ?? "").matchAll(/\(\?:([^)]+)\)/g)].flatMap((match) =>
          (match[1] ?? "").split("|"),
        ),
      )

      expect(allowed.filter((name) => !children.has(name))).toEqual([])
    })
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
