import { describe, expect, it } from "vitest"

import type {
  ChangeCountGit,
  CommitListOutput,
  GitHead,
  NumstatOutput,
} from "../../../../src/server/core/change-count-git.ts"
import { createReportChangeCounter } from "../../../../src/server/session/core/report-change-count.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

const REQUEST = requestEvent()

const TASK_REPORT = reportEvent({
  toolUseId: "fictional-task-report",
  task: { kind: "task", id: "t-001", name: "架空の作業", outcome: "finished", genre: "work" },
})

/**
 * git の代役。HEAD・範囲の numstat・範囲のコミットの一覧・コミットごとの numstat を決め打ちで返し、問われた HEAD を控える。
 * 一覧を渡さなければ範囲にコミットは無く、コミットごとの numstat は SHA で引く。
 */
function stubGit(
  heads: readonly GitHead[],
  numstat: NumstatOutput,
  range: {
    readonly commits?: CommitListOutput
    readonly numstatOfCommit?: Readonly<Record<string, NumstatOutput>>
  } = {},
): { readonly git: ChangeCountGit; readonly askedSince: () => readonly string[] } {
  let headIndex = 0
  const asked: string[] = []
  return {
    git: {
      readHead: () => {
        const head = heads[Math.min(headIndex, heads.length - 1)] ?? { kind: "unknown" }
        headIndex += 1
        return Promise.resolve(head)
      },
      diffNumstatSince: (head) => {
        asked.push(head)
        return Promise.resolve(numstat)
      },
      commitsSince: () => Promise.resolve(range.commits ?? { kind: "output", commits: [] }),
      numstatOfCommit: (sha) =>
        Promise.resolve(range.numstatOfCommit?.[sha] ?? { kind: "unavailable" }),
    },
    askedSince: () => asked,
  }
}

