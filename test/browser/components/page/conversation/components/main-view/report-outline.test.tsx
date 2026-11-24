import { cleanup, render, screen } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import {
  useReportOutline,
  type ReportOutlineProps,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-report-outline.ts"
import { PresentationalReportOutline } from "../../../../../../../src/browser/components/page/conversation/components/main-view/presentational-report-outline.tsx"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** 列は左の列、本文はメインビューに置くので、本文の器を `contentRef` で結んだ兄弟として描く。 */
function Outline(props: {
  readonly turns: ReportOutlineProps["turns"]
  readonly activeTurnId: number
  readonly children: ReactNode
}): ReactElement {
  const { contentRef, ...model } = useReportOutline({
    turns: props.turns,
    activeTurnId: props.activeTurnId,
    onSelectTurn: () => undefined,
  })
  return (
    <>
      <PresentationalReportOutline
        {...model}
        contentRef={contentRef}
        side="turns"
        onSelectSide={() => undefined}
        sessionCount={0}
        sessionBody={undefined}
      />
      <div ref={contentRef}>{props.children}</div>
    </>
  )
}

describe("やり取りの列のやり取りの行", () => {
  it("補足メッセージのあるやり取りの行にだけ、2行目の「脇 n」と読み上げの件数を添える", () => {
    render(
      <Outline
        turns={[
          {
            id: 0,
            title: "架空の前の依頼",
            result: "done",
            asideCount: 0,
            headedSectionIds: [],
            report: { kind: "none" },
          },
          {
            id: 1,
            title: "架空の委譲の依頼",
            result: "working",
            asideCount: 2,
            headedSectionIds: [],
            report: { kind: "none" },
          },
        ]}
        activeTurnId={1}
      >
        <p>架空の本文</p>
      </Outline>,
    )

    expect(screen.getByText("脇 2")).toBeTruthy()
    expect(screen.queryByText(/脇 0/)).toBeNull()
    expect(
      screen.getByRole("button", { name: /架空の委譲の依頼（補足メッセージ 2件）/ }).textContent,
    ).toContain("脇 2")
  })
})
