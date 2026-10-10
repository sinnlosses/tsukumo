import { describe, expect, it } from "vitest"

import { pendingAskChips } from "../../../../../../../../src/browser/components/page/conversation/components/pending-ask-card/domain/pending-ask-chips.ts"
import type { InquiryModel } from "../../../../../../../../src/browser/stores/inquiry-answer.ts"

type Active = Exclude<InquiryModel, { readonly kind: "none" }>

const COMMON = {
  id: "ask",
  askedAt: 0,
  multiSelect: false,
  progressLabel: "1 / 1",
  questionCount: 1,
  showBack: false,
  last: true,
  focusedLabel: "",
  onFocus: () => {},
  canAnswer: false,
  onToggle: () => {},
  onChoose: () => {},
  onAnswer: () => {},
  onBack: () => {},
} satisfies Partial<Active>

function row(figures: Extract<InquiryModel, { kind: "question" }>["options"][number]["figures"]) {
  return {
    number: 1,
    label: "A",
    text: "A",
    recommended: false,
    description: "",
    preview: undefined,
    selected: false,
    irreversible: false,
    pros: [],
    cons: [],
    byAxis: [],
    figures,
  }
}

function question(figures: Parameters<typeof row>[0]): InquiryModel {
  return {
    ...COMMON,
    kind: "question",
    header: "h",
    brief: undefined,
    text: "t",
    writtenAnswer: "",
    onAnswerWithText: () => {},
    options: [row(figures)],
  }
}

function list(count: number): Parameters<typeof row>[0] {
  return [
    {
      kind: "list",
      style: "bullet",
      items: Array.from({ length: count }, (_, i) => ({
        label: `項目${String(i + 1)}`,
        text: "",
        done: false,
      })),
      fold: "",
    },
  ]
}

describe("pendingAskChips", () => {
  it("質問は添え書きの図の塊のうち最初の list の項目を出す", () => {
    expect(pendingAskChips(question(list(3))).shown).toEqual(["項目1", "項目2", "項目3"])
  })

  it("6つを超えたら6つまでと、省いた数を返し、全項目も持つ", () => {
    const chips = pendingAskChips(question(list(11)))

    expect(chips.shown).toHaveLength(6)
    expect(chips.omittedCount).toBe(5)
    expect(chips.all).toHaveLength(11)
  })

  it("list が無い質問は空", () => {
    expect(pendingAskChips(question([])).all).toEqual([])
  })

  it("許可は対象の1行を出し、対象が無ければ空", () => {
    const permission = (targetText: string): InquiryModel => ({
      ...COMMON,
      kind: "permission",
      toolName: "Bash",
      targetText,
      options: [],
    })

    expect(pendingAskChips(permission("git status\n--short")).shown).toEqual(["git status"])
    expect(pendingAskChips(permission("")).all).toEqual([])
  })

  it("答え待ちが無ければ空", () => {
    expect(pendingAskChips({ kind: "none" }).all).toEqual([])
  })
})
