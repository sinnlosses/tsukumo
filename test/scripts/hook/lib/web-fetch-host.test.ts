import { describe, expect, test } from "vitest"

import { findWebFetchHostDenial } from "../../../../scripts/hook/lib/web-fetch-host.ts"

function subagentFetch(url: string) {
  return findWebFetchHostDenial({ url, fromSubagent: true })
}

describe("サブエージェントの WebFetch のホスト", () => {
  test.each([["https://example.test/a"], ["http://example.test/"], ["https://notgithub.com/"]])(
    "%s は規則 host-outside-allowlist",
    (url) => {
      expect(subagentFetch(url)?.rule).toBe("host-outside-allowlist")
    },
  )

  test.each([
    ["https://github.com/o/r"],
    ["https://gist.github.com/x"],
    ["https://GitHub.com/o/r"],
    ["https://github.com./o/r"],
    ["http://arxiv.org/abs/0000.00000"],
  ])("一覧のホストかそのサブドメインの %s は対象にしない", (url) => {
    expect(subagentFetch(url)).toBeUndefined()
  })

  test.each([["ftp://example.test/"], ["file:///etc/hosts"], ["not a url"]])(
    "http(s) でないか読めない %s は対象にしない",
    (url) => {
      expect(subagentFetch(url)).toBeUndefined()
    },
  )

  test("主のセッションは一覧の外のホストでも対象にしない", () => {
    expect(
      findWebFetchHostDenial({ url: "https://example.test/a", fromSubagent: false }),
    ).toBeUndefined()
  })

  test("拒否の文に URL もホスト名も入れない", () => {
    const refusal = subagentFetch("https://example.test/secret-path")?.refusal ?? ""
    expect(refusal).not.toBe("")
    expect(refusal).not.toContain("example.test")
    expect(refusal).not.toContain("secret-path")
  })
})