/** 係にイベントを順に見せ、裏の数えが済むまで待って、流れたイベントを返す。 */
async function observeAll(
  git: ChangeCountGit,
  events: readonly SessionEvent[],
): Promise<readonly SessionEvent[]> {
  const emitted: SessionEvent[] = []
  const counter = createReportChangeCounter(git, (event) => {
    emitted.push(event)
  })
  for (const event of events) {
    counter.observe(event)
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  return emitted
}

const KNOWN_HEAD: GitHead = { kind: "known", sha: "aaaa111" }

describe("createReportChangeCounter", () => {
  it("依頼の頭の HEAD からの numstat をファイル数・追加行・削除行に数える（バイナリの - は行に数えない）", async () => {
    const { git, askedSince } = stubGit([KNOWN_HEAD], {
      kind: "output",
      text: "10\t2\tsrc/a.ts\n0\t5\tsrc/b.ts\n-\t-\tdocs/c.png\n",
    })

    const emitted = await observeAll(git, [REQUEST, TASK_REPORT])

    expect(askedSince()).toEqual(["aaaa111"])
    expect(emitted).toEqual([
      {
        kind: "report-change-summary",
        toolUseId: "fictional-task-report",
        files: 3,
        added: 10,
        removed: 7,
        mixed: false,
      },
    ])
  })

  describe("タスクのコミットだけに絞る", () => {
    const OWN = { sha: "own1", subject: "t-001: 架空の作業の一歩目" }
    const OTHER = { sha: "other1", subject: "t-002: 別の架空のタスクの変更" }

    it("範囲に別タスクのコミットが混ざっても、件名が <タスクID>: のコミットだけを数える", async () => {
      const { git } = stubGit(
        [KNOWN_HEAD],
        { kind: "output", text: "9\t9\tsrc/other.ts\n1\t0\tsrc/a.ts\n" },
        {
          commits: { kind: "output", commits: [OTHER, OWN] },
          numstatOfCommit: {
            own1: { kind: "output", text: "1\t0\tsrc/a.ts\n" },
            other1: { kind: "output", text: "9\t9\tsrc/other.ts\n" },
          },
        },
      )

      expect(await observeAll(git, [REQUEST, TASK_REPORT])).toEqual([
        {
          kind: "report-change-summary",
          toolUseId: "fictional-task-report",
          files: 1,
          added: 1,
          removed: 0,
          mixed: false,
        },
      ])
    })

    it("タスクのコミットが複数あれば合算し、同じパスは1ファイルに数える", async () => {
      const { git } = stubGit(
        [KNOWN_HEAD],
        { kind: "output", text: "" },
        {
          commits: {
            kind: "output",
            commits: [{ sha: "own2", subject: "t-001: 二歩目" }, OTHER, OWN],
          },
          numstatOfCommit: {
            own1: { kind: "output", text: "2\t1\tsrc/a.ts\n" },
            own2: { kind: "output", text: "3\t0\tsrc/a.ts\n4\t4\tsrc/b.ts\n" },
          },
        },
      )

      expect(await observeAll(git, [REQUEST, TASK_REPORT])).toMatchObject([
        { files: 2, added: 9, removed: 5, mixed: false },
      ])
    })

    it("件名の大文字小文字は区別しない（モデルが書いた ID と tw の件名で字の大きさが違っても拾う）", async () => {
      const { git } = stubGit(
        [KNOWN_HEAD],
        { kind: "output", text: "" },
        {
          commits: { kind: "output", commits: [{ sha: "own1", subject: "AB-12: 架空の作業" }] },
          numstatOfCommit: { own1: { kind: "output", text: "1\t0\tsrc/a.ts\n" } },
        },
      )

      const report = reportEvent({
        toolUseId: "fictional-task-report",
        task: { kind: "task", id: "ab-12", name: "架空の作業", outcome: "finished", genre: "work" },
      })
      expect(await observeAll(git, [REQUEST, report])).toMatchObject([
        { files: 1, added: 1, mixed: false },
      ])
    })

    it("件名の接頭辞が ID の前半だけ同じ別タスクのコミット（gh-12 に対する gh-123:）は拾わない", async () => {
      const { git } = stubGit(
        [KNOWN_HEAD],
        { kind: "output", text: "5\t0\tsrc/b.ts\n" },
        {
          commits: { kind: "output", commits: [{ sha: "other1", subject: "gh-123: 別のタスク" }] },
          numstatOfCommit: { other1: { kind: "output", text: "5\t0\tsrc/b.ts\n" } },
        },
      )

      const report = reportEvent({
        toolUseId: "fictional-task-report",
        task: { kind: "task", id: "gh-12", name: "架空の作業", outcome: "finished", genre: "work" },
      })
      expect(await observeAll(git, [REQUEST, report])).toMatchObject([{ files: 1, mixed: true }])
    })

    it("タスクのコミットの numstat が読めなければ何も流さない", async () => {
      const { git } = stubGit(
        [KNOWN_HEAD],
        { kind: "output", text: "1\t1\tsrc/a.ts\n" },
        { commits: { kind: "output", commits: [OWN] } },
      )

      expect(await observeAll(git, [REQUEST, TASK_REPORT])).toEqual([])
    })

    it("タスクのコミットが無く範囲に別のコミットがあれば、範囲全体を数えて mixed を立てる", async () => {
      const { git } = stubGit(
        [KNOWN_HEAD],
        { kind: "output", text: "9\t9\tsrc/other.ts\n" },
        { commits: { kind: "output", commits: [OTHER] } },
      )

      expect(await observeAll(git, [REQUEST, TASK_REPORT])).toMatchObject([
        { files: 1, added: 9, removed: 9, mixed: true },
      ])
    })

    it("コミットの一覧が読めないときも、範囲全体を数えて mixed を立てる", async () => {
      const { git } = stubGit(
        [KNOWN_HEAD],
        { kind: "output", text: "1\t0\tsrc/a.ts\n" },
        { commits: { kind: "unavailable" } },
      )

      expect(await observeAll(git, [REQUEST, TASK_REPORT])).toMatchObject([
        { files: 1, mixed: true },
      ])
    })

    it("範囲にコミットが無く未コミットの変更だけなら、範囲全体を数えて mixed は立てない", async () => {
      const { git } = stubGit([KNOWN_HEAD], { kind: "output", text: "1\t0\tsrc/a.ts\n" })

      expect(await observeAll(git, [REQUEST, TASK_REPORT])).toMatchObject([
        { files: 1, mixed: false },
      ])
    })

    it("別のコミットがあっても変更が空なら mixed は立てない", async () => {
      const { git } = stubGit(
        [KNOWN_HEAD],
        { kind: "output", text: "" },
        { commits: { kind: "output", commits: [OTHER] } },
      )

      expect(await observeAll(git, [REQUEST, TASK_REPORT])).toMatchObject([
        { files: 0, mixed: false },
      ])
    })
  })

  it("差分が空なら 0 ファイルとして数える（数えられないのとは分ける）", async () => {
    const { git } = stubGit([KNOWN_HEAD], { kind: "output", text: "" })

    expect(await observeAll(git, [REQUEST, TASK_REPORT])).toEqual([
      {
        kind: "report-change-summary",
        toolUseId: "fictional-task-report",
        files: 0,
        added: 0,
        removed: 0,
        mixed: false,
      },
    ])
  })

  it("HEAD が読めないときは何も流さない", async () => {
    const { git, askedSince } = stubGit([{ kind: "unknown" }], { kind: "output", text: "" })

    expect(await observeAll(git, [REQUEST, TASK_REPORT])).toEqual([])
    expect(askedSince()).toEqual([])
  })

  it("控えた HEAD が祖先でない・git が打てないとき（unavailable）は何も流さない", async () => {
    const { git } = stubGit([KNOWN_HEAD], { kind: "unavailable" })

    expect(await observeAll(git, [REQUEST, TASK_REPORT])).toEqual([])
  })

  it("numstat に読めない行があれば何も流さない", async () => {
    const { git } = stubGit([KNOWN_HEAD], { kind: "output", text: "1\t2\tsrc/a.ts\n架空の行\n" })

    expect(await observeAll(git, [REQUEST, TASK_REPORT])).toEqual([])
  })

  it("task の無い report では数えない", async () => {
    const { git, askedSince } = stubGit([KNOWN_HEAD], { kind: "output", text: "1\t1\ta\n" })

    expect(await observeAll(git, [REQUEST, reportEvent()])).toEqual([])
    expect(askedSince()).toEqual([])
  })

  it("依頼より前の report では数えない", async () => {
    const { git, askedSince } = stubGit([KNOWN_HEAD], { kind: "output", text: "1\t1\ta\n" })

    expect(await observeAll(git, [TASK_REPORT])).toEqual([])
    expect(askedSince()).toEqual([])
  })

  it("次の依頼で HEAD を控え直し、途中の turn-started では控え直さない", async () => {
    const { git, askedSince } = stubGit(
      [KNOWN_HEAD, { kind: "known", sha: "bbbb222" }, { kind: "known", sha: "cccc333" }],
      { kind: "output", text: "" },
    )

    await observeAll(git, [
      REQUEST,
      { kind: "turn-started" },
      TASK_REPORT,
      REQUEST,
      { kind: "aside", text: "架空の脇の話", images: [] },
      TASK_REPORT,
    ])

    expect(askedSince()).toEqual(["aaaa111", "bbbb222"])
  })
})
