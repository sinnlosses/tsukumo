import { describe, expect, it } from "bun:test"

import {
  cutWorkspace,
  decideWorktreeFold,
  planWorkspace,
  type WorkspacePlanOptions,
  workspaceCwd,
  workspaceProjectConfigRoot,
  worktreeBranch,
} from "../../../src/server/core/workspace.ts"
import { type Workspace } from "../../../src/shared/workspace.ts"

const REPOSITORY = { root: "/repo", gitDir: "/repo/.git" }

/** 起動時の判断に渡す既定（各テストが1つずつ差し替える）。 */
function planOptions(overrides: Partial<WorkspacePlanOptions> = {}): WorkspacePlanOptions {
  return {
    enabled: true,
    repository: REPOSITORY,
    cwd: "/repo",
    source: "/tsukumo",
    startedAt: new Temporal.PlainDateTime(2026, 9, 22, 15, 30, 12),
    ...overrides,
  }
}

describe("planWorkspace", () => {
  it("git リポジトリなら切る（1つ目のセッションも切る）", () => {
    const plan = planWorkspace(planOptions())

    expect(plan.kind).toBe("cut")
    expect(plan.kind === "cut" ? plan.repository : undefined).toEqual(REPOSITORY)
  })

  it("名前は切った時刻（YYYYMMDD-HHMMSS）で、同じ秒に負けた側は -2, -3 と足す", () => {
    const plan = planWorkspace(planOptions())

    const names = plan.kind === "cut" ? plan.names : []
    expect(names[0]).toBe("20260922-153012")
    expect(names[1]).toBe("20260922-153012-2")
    expect(names[2]).toBe("20260922-153012-3")
    expect(names.length).toBeGreaterThan(3)
  })

  it("月・日・時・分・秒は2桁に揃える", () => {
    const plan = planWorkspace(
      planOptions({ startedAt: new Temporal.PlainDateTime(2026, 1, 2, 3, 4, 5) }),
    )

    expect(plan.kind === "cut" ? plan.names[0] : undefined).toBe("20260102-030405")
  })

  it("git リポジトリでなければ切らず、起動したディレクトリでそのまま動く", () => {
    const plan = planWorkspace(planOptions({ repository: undefined, cwd: "/tmp/somewhere" }))

    expect(plan).toEqual({
      kind: "direct",
      workspace: { source: "/tsukumo", workdir: { kind: "direct", path: "/tmp/somewhere" } },
    })
  })

  it("切らないと明示されたら（TSUKUMO_WORKTREE=0）、git リポジトリでも切らない", () => {
    const plan = planWorkspace(planOptions({ enabled: false }))

    expect(plan.kind).toBe("direct")
  })
})

describe("worktreeBranch", () => {
  it("ブランチ名は tsukumo/<名前>", () => {
    expect(worktreeBranch("20260922-153012")).toBe("tsukumo/20260922-153012")
  })
})

describe("workspaceCwd / workspaceProjectConfigRoot", () => {
  it("切ったときは cwd が worktree、設定の出どころは切り出し元", () => {
    const workspace = cutWorkspace({
      source: "/tsukumo",
      path: "/repo/.git/tsukumo/worktree/20260922-153012",
      name: "20260922-153012",
      origin: "/repo",
    })

    expect(workspaceCwd(workspace)).toBe("/repo/.git/tsukumo/worktree/20260922-153012")
    expect(workspaceProjectConfigRoot(workspace)).toBe("/repo")
    expect(workspace.workdir).toEqual({
      kind: "worktree",
      path: "/repo/.git/tsukumo/worktree/20260922-153012",
      branch: "tsukumo/20260922-153012",
      origin: "/repo",
    })
  })

  it("切っていないときは2つとも同じ（起動したディレクトリ）", () => {
    const workspace: Workspace = {
      source: "/tsukumo",
      workdir: { kind: "direct", path: "/tmp/somewhere" },
    }

    expect(workspaceCwd(workspace)).toBe("/tmp/somewhere")
    expect(workspaceProjectConfigRoot(workspace)).toBe("/tmp/somewhere")
  })
})

describe("decideWorktreeFold", () => {
  it("pid が生きていれば使用中（何も知らせない）", () => {
    expect(decideWorktreeFold({ running: true, changed: false, unmerged: false })).toEqual({
      kind: "in-use",
    })
  })

  it("誰も使っておらず、変更もコミットも残っていなければ畳む", () => {
    expect(decideWorktreeFold({ running: false, changed: false, unmerged: false })).toEqual({
      kind: "fold",
    })
  })

  it("未コミットの変更が残っていれば消さずに知らせる", () => {
    expect(decideWorktreeFold({ running: false, changed: true, unmerged: false })).toEqual({
      kind: "left",
      reason: "changed",
    })
  })

  it("未マージのコミットが残っていれば消さずに知らせる", () => {
    expect(decideWorktreeFold({ running: false, changed: false, unmerged: true })).toEqual({
      kind: "left",
      reason: "unmerged",
    })
  })
})
