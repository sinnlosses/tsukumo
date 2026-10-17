import { describe, expect, it } from "vitest"

import type {
  ChangeCountGit,
  GitHead,
  NumstatOutput,
} from "../../../../src/server/core/change-count-git.ts"
import { createReportChangeCounter } from "../../../../src/server/session/core/report-change-count.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }

const TASK_REPORT = reportEvent({
  toolUseId: "fictional-task-report",
  task: { kind: "task", id: "t-001", name: "架空の作業", outcome: "finished" },
})

/** git の代役。HEAD と numstat の出力を決め打ちで返し、問われた HEAD を控える。 */
function stubGit(
  heads: readonly GitHead[],
  numstat: NumstatOutput,
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
      },
    ])
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
