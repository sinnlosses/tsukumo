import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, test } from "vitest"

import {
  buildAcceptorPrompt,
  createShipReviewMarks,
  parseAgentDefinition,
  reviewDiff,
  type ShipReviewDeps,
} from "../../../../scripts/dev/lib/ship-review.ts"
import { REPOSITORY_ROOT } from "../../../../scripts/shared/repository-root.ts"

const CODE_PATHS = ["src/server/example.ts", "docs/README.md"]
const DOC_PATHS = ["docs/README.md", "README.md"]
const FINDING = "src/server/example.ts: 架空の指摘"
const PASS_TEXT = { verdict: "pass", findings: [] }
const FAIL_TEXT = { verdict: "fail", findings: [FINDING] }

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "tsukumo-ship-review-"))
  temporaryDirectories.push(directory)
  return directory
}

function fakeDeps(
  paths: readonly string[],
  acceptor: () => unknown,
  directory: string = temporaryDirectory(),
): { readonly deps: ShipReviewDeps; readonly acceptorCalls: () => number } {
  let calls = 0
  return {
    deps: {
      changedPaths: () => paths,
      diffPatchId: () => "diff-patch",
      firstCommitPatchId: () => "first-patch",
      marks: createShipReviewMarks(directory, Temporal.Now.instant().epochMilliseconds),
      runAcceptor: () => {
        calls += 1
        return acceptor()
      },
    },
    acceptorCalls: () => calls,
  }
}

describe("reviewDiff", () => {
  test("文書だけの差分は受け入れ役を起こさず先へ進む", () => {
    const { deps, acceptorCalls } = fakeDeps(DOC_PATHS, () => FAIL_TEXT)
    expect(reviewDiff(deps)).toEqual({ kind: "skipped" })
    expect(acceptorCalls()).toBe(0)
  })

  test("src を触る差分で印が無く、受け入れ役が通さなければ止まる", () => {
    const { deps, acceptorCalls } = fakeDeps(CODE_PATHS, () => FAIL_TEXT)
    expect(reviewDiff(deps)).toEqual({
      kind: "rejected",
      findings: [FINDING],
    })
    expect(acceptorCalls()).toBe(1)
    expect(deps.marks.hasAccepted("diff-patch")).toBe(false)
  })

  test("通ったら印を書いて先へ進む", () => {
    const { deps } = fakeDeps(CODE_PATHS, () => PASS_TEXT)
    expect(reviewDiff(deps)).toEqual({ kind: "passed" })
    expect(deps.marks.hasAccepted("diff-patch")).toBe(true)
  })

  test("通った印がある差分は受け入れ役を起こさない", () => {
    const directory = temporaryDirectory()
    reviewDiff(fakeDeps(CODE_PATHS, () => PASS_TEXT, directory).deps)
    const { deps, acceptorCalls } = fakeDeps(CODE_PATHS, () => FAIL_TEXT, directory)
    expect(reviewDiff(deps)).toEqual({ kind: "passed" })
    expect(acceptorCalls()).toBe(0)
  })

  test("差し戻しのあとにまた通らなければ止まって報告に回す", () => {
    const directory = temporaryDirectory()
    expect(reviewDiff(fakeDeps(CODE_PATHS, () => FAIL_TEXT, directory).deps).kind).toBe("rejected")
    expect(reviewDiff(fakeDeps(CODE_PATHS, () => FAIL_TEXT, directory).deps)).toEqual({
      kind: "exhausted",
      findings: [FINDING],
    })
  })

  test.each([
    [["src/a.ts"], "passed"],
    [["scripts/dev/a.ts"], "passed"],
    [["test/a.test.ts"], "passed"],
    [["notes/src/a.md", "AGENTS.md"], "skipped"],
    [[], "skipped"],
  ] as const)("%o の差分は %s", (paths, expected) => {
    expect(reviewDiff(fakeDeps(paths, () => PASS_TEXT).deps).kind).toBe(expected)
  })

  test.each([
    ["構造化出力が無い", () => undefined],
    ["判定が pass・fail 以外", () => ({ verdict: "ok", findings: [] })],
    ["指摘の欄が無い", () => ({ verdict: "pass" })],
    [
      "起こせない",
      () => {
        throw new Error("spawnSync claude ETIMEDOUT")
      },
    ],
  ])("判定が読めなければ止まり印を書かない（%s）", (_, acceptor) => {
    const { deps } = fakeDeps(CODE_PATHS, acceptor)
    expect(reviewDiff(deps).kind).toBe("unavailable")
    expect(deps.marks.hasAccepted("diff-patch")).toBe(false)
    expect(deps.marks.readRejections("first-patch")).toBe(0)
  })
})

describe("parseAgentDefinition", () => {
  test("前書きと本文を claude --agents の形にする", () => {
    const markdown = [
      "---",
      "name: reviewer",
      'description: "架空の説明"',
      "model: opus",
      "disallowedTools: Agent, Edit",
      "---",
      "",
      "架空の本文",
    ].join("\n")
    expect(parseAgentDefinition(markdown)).toEqual({
      reviewer: {
        description: "架空の説明",
        prompt: "架空の本文",
        model: "opus",
        disallowedTools: ["Agent", "Edit"],
      },
    })
  })

  test("欄が欠けたら例外", () => {
    expect(() => parseAgentDefinition("---\nname: reviewer\n---\n本文")).toThrow(/description/)
  })

  test("同梱の受け入れ役の定義を読める", () => {
    const markdown = readFileSync(
      join(REPOSITORY_ROOT, "vendor/tsukumo-plugins/agents/acceptor.md"),
      "utf8",
    )
    expect(parseAgentDefinition(markdown)["acceptor"]).toMatchObject({
      model: "opus",
      disallowedTools: expect.arrayContaining(["Edit", "Write"]),
    })
  })
})

describe("buildAcceptorPrompt", () => {
  test("完了条件が無ければ件名を並べる", () => {
    const prompt = buildAcceptorPrompt("abc123", {
      kind: "subjects",
      subjects: ["架空の件名"],
    })
    expect(prompt).toContain("git diff abc123..HEAD")
    expect(prompt).toContain("- 架空の件名")
  })

  test("完了条件のファイルがあれば件名の代わりにその中身を渡す", () => {
    const prompt = buildAcceptorPrompt("abc123", { kind: "file", text: "架空の完了条件\n" })
    expect(prompt).toContain("架空の完了条件")
    expect(prompt).not.toContain("件名")
  })
})

describe("createShipReviewMarks", () => {
  test("通った印を書くとき30日より古い印を消す", () => {
    const directory = temporaryDirectory()
    const old = join(directory, "accepted", "old-patch")
    mkdirSync(join(directory, "accepted"), { recursive: true })
    writeFileSync(old, "")
    const thirtyOneDaysAgo =
      (Temporal.Now.instant().epochMilliseconds - 31 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(old, thirtyOneDaysAgo, thirtyOneDaysAgo)

    const marks = createShipReviewMarks(directory, Temporal.Now.instant().epochMilliseconds)
    marks.markAccepted("new-patch")

    expect(marks.hasAccepted("old-patch")).toBe(false)
    expect(marks.hasAccepted("new-patch")).toBe(true)
  })
})
