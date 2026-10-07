import { describe, expect, it } from "vitest"

import {
  commitMilestoneOf,
  countAchievementCommits,
  type AchievementCommit,
} from "../../../../src/server/achievement/core/achievement-commit.ts"

function commit(hash: string, committedAtEpochSeconds: number): AchievementCommit {
  return { hash, committedAtEpochSeconds }
}

describe("countAchievementCommits", () => {
  it("範囲 [start, end) に入るコミットだけを数える（終わりは含まない）", () => {
    const commits = [
      commit("a", 100),
      commit("b", 199),
      commit("c", 200), // end と同じ時刻は含まない
      commit("d", 99), // start より前
    ]

    expect(countAchievementCommits(commits, 100, 200)).toBe(2)
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
