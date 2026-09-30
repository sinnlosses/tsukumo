import { describe, expect, it } from "vitest"

import {
  achievementCommitsInRange,
  commitMilestoneOf,
  countAchievementCommits,
  type AchievementCommit,
} from "../../../../src/server/achievement/core/achievement-commit.ts"

function commit(
  hash: string,
  committedAtEpochSeconds: number,
  changedFiles: readonly string[],
): AchievementCommit {
  return { hash, committedAtEpochSeconds, changedFiles }
}

describe("countAchievementCommits", () => {
  it("範囲 [start, end) に入るコミットだけを数える（終わりは含まない）", () => {
    const commits = [
      commit("a", 100, ["src/a.ts"]),
      commit("b", 199, ["src/b.ts"]),
      commit("c", 200, ["src/c.ts"]), // end と同じ時刻は含まない
      commit("d", 99, ["src/d.ts"]), // start より前
    ]

    expect(countAchievementCommits(commits, 100, 200)).toBe(2)
  })

  it("運用の帳面だけを触ったコミットは外す", () => {
    const commits = [
      commit("a", 100, ["develop/tasks.json"]),
      commit("b", 100, ["develop/progress.md"]),
      commit("c", 100, ["develop/task/T-001.md"]),
      commit("d", 100, ["docs/history/tasks.md"]),
      commit("e", 100, ["docs/history/progress.md"]),
      commit("f", 100, ["src/a.ts"]),
    ]

    expect(countAchievementCommits(commits, 0, 200)).toBe(1)
  })

  it("仕事のファイルと帳面を両方触ったコミットは数える", () => {
    const commits = [commit("a", 100, ["develop/tasks.json", "src/a.ts"])]

    expect(countAchievementCommits(commits, 0, 200)).toBe(1)
  })

  it("変更ファイルが0件（空コミット）は数えない", () => {
    const commits = [commit("a", 100, [])]

    expect(countAchievementCommits(commits, 0, 200)).toBe(0)
  })
})

describe("achievementCommitsInRange", () => {
  it("countAchievementCommits と同じ絞り込みで、コミットそのものを返す", () => {
    const commits = [
      commit("a", 100, ["src/a.ts"]),
      commit("b", 150, ["develop/tasks.json"]), // 帳面だけ→外れる
      commit("c", 199, ["src/c.ts"]),
      commit("d", 200, ["src/d.ts"]), // end と同じ時刻は含まない
    ]

    expect(achievementCommitsInRange(commits, 100, 200).map((c) => c.hash)).toEqual(["a", "c"])
  })
})

describe("commitMilestoneOf", () => {
  it("committer date の順に足していって刻みに届いたコミットの時刻を返す", () => {
    expect(commitMilestoneOf([300, 100, 200], 997)).toEqual({
      count: 1000,
      committedAtEpochSeconds: 300,
    })
  })

  it("刻みに届かなければ undefined", () => {
    expect(commitMilestoneOf([100], 500)).toBeUndefined()
  })
})
