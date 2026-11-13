import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { certaintyLedgerOf } from "../../../../../src/browser/features/report/domain/certainty-ledger.ts"
import { CertaintyLedger } from "../../../../../src/browser/features/report/leaf/certainty-ledger.tsx"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import type { ReadingDepth } from "../../../../../src/browser/stores/reading-depth.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportCheckSeal } from "../../../../../src/shared/report/report-check-seal.ts"
import {
  type ReportCheckInput,
  reportChecksView,
} from "../../../../../src/shared/report/report-check-view.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const check = (
  status: ReportCheckInput["status"],
  label: string,
  command: string,
  detail = "",
): ReportCheckInput => ({ status, label, figure: "", command, detail, howToVerify: "" })

const SEALS: Readonly<Record<string, ReportCheckSeal>> = {
  "pnpm run fictional-test": { kind: "run" },
  "pnpm run typecheck": {
    kind: "record",
    stage: { name: "test", result: "passed", count: { kind: "counted", tests: 12 } },
  },
}

const checksOf = (inputs: readonly ReportCheckInput[]) =>
  reportChecksView(
    inputs,
    () => ({ kind: "unknown" }),
    { kind: "none" },
    (input) => SEALS[input.command] ?? { kind: "claimed" },
  )

const MIXED = checksOf([
  check("ok", "架空の型検査", "pnpm run typecheck"),
  check("ng", "架空の単体", "pnpm run fictional-test", "架空の落ちた理由"),
  check("unobserved", "架空の目視", ""),
  check("ok", "架空の画の確認", ""),
])

const CLAIMS: A2uiReportComponent = {
  id: "c1",
  component: "Claims",
  items: [
    {
      claim: "架空の遅れは読み込みのせい。測っていない。",
      certainty: "inferred",
      basis: "",
      howToVerify: "架空の計測を打つ",
    },
  ],
  fold: "",
  aside: "",
}

function renderLedger(
  checks: ReturnType<typeof checksOf>,
  components: readonly A2uiReportComponent[],
  depth: ReadingDepth,
) {
  return render(<CertaintyLedger ledger={certaintyLedgerOf(checks, components)} depth={depth} />)
}

function rowOf(text: string): HTMLDetailsElement {
  const row = screen.getByText(text).closest("details")
  if (row === null) throw new Error(`${text} の行が無い`)
  return row
}

describe("確かさの台帳", () => {
  it("群を落ちた・確かめていない・確かめたの順に並べ、落ちた行だけを開いて出す", () => {
    const { container } = renderLedger(MIXED, [CLAIMS], 2)

    expect(
      [...container.querySelectorAll("section > p")].map((label) => label.textContent),
    ).toEqual(["落ちた ― 1件", "確かめていない ― 2件", "確かめた ― 2件"])
    expect(rowOf("架空の単体").open).toBe(true)
    expect(rowOf("架空の単体").textContent).toContain("打った Bash と照らした")
    expect(rowOf("架空の目視").open).toBe(false)
  })

  it("読む深さが記録でなければ確かめた行を1行に畳み、裏取りの印を数えて添える", () => {
    renderLedger(MIXED, [], 2)

    const fold = rowOf("架空の型検査・架空の画の確認")
    expect(fold.querySelector("summary")?.textContent).toContain("記録あり 1 ・ 申告 1")
    expect(fold.open).toBe(false)
  })

  it("全部通った台帳は、確かめたの見出しと畳んだ1行だけになる", () => {
    const { container } = renderLedger(checksOf([check("ok", "架空の型検査", "")]), [], 2)

    expect(container.querySelectorAll(":scope > div > section")).toHaveLength(1)
    expect(container.querySelectorAll("section > details")).toHaveLength(1)
  })

  it("読む深さが記録なら、確かめた行を1件1行にし、確かめていない行も開く", () => {
    renderLedger(MIXED, [CLAIMS], 3)

    expect(rowOf("架空の型検査").querySelector("summary")?.textContent).toContain("記録あり")
    expect(rowOf("架空の画の確認").querySelector("summary")?.textContent).toContain("申告のみ")
    expect(rowOf("架空の型検査").textContent).toContain("検証の控えと照らした（単体 12件）")
    expect(rowOf("架空の目視").open).toBe(true)
  })

  it("主張の行は1文目だけを出し、押すと同じ紙の中の主張の要素へ転がす", () => {
    const scrollIntoView = vi.fn<() => void>()
    const target = document.createElement("p")
    target.id = "claim-c1-0"
    target.scrollIntoView = scrollIntoView
    document.body.append(target)

    renderLedger({ kind: "none" }, [CLAIMS], 2)
    fireEvent.click(screen.getByRole("link", { name: "架空の遅れは読み込みのせい。" }))

    expect(screen.queryByText(/測っていない/)).toBeNull()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    target.remove()
  })
})
