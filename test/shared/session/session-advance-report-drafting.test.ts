import { describe, expect, it } from "vitest"

import { a2uiWrittenComponentSchema } from "../../../src/shared/report/a2ui-report-catalog.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { draftComponentsOf, reportDraftingOf } from "../../../src/shared/session/turn-progress.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"
import { apply } from "../../fixture/session-state.ts"
import { checkedToolUseId } from "../../fixture/tool-use-id.ts"

const REPORT_CALL = checkedToolUseId("toolu_r1")
const REDRAFT_CALL = checkedToolUseId("toolu_r2")
const OTHER_CALL = checkedToolUseId("toolu_other")

describe("applySessionEvent（report を書いている間）", () => {
  // 立ち絵の「書いている」の材料（`resolvePortraitMotion`）。
  const REQUEST = requestEvent()
  const DRAFTING: SessionEvent = { kind: "report-drafting", toolUseId: REPORT_CALL }

  it("report-drafting で書いている途中になり、同じ呼び出しの report で下りる", () => {
    expect(reportDraftingOf(apply(REQUEST, DRAFTING).sdkTurn)).toEqual({
      kind: "drafting",
      toolUseId: REPORT_CALL,
      components: [],
      held: [],
    })
    expect(
      reportDraftingOf(apply(REQUEST, DRAFTING, reportEvent({ toolUseId: REPORT_CALL })).sdkTurn),
    ).toEqual({ kind: "idle" })
  })

  describe("部品", () => {
    const SECTION_A: SessionEvent = {
      kind: "report-draft-component",
      toolUseId: REPORT_CALL,
      component: { id: "a", component: "Section", heading: "架空の見出し", children: ["x"] },
    }
    const SECTION_B: SessionEvent = {
      kind: "report-draft-component",
      toolUseId: REPORT_CALL,
      component: { id: "b", component: "Section", heading: "別の見出し", children: ["y"] },
    }
    const componentIds = (state: ReturnType<typeof apply>): readonly string[] => {
      const drafting = reportDraftingOf(state.sdkTurn)
      return drafting.kind === "drafting" ? drafting.components.map(({ id }) => id) : []
    }

    it("届くたびに草稿が届いた順に伸びる", () => {
      expect(componentIds(apply(REQUEST, DRAFTING, SECTION_A))).toEqual(["a"])
      expect(componentIds(apply(REQUEST, DRAFTING, SECTION_A, SECTION_B))).toEqual(["a", "b"])
    })

    describe("式を持つ部品", () => {
      const draftOf = (component: unknown): SessionEvent => ({
        kind: "report-draft-component",
        toolUseId: REPORT_CALL,
        component: a2uiWrittenComponentSchema.parse(component),
      })
      const SLIDER = draftOf({
        id: "sl",
        component: "ParameterSlider",
        name: "n",
        label: "件数",
        min: 0,
        max: 10,
        step: 1,
        initial: 3,
      })
      const FORMATTED = draftOf({
        id: "p",
        component: "Paragraph",
        text: { call: "format", args: { template: "合計 ${n * 2} 件" } },
      })
      const textsOf = (state: ReturnType<typeof apply>) =>
        draftComponentsOf(reportDraftingOf(state.sdkTurn)).map((part) =>
          part.component === "Paragraph" ? part.text : part.id,
        )

      it("評価できる部品は初期値で出て、評価できない部品は出ない", () => {
        expect(textsOf(apply(REQUEST, DRAFTING, FORMATTED))).toEqual([])
        expect(textsOf(apply(REQUEST, DRAFTING, SLIDER))).toEqual(["件数: 3"])
      })

      it("読む名前のつまみがあとから届くと、次の更新で出る", () => {
        expect(textsOf(apply(REQUEST, DRAFTING, FORMATTED, SLIDER))).toEqual([
          "合計 6 件",
          "件数: 3",
        ])
      })

      it("差し戻された前の草稿の部品も、同じに静的になる", () => {
        const rejected: SessionEvent = {
          kind: "tool-finished",
          toolUseId: REPORT_CALL,
          content: "架空の差し戻し",
          isError: true,
        }
        const redrafting: SessionEvent = { kind: "report-drafting", toolUseId: REDRAFT_CALL }

        expect(textsOf(apply(REQUEST, DRAFTING, SLIDER, FORMATTED, rejected, redrafting))).toEqual([
          "件数: 3",
          "合計 6 件",
        ])
      })
    })

    it("同じ id の再送では増えず、最初のものが残る", () => {
      const resent: SessionEvent = {
        ...SECTION_A,
        component: {
          id: "a",
          component: "Section",
          heading: "書き換わった見出し",
          children: ["x"],
        },
      }
      const drafting = reportDraftingOf(apply(REQUEST, DRAFTING, SECTION_A, resent).sdkTurn)

      expect(drafting.kind === "drafting" ? drafting.components : []).toEqual([
        SECTION_A.kind === "report-draft-component" ? SECTION_A.component : undefined,
      ])
    })

    it("開いていない草稿・別の呼び出しの部品は捨てる", () => {
      expect(reportDraftingOf(apply(REQUEST, SECTION_A).sdkTurn)).toEqual({ kind: "idle" })
      expect(
        componentIds(apply(REQUEST, DRAFTING, { ...SECTION_B, toolUseId: OTHER_CALL })),
      ).toEqual([])
    })

    it("report・差し戻しでない tool-finished・ターンの終わりで草稿が消える", () => {
      const drafted = [REQUEST, DRAFTING, SECTION_A] as const
      const finished: SessionEvent = {
        kind: "tool-finished",
        toolUseId: REPORT_CALL,
        content: "架空の完了",
        isError: false,
      }
      const ended: SessionEvent = { kind: "turn-finished", outcome: { kind: "interrupted" } }

      expect(
        reportDraftingOf(apply(...drafted, reportEvent({ toolUseId: REPORT_CALL })).sdkTurn),
      ).toEqual({ kind: "idle" })
      expect(reportDraftingOf(apply(...drafted, finished).sdkTurn)).toEqual({ kind: "idle" })
      expect(reportDraftingOf(apply(...drafted, ended).sdkTurn)).toEqual({ kind: "idle" })
    })

    describe("差し戻し", () => {
      const REJECTED: SessionEvent = {
        kind: "tool-finished",
        toolUseId: REPORT_CALL,
        content: "架空の差し戻し",
        isError: true,
      }
      const REDRAFTING: SessionEvent = { kind: "report-drafting", toolUseId: REDRAFT_CALL }
      const NEW_A: SessionEvent = {
        kind: "report-draft-component",
        toolUseId: REDRAFT_CALL,
        component: { id: "a", component: "Section", heading: "直した見出し", children: ["x"] },
      }
      const componentsOf = (state: ReturnType<typeof apply>) =>
        draftComponentsOf(reportDraftingOf(state.sdkTurn))
      const headings = (state: ReturnType<typeof apply>) =>
        componentsOf(state).map((c) => (c.component === "Section" ? c.heading : c.id))

      it("差し戻されても部品を保留として持ち続ける", () => {
        const state = apply(REQUEST, DRAFTING, SECTION_A, SECTION_B, REJECTED)

        expect(reportDraftingOf(state.sdkTurn).kind).toBe("held")
        expect(componentsOf(state).map(({ id }) => id)).toEqual(["a", "b"])
      })

      it("書き直しが始まると保留が土台になり、同じ id だけ差し替わる", () => {
        const base = [REQUEST, DRAFTING, SECTION_A, SECTION_B, REJECTED, REDRAFTING] as const

        expect(headings(apply(...base))).toEqual(["架空の見出し", "別の見出し"])
        expect(headings(apply(...base, NEW_A))).toEqual(["直した見出し", "別の見出し"])
      })

      it("保留に無い id は後ろに足す", () => {
        const newC: SessionEvent = {
          kind: "report-draft-component",
          toolUseId: REDRAFT_CALL,
          component: { id: "c", component: "Section", heading: "足した見出し", children: ["z"] },
        }

        expect(
          componentsOf(apply(REQUEST, DRAFTING, SECTION_A, REJECTED, REDRAFTING, newC)).map(
            ({ id }) => id,
          ),
        ).toEqual(["a", "c"])
      })

      it("確定版の report・ターンの終わりで保留も下りる", () => {
        const held = [REQUEST, DRAFTING, SECTION_A, REJECTED] as const
        const ended: SessionEvent = { kind: "turn-finished", outcome: { kind: "interrupted" } }

        expect(
          reportDraftingOf(
            apply(...held, REDRAFTING, reportEvent({ toolUseId: REDRAFT_CALL })).sdkTurn,
          ),
        ).toEqual({ kind: "idle" })
        expect(reportDraftingOf(apply(...held, ended).sdkTurn)).toEqual({ kind: "idle" })
      })
    })
  })

  it("report の待ちの一言は記録に写る", () => {
    const state = apply(
      REQUEST,
      reportEvent({
        toolUseId: REPORT_CALL,
        waitingLine: { kind: "speech", text: "架空の待ちの一言", expression: "bored" },
      }),
    )

    expect(state.records.at(-1)).toMatchObject({
      kind: "report",
      waitingLine: { kind: "speech", text: "架空の待ちの一言", expression: "bored" },
    })
  })

  it("report のフェーズの閉じ方は記録に写る", () => {
    const state = apply(
      REQUEST,
      reportEvent({ toolUseId: REPORT_CALL, workPlanClosing: "stopped" }),
    )

    expect(state.records.at(-1)).toMatchObject({ kind: "report", workPlanClosing: "stopped" })
  })

  it("差し戻されて report が届かなければ、同じ呼び出しの tool-finished で保留に移る", () => {
    const finished = apply(REQUEST, DRAFTING, {
      kind: "tool-finished",
      toolUseId: REPORT_CALL,
      content: "架空の差し戻し",
      isError: true,
    })

    expect(reportDraftingOf(finished.sdkTurn)).toEqual({
      kind: "held",
      toolUseId: REPORT_CALL,
      components: [],
    })
    // report の結果はツールの記録ではないので、「失敗でびくっ」の材料にもならない。
    expect(finished.lastToolFailureAt).toBeUndefined()
  })

  it("ほかの呼び出しの tool-finished では下りない", () => {
    const other = apply(REQUEST, DRAFTING, {
      kind: "tool-finished",
      toolUseId: OTHER_CALL,
      content: "架空の結果",
      isError: false,
    })

    expect(reportDraftingOf(other.sdkTurn).kind).toBe("drafting")
  })

  it("ターンが終わったら（中断で呼び出しが届かなくても）下りる", () => {
    expect(
      reportDraftingOf(
        apply(REQUEST, DRAFTING, { kind: "turn-finished", outcome: { kind: "interrupted" } })
          .sdkTurn,
      ),
    ).toEqual({ kind: "idle" })
  })
})
