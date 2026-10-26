// 疑似セッションの場面ごとの塊の一覧を見分ける判断を検証する。

import { describe, expect, test } from "vitest"

import { CATALOG } from "../../../../scripts/capture/lib/catalog-entry.ts"
import { revealForecast, sceneBlockKinds } from "../../../../scripts/capture/lib/scene-catalog.ts"
import {
  sceneEventTimeoutMs,
  settleSceneTarget,
} from "../../../../scripts/capture/lib/scene-end.ts"
import { bundledFakeSession } from "../../../fixture/bundled-fake-session.ts"

const kinds = sceneBlockKinds(bundledFakeSession())

describe("sceneBlockKinds", () => {
  test("状態のセルを持つ table は report-tool・report-matrix に出る", () => {
    expect(kinds.get("report-tool")).toContain("table(status)")
    expect(kinds.get("report-matrix")).toContain("table(status)")
  })

  test("流れの塊の撮影用の場面は list を持つ", () => {
    expect(kinds.get("report-flow-row")).toContain("list")
  })

  test("検証結果を持つ場面には checks が出る", () => {
    expect(kinds.get("report-tool")).toContain("checks")
    expect(kinds.get("report-task-verdict")).toContain("checks")
  })
})

describe("revealForecast", () => {
  const forecast = revealForecast(bundledFakeSession())

  test("節が短い場面は掛からない見込みになる", () => {
    expect(forecast.get("work-plan-parallel")).toBe("unlikely")
  })

  test("図と長い本文を持つ場面は掛かる見込みになる", () => {
    expect(forecast.get("report-blocks")).toBe("likely")
  })

  test("report を持たない場面は掛からない見込みになる", () => {
    expect(forecast.get("welcome-greeting")).toBe("unlikely")
  })
})

describe("カタログの件が待つ場面の手", () => {
  const session = bundledFakeSession()
  const waiting = CATALOG.filter(
    (entry) => !(entry.settle.kind === "selector" && entry.settle.phase === "before-prepare"),
  )

  test("場面の終わりを待つ件が1件以上ある", () => {
    expect(waiting.length).toBeGreaterThan(0)
  })

  test("待つ手が場面にあり、待つ上限を導ける", () => {
    const unresolved = waiting.filter((entry) => {
      const target = settleSceneTarget(entry.settle, session, entry.scene)
      return (
        target === undefined ||
        sceneEventTimeoutMs(session, entry.scene, undefined, target) === undefined
      )
    })

    expect(unresolved.map((entry) => entry.name)).toEqual([])
  })
})
