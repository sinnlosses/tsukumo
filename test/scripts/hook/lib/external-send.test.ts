import { describe, expect, test } from "vitest"

import { findExternalSendDenial } from "../../../../scripts/hook/lib/external-send.ts"
import { readHookMode } from "../../../../scripts/hook/lib/hook-mode.ts"
import { bashCall } from "../../../fixture/bash-hook-call.ts"

const SENDING = [
  ["gh api -X POST repos/o/r/issues", "gh-api-write"],
  ["gh api -XPOST x", "gh-api-write"],
  ["gh api --method=PATCH x", "gh-api-write"],
  ["gh api repos/o/r/issues -f title=t", "gh-api-write"],
  ["gh api x --input -", "gh-api-write"],
  ["gh api graphql -f query='mutation{a}'", "gh-api-write"],
  ["gh api graphql -F query=@q.graphql", "gh-api-write"],
  ["gh issue create -t t", "gh-write"],
  ["gh pr merge 1", "gh-write"],
  ["gh label create x", "gh-write"],
  ["git push", "git-push"],
  ["git -C /x push origin main", "git-push"],
  ["cd x && git push", "git-push"],
] as const

describe("サブエージェントの外へ送る操作", () => {
  test.each(SENDING)("%s は規則 %s", (command, rule) => {
    expect(findExternalSendDenial(bashCall(command, { fromSubagent: true }))?.rule).toBe(rule)
  })

  test.each([
    ["gh api repos/o/r"],
    ["gh api -X GET x -f q=1"],
    ["gh api graphql -f query='{viewer{login}}'"],
    ["gh issue list"],
    ["gh pr view 1"],
    ["gh auth status"],
    ["git push --dry-run"],
    ["git push -n"],
    ['echo "git push"'],
    ["tw edit T-1 --body-file - <<'X'\ngh issue create -t t\nX"],
  ])("%s は対象にしない", (command) => {
    expect(findExternalSendDenial(bashCall(command, { fromSubagent: true }))).toBeUndefined()
  })

  test.each(SENDING)("主のセッションの %s は対象にしない", (command) => {
    expect(findExternalSendDenial(bashCall(command, { fromSubagent: false }))).toBeUndefined()
  })

  test("log-only の間は実行を止めない", () => {
    expect(readHookMode("deny-external-send", {})).toBe("log-only")
  })
})
