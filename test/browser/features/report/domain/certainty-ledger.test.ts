import { describe, expect, it } from "vitest"

import { certaintyLedgerOf } from "../../../../../src/browser/features/report/domain/certainty-ledger.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportCheckSeal } from "../../../../../src/shared/report/report-check-seal.ts"
import {
  type ReportCheckInput,
  reportChecksView,
} from "../../../../../src/shared/report/report-check-view.ts"

const check = (
  status: ReportCheckInput["status"],
  label: string,
  command = "",
): ReportCheckInput => ({ status, label, figure: "", command, detail: "", howToVerify: "" })

const SEAL_BY_COMMAND = (input: ReportCheckInput): ReportCheckSeal =>
  input.command === "" ? { kind: "claimed" } : { kind: "run" }

const CHECKS = reportChecksView(
  [
    check("ok", "架空の型検査", "pnpm run fictional"),
    check("unobserved", "架空の目視"),
    check("ng", "架空の単体", "pnpm run fictional-test"),
    check("blocked", "架空の止まり"),
    check("ok", "架空の整形"),
  ],
  () => ({ kind: "unknown" }),
  { kind: "none" },
  SEAL_BY_COMMAND,
)

type ClaimItems = Extract<A2uiReportComponent, { readonly component: "Claims" }>["items"]

const CONFIRMED_CLAIM = {
  claim: "架空の上限は足りる。120 件で見た。",
  certainty: "confirmed",
  basis: "",
  howToVerify: "",
} as const

const claimsPart = (items: ClaimItems): A2uiReportComponent => ({
  id: "claims-1",
  component: "Claims",
  items,
  fold: "",
  aside: "",
})

const CLAIMS = claimsPart([
  CONFIRMED_CLAIM,
  {
    claim: "架空の遅れは読み込みのせい。測っていない。",
    certainty: "inferred",
    basis: "架空の根拠",
    howToVerify: "架空の計測を打つ",
  },
  {
    claim: "架空の別の環境でも動く",
    certainty: "unverified",
    basis: "",
    howToVerify: "架空の確かめ方",
  },
])

describe("certaintyLedgerOf", () => {
  it("落ちた・確かめていない・確かめたの3群に分け、確かめていないは検証の行のあとに確定でない主張を続ける", () => {
    const ledger = certaintyLedgerOf(CHECKS, [CLAIMS])

    expect(ledger.failed.map((row) => row.text)).toEqual(["架空の単体"])
    expect(ledger.unknown.map((row) => row.text)).toEqual([
      "架空の止まり",
      "架空の目視",
      "架空の遅れは読み込みのせい。",
      "架空の別の環境でも動く",
    ])
    expect(ledger.passed.map((row) => [row.text, row.command, row.seal.kind])).toEqual([
      ["架空の型検査", "pnpm run fictional", "run"],
      ["架空の整形", "", "claimed"],
    ])
    expect(ledger.counts).toEqual({ failed: 1, unknown: 4, passed: 2 })
  })

  it("主張の行は1文目だけを持ち、申告のみの印と節の中の主張への飛び先を持つ", () => {
    const [first, second] = certaintyLedgerOf({ kind: "none" }, [CLAIMS]).unknown

    expect(first).toEqual({
      kind: "claim",
      text: "架空の遅れは読み込みのせい。",
      command: "",
      seal: { kind: "claimed" },
      detail: "架空の根拠",
      howToVerify: "架空の計測を打つ",
      targetId: "claim-claims-1-1",
    })
    expect(second?.kind === "claim" ? second.targetId : "").toBe("claim-claims-1-2")
  })

  it("確定の主張は台帳に入らず、検証も無ければどの群も空", () => {
    expect(certaintyLedgerOf({ kind: "none" }, [claimsPart([CONFIRMED_CLAIM])]).counts).toEqual({
      failed: 0,
      unknown: 0,
      passed: 0,
    })
  })
})
