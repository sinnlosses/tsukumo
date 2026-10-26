// 印の有無 × 未コミットの有無の 4 通りと、判定できない環境で通すことを、状態を差し込んで確かめる。

import { describe, expect, test } from "vitest"

import { findForeignRestoreDenial } from "../../../../scripts/hook/lib/foreign-restore.ts"
import type { WorktreeProbe } from "../../../../scripts/hook/lib/foreign-restore.ts"
import { readHookMode } from "../../../../scripts/hook/lib/hook-mode.ts"
import { bashCall } from "../../../fixture/bash-hook-call.ts"

function probe(uncommitted: boolean | undefined, claimed: boolean | undefined): WorktreeProbe {
  return { hasUncommittedChanges: () => uncommitted, hasOwnClaim: () => claimed }
}

function denied(command: string, worktree: WorktreeProbe): boolean {
  return findForeignRestoreDenial(bashCall(command), worktree) !== undefined
}

describe("印が無い作業ツリーでの未コミットの変更を消しうる git", () => {
  test.each([
    ["印あり・未コミットあり", true, true, false],
    ["印あり・未コミットなし", false, true, false],
    ["印なし・未コミットなし", false, false, false],
    ["印なし・未コミットあり", true, false, true],
  ])("%s", (_name, uncommitted, claimed, expected) => {
    expect(denied("git restore src/a.ts", probe(uncommitted, claimed))).toBe(expected)
  })

  test("tw や git が使えず判定できない環境では通す", () => {
    expect(denied("git restore a", probe(true, undefined))).toBe(false)
    expect(denied("git restore a", probe(undefined, false))).toBe(false)
  })

  test.each([
    ["git restore", "restore"],
    ["git checkout -- a.ts", "checkout"],
    ["git -C /x clean -fd", "clean"],
    ["git stash", "stash"],
    ["git stash push -u -m x", "stash"],
    ["cd x && git restore --staged a", "restore"],
  ])("%s は規則 %s", (command, rule) => {
    expect(findForeignRestoreDenial(bashCall(command), probe(true, false))?.rule).toBe(rule)
  })

  test.each([
    ["git status"],
    ["git checkout main"],
    ["git stash list"],
    ["git stash show -p"],
    ["git clean -n"],
    ['echo "git restore a"'],
  ])("%s は対象にしない", (command) => {
    expect(denied(command, probe(true, false))).toBe(false)
  })

  test("log-only の間は実行を止めない", () => {
    expect(readHookMode("deny-foreign-restore", {})).toBe("log-only")
  })
})
