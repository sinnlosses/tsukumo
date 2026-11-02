// タスク区画を撮る件の作業場所に置く架空の課題が、サイドバーの区画を溢れさせる件数で、t-002 を残す判断を検証する。

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { CATALOG } from "../../../../scripts/capture/lib/catalog-entry.ts"
import { workspaceOf } from "../../../../scripts/capture/lib/catalog-setup.ts"
import { FAKE_BEADS_ISSUES_PATH } from "../../../../src/server/repository/adapter/beads/fake-beads.ts"

let outDir = ""

beforeEach(() => {
  outDir = mkdtempSync(path.join(tmpdir(), "tsukumo-catalog-setup-"))
})

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true })
})

function issuesOfTaskBoard(): readonly Record<string, unknown>[] {
  const entry = CATALOG.find((candidate) => candidate.name === "task-board")
  if (entry === undefined) {
    throw new Error("カタログに task-board が無い")
  }
  const workspace = workspaceOf(entry, outDir)
  const issues: Record<string, unknown>[] = JSON.parse(
    readFileSync(path.join(workspace, FAKE_BEADS_ISSUES_PATH), "utf8"),
  )
  return issues
}

describe("workspaceOf の task-list", () => {
  test("実機で区画が溢れて転がる6件より多い", () => {
    expect(issuesOfTaskBoard().length).toBeGreaterThanOrEqual(7)
  })

  test("report-task-finished の task.id（t-002）を1件だけ残す", () => {
    expect(issuesOfTaskBoard().filter((issue) => issue["id"] === "t-002")).toHaveLength(1)
  })

  test("id は重ならず、open・in_progress・closed が混ざる", () => {
    const issues = issuesOfTaskBoard()
    expect(new Set(issues.map((issue) => issue["id"])).size).toBe(issues.length)
    expect(new Set(issues.map((issue) => issue["status"]))).toEqual(
      new Set(["open", "in_progress", "closed"]),
    )
  })
})
