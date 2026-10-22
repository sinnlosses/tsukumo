import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  useReportOutline,
  type ReportOutlineProps,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report-outline/hooks/use-report-outline.ts"
import { detailBlockClassName } from "../../../../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { useInterimViewing } from "../../../../../../../../../../src/browser/stores/interim-viewing.ts"

const ONE_TURN = {
  turns: [
    {
      id: 0,
      title: "架空の依頼",
      result: "done",
      asideCount: 0,
      newSectionIds: [],
      headedSectionIds: [],
    },
  ],
  activeTurnId: 0,
  onSelectTurn: () => undefined,
  notice: { kind: "none" },
  onNotice: () => undefined,
} as const satisfies ReportOutlineProps

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function NewMarkProbe(props: {
  readonly newSectionIds: readonly number[]
  readonly headedSectionIds: readonly number[]
  readonly content: ReactElement
}): ReactElement {
  const { rows, contentRef, onSelect } = useReportOutline({
    ...ONE_TURN,
    turns: [
      {
        ...ONE_TURN.turns[0],
        newSectionIds: props.newSectionIds,
        headedSectionIds: props.headedSectionIds,
      },
    ],
  })
  return (
    <div>
      {rows.map((entry, index) => (
        <button
          // oxlint-disable-next-line react/no-array-index-key -- 位置で引く検査用の描画
          key={index}
          data-testid={`new-row-${index}`}
          data-new={String(entry.isNew)}
          onClick={() => {
            onSelect(index)
          }}
        />
      ))}
      <div className={detailBlockClassName} ref={contentRef}>
        {props.content}
      </div>
    </div>
  )
}

function Region(props: { readonly id: number; readonly children: ReactNode }): ReactElement {
  return <div data-report-section={String(props.id)}>{props.children}</div>
}

const REGIONS_CONTENT = (
  <>
    <Region id={0}>
      <h4>
        <code>tw accept</code> の判定
      </h4>
    </Region>
    <Region id={1}>
      <h4>a&lt;b &amp; *c* _d_</h4>
      <h5>見出し1の下</h5>
    </Region>
    <Region id={2}>
      <h4>最後の節</h4>
    </Region>
  </>
)

function isNewAt(index: number): string | undefined {
  return screen.getByTestId(`new-row-${index}`).dataset["new"]
}

function newMarks(count: number): readonly (string | undefined)[] {
  return Array.from({ length: count }, (_, index) => isNewAt(index))
}

describe("useReportOutline（「新」の印）", () => {
  beforeEach(() => {
    useInterimViewing.setState(useInterimViewing.getInitialState(), true)
  })

  it("足された節の欄の ID の行にだけ印が付く。描いた字が記号を含んでいても付き、押した行だけ消える", () => {
    render(
      <NewMarkProbe
        newSectionIds={[0, 1]}
        headedSectionIds={[0, 1, 2]}
        content={REGIONS_CONTENT}
      />,
    )

    expect(newMarks(4)).toEqual(["true", "true", "false", "false"])

    fireEvent.click(screen.getByTestId("new-row-0"))

    expect(newMarks(4)).toEqual(["false", "true", "false", "false"])
  })

  it("`###` の行は節に数えず、後ろの節の印がずれない。押すと欄の ID で既読になる", () => {
    render(
      <NewMarkProbe newSectionIds={[2]} headedSectionIds={[0, 1, 2]} content={REGIONS_CONTENT} />,
    )

    expect(newMarks(4)).toEqual(["false", "false", "false", "true"])

    fireEvent.click(screen.getByTestId("new-row-3"))

    expect(useInterimViewing.getState().read[0]).toEqual([2])
  })

  it("中間を見ていないやり取り（足された節が空）では付かない", () => {
    render(
      <NewMarkProbe newSectionIds={[]} headedSectionIds={[0, 1, 2]} content={REGIONS_CONTENT} />,
    )

    expect(newMarks(4)).toEqual(["false", "false", "false", "false"])
  })

  it("逃げ道の塊に `##` があっても、構造の節の行に印が付き、余分な `##` は節の行に数えない", () => {
    const content = (
      <>
        <Region id={0}>
          <h4>一つ目</h4>
        </Region>
        <Region id={1}>
          <h4>二つ目</h4>
          <h4>逃げ道の塊で書かれた見出し</h4>
        </Region>
        <Region id={2}>
          <h4>三つ目</h4>
        </Region>
      </>
    )
    render(<NewMarkProbe newSectionIds={[2]} headedSectionIds={[0, 1, 2]} content={content} />)

    expect(newMarks(4)).toEqual(["false", "false", "false", "true"])
    expect(screen.getByTestId("new-row-3").dataset["new"]).toBe("true")
  })

  it("閉じた `<details>` の中の `##` が目次から外れても、後ろの節の印がずれない", () => {
    const content = (
      <>
        <Region id={0}>
          <h4>一つ目</h4>
          <details>
            <summary>畳み</summary>
            <h4>畳みの中の見出し</h4>
          </details>
        </Region>
        <Region id={1}>
          <h4>二つ目</h4>
        </Region>
      </>
    )
    render(<NewMarkProbe newSectionIds={[1]} headedSectionIds={[0, 1]} content={content} />)

    expect(newMarks(2)).toEqual(["false", "true"])
  })

  it("見出しの無い節の欄の中の `##` は節の行になるが、印も既読の対象にもならない", () => {
    const content = (
      <>
        <Region id={0}>
          <h4>図の先頭の節に書かれた見出し</h4>
        </Region>
        <Region id={1}>
          <h4>構造の見出し</h4>
        </Region>
      </>
    )
    render(<NewMarkProbe newSectionIds={[0, 1]} headedSectionIds={[1]} content={content} />)

    expect(newMarks(2)).toEqual(["false", "true"])

    fireEvent.click(screen.getByTestId("new-row-0"))

    expect(useInterimViewing.getState().read[0]).toBeUndefined()
  })

  it("同じ ID の欄が2つ読めるとき（経過の畳みを開いたとき）は、DOM で先の欄だけが欄の ID を持つ", () => {
    const content = (
      <>
        <Region id={1}>
          <h4>最終の節</h4>
        </Region>
        <Region id={1}>
          <h4>中間の節</h4>
        </Region>
      </>
    )
    render(<NewMarkProbe newSectionIds={[1]} headedSectionIds={[1]} content={content} />)

    expect(newMarks(2)).toEqual(["true", "false"])
  })
})
