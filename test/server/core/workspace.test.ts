import { describe, expect, it } from "bun:test"

import {
  cutWorkspace,
  decideWorktreeFold,
  decideWorktreeMerge,
  planWorkspace,
  type WorkspacePlanOptions,
  workspaceCwd,
  workspaceProjectConfigRoot,
  worktreeBranch,
  workspaceMergeNotice,
  worktreeMergeStopNotice,
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

describe("decideWorktreeMerge", () => {
  it("入れるものが無ければ何もしない（本体が汚れていても知らせない）", () => {
    expect(decideWorktreeMerge({ originChanged: true, unmerged: false })).toEqual({ kind: "skip" })
  })

  it("本体が汚れていなければ入れる", () => {
    expect(decideWorktreeMerge({ originChanged: false, unmerged: true })).toEqual({ kind: "merge" })
  })

  it("本体に未コミットの変更があれば入れずに止める", () => {
    expect(decideWorktreeMerge({ originChanged: true, unmerged: true })).toEqual({
      kind: "blocked",
      reason: "origin-changed",
    })
  })
})

describe("worktreeMergeStopNotice", () => {
  const WORKDIR = {
    branch: "tsukumo/20260922-153012",
    path: "/repo/.git/tsukumo/worktree/20260922-153012",
  }

  it("衝突は、ブランチ・worktree・衝突したファイル・次の手を並べる", () => {
    const notice = worktreeMergeStopNotice(
      { kind: "conflict", files: ["src/a.ts", "src/b.ts"] },
      WORKDIR,
    )

    expect(notice.split("\n")).toEqual([
      "マージが衝突したので止めた（本体は元に戻した）",
      "ブランチ: tsukumo/20260922-153012",
      "worktree: /repo/.git/tsukumo/worktree/20260922-153012",
      "衝突したファイル: src/a.ts src/b.ts",
      "次の手: worktree で git merge main して解き、もう一度マージを頼む",
    ])
  })

  it("本体が汚れているときは、本体の場所と本体を片付ける次の手を出す", () => {
    const notice = worktreeMergeStopNotice({ kind: "origin-changed", origin: "/repo" }, WORKDIR)

    expect(notice).toContain("本体: /repo")
    expect(notice).toContain("次の手: 本体の変更をコミットするか退避してから、もう一度マージを頼む")
  })

  it("衝突以外の失敗は、git が書いた行をそのまま並べる", () => {
    const notice = worktreeMergeStopNotice(
      { kind: "failed", reason: "git merge --no-edit tsukumo/x\nfatal: 架空の理由" },
      WORKDIR,
    )

    expect(notice).toContain("git: git merge --no-edit tsukumo/x")
    expect(notice).toContain("git: fatal: 架空の理由")
  })
})

describe("workspaceMergeNotice", () => {
  it("入った回は入ったとだけ返し、畳めなかった行があればその下に並べる", () => {
    expect(workspaceMergeNotice({ kind: "merged", notices: [] })).toBe("成果を本体へ入れた")
    expect(workspaceMergeNotice({ kind: "merged", notices: ["worktree を畳めなかった"] })).toBe(
      "成果を本体へ入れた\nworktree を畳めなかった",
    )
  })

  it("入れるものが無かった回は、止まったのではないと分かる文面を返す", () => {
    expect(workspaceMergeNotice({ kind: "skipped" })).toBe(
      "本体へ入れるものは無かった（このセッションのコミットが増えていない）",
    )
  })

  it("止まった回は、画面に出すのと同じ文面（次の手つき）をそのまま返す", () => {
    const notice = worktreeMergeStopNotice(
      { kind: "origin-changed", origin: "/repo" },
      { branch: "tsukumo/20260922-153012", path: "/repo/.git/tsukumo/worktree/20260922-153012" },
    )

    expect(workspaceMergeNotice({ kind: "stopped", notice })).toBe(notice)
  })
})
