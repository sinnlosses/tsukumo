import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { A2uiReportComponent } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { a2uiParts, STAGED_PARTS } from "../../../fixture/a2ui-component.ts"
import { partsDraftOf, WRITING_DRAFT } from "../../../fixture/a2ui-draft.ts"
import { characterInfo, shownPortraits } from "../../../fixture/character.ts"
import { putSession } from "../../session-store.ts"

// `Markdown`（本物は react-markdown 一式で重い）を、渡された塊の文字列をそのまま出す代役に差し替える。
vi.mock("../../../../src/browser/features/report/markdown.tsx", () => ({
  detailBlockClassName: "detail-block",
  arrangedBlockClassNames: { row: "", rowCell: "", panel: "" },
  leafFrameClassNames: {},
  textLeafClassNames: {},
  noteLeafClassNames: {},
  statsLeafClassNames: {},
  checksClassName: () => undefined,
  tagToneClassName: () => "",
  InlineCodeText: (props: { readonly text: string }) => <>{props.text}</>,
  InlineMarkdown: (props: { readonly text: string }) => <>{props.text}</>,
  NoteLabel: (props: { readonly label: string }) => <span>{props.label}</span>,
  Markdown: (props: { readonly text: string }) => <div data-markdown-stub="yes">{props.text}</div>,
}))

const { Report } = await import("../../../../src/browser/features/report/report.tsx")

afterEach(() => {
  cleanup()
  putSession(INITIAL_SESSION_STATE)
})

const SKELETON = "[data-report-pending]"
const PART_SKELETON = '[data-report-pending="part"]'
const HEADING_SKELETON = '[data-report-pending="heading"]'
const PENDING_REGION = '[data-report-region="pending"]'

/** 手で書いた架空のキャラクターのミニ立ち絵。 */
const MINI_URL = "/character/mini.png"
const MINI_CHARACTER = characterInfo({
  ...shownPortraits({ default: "/character/default.png" }),
  mini: MINI_URL,
})

/** 書いている途中の草稿を、骨組みつきで描く要素。 */
function draftElement(components: readonly A2uiReportComponent[], blink = true) {
  const draft = partsDraftOf("toolu_drafted", components, WRITING_DRAFT)
  return (
    <Report
      reveal={false}
      turnId={1}
      className=""
      revealClassName=""
      blockClassName=""
      body={draft.regions}
      pending={{ ...draft.pending, blink }}
    />
  )
}

describe("Report（書いている途中の草稿）", () => {
  it("部品の一覧が伸びた本文で描き直すと、同じ面のまま増えた内容部品が出る", () => {
    const { container, rerender } = render(draftElement(STAGED_PARTS.slice(0, 3)))
    const host = container.querySelector("a2ui-react-report")
    expect(container.textContent).not.toContain("架空の段落三")

    rerender(draftElement(STAGED_PARTS))

    expect(container.textContent).toContain("架空の段落三")
    expect(container.querySelector("a2ui-react-report")).toBe(host)
  })

  it("骨組みは、次に届く見込みの部品の場所に1つだけ置く", () => {
    const { container } = render(draftElement(STAGED_PARTS.slice(0, 3)))

    const skeletons = [...container.querySelectorAll(SKELETON)]
    expect(skeletons).toHaveLength(1)
    expect(skeletons[0]?.matches(PART_SKELETON)).toBe(true)
    expect(skeletons[0]?.previousElementSibling?.textContent).toContain("架空の段落一")
    expect(container.querySelector(PENDING_REGION)).toBeNull()
  })

  it("根の子がまだ届いていなければ、その場所に見出しと本文の骨組みを置く", () => {
    const { container } = render(draftElement(STAGED_PARTS.slice(0, 1)))

    const regions = [...container.querySelectorAll(PENDING_REGION)]
    expect(regions).toHaveLength(1)
    expect(regions[0]?.querySelectorAll(HEADING_SKELETON)).toHaveLength(1)
    expect(regions[0]?.querySelectorAll(PART_SKELETON)).toHaveLength(1)
    expect(container.querySelectorAll(SKELETON)).toHaveLength(2)
  })

  it("骨組みは読み上げに出さず、明滅させるかの印を持つ", () => {
    const moving = render(draftElement(STAGED_PARTS.slice(0, 1)))
    const skeletons = [...moving.container.querySelectorAll(SKELETON)]
    expect(skeletons.every((skeleton) => skeleton.getAttribute("aria-hidden") === "true")).toBe(
      true,
    )
    expect(skeletons.every((skeleton) => skeleton.hasAttribute("data-pending-blink"))).toBe(true)
    moving.unmount()

    const still = render(draftElement(STAGED_PARTS.slice(0, 1), false))
    expect(still.container.querySelectorAll(SKELETON)).toHaveLength(2)
    expect(still.container.querySelector("[data-pending-blink]")).toBeNull()
  })

  it("届いた節は、内容部品より先に見出しを出す", () => {
    const { container } = render(draftElement(STAGED_PARTS.slice(0, 5)))

    const region = container.querySelector(PENDING_REGION)
    expect(region?.querySelector("h4")?.textContent).toBe("架空のセクション二")
    expect(region?.querySelector(HEADING_SKELETON)).toBeNull()
    expect(region?.querySelectorAll(PART_SKELETON)).toHaveLength(1)
  })

  it("次に届く見込みでない節は、届いていれば見出しだけを出し、届いていなければ何も出さない", () => {
    const [root, s1, , , s2] = STAGED_PARTS
    if (root === undefined || s1 === undefined || s2 === undefined) {
      throw new Error("架空の部品が足りない")
    }
    const { container } = render(
      draftElement(a2uiParts({ ...root, children: ["s1", "s2", "s3"] }, s1, s2)),
    )

    const regions = [...container.querySelectorAll(PENDING_REGION)]
    expect(regions.map((region) => region.querySelector("h4")?.textContent)).toEqual([
      "架空のセクション一",
      "架空のセクション二",
    ])
    expect(regions[0]?.querySelectorAll(PART_SKELETON)).toHaveLength(1)
    expect(regions[1]?.querySelector(SKELETON)).toBeNull()
  })

  it("骨組みの欄に内容部品が届いても、欄と見出しを作り直さない", () => {
    const { container, rerender } = render(draftElement(STAGED_PARTS.slice(0, 5)))
    const region = container.querySelector(PENDING_REGION)
    const heading = region?.querySelector("h4")
    expect(heading).not.toBeNull()

    rerender(draftElement(STAGED_PARTS))

    expect(region?.getAttribute("data-report-region")).toBe("section")
    expect(region?.querySelector("h4")).toBe(heading)
    expect(region?.textContent).toContain("架空の段落三")
    expect(container.querySelector(SKELETON)).toBeNull()
  })

  it("部品が届くと、骨組みは作り直さずに次の場所へ移る", () => {
    const { container, rerender } = render(draftElement(STAGED_PARTS.slice(0, 2)))
    const skeleton = container.querySelector(PART_SKELETON)
    expect(skeleton?.previousElementSibling?.textContent).toBe("架空のセクション一")

    rerender(draftElement(STAGED_PARTS.slice(0, 3)))

    expect(container.querySelector(PART_SKELETON)).toBe(skeleton)
    expect(skeleton?.previousElementSibling?.textContent).toContain("架空の段落一")
  })

  it("骨組みの右にミニ立ち絵が1体立ち、部品が届くとミニ立ち絵だけを作り直す", () => {
    putSession({ ...INITIAL_SESSION_STATE, character: MINI_CHARACTER })
    const { container, rerender } = render(draftElement(STAGED_PARTS.slice(0, 2)))
    const images = container.querySelectorAll(`${PART_SKELETON} img`)
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute("src")).toBe(MINI_URL)

    rerender(draftElement(STAGED_PARTS.slice(0, 3)))

    expect(container.querySelectorAll(`${PART_SKELETON} img`)).toHaveLength(1)
    expect(container.querySelector(`${PART_SKELETON} img`)).not.toBe(images[0])
  })

  it("ミニ立ち絵の素材が無いと、骨組みの帯だけを置く", () => {
    putSession({ ...INITIAL_SESSION_STATE, character: undefined })
    const { container } = render(draftElement(STAGED_PARTS.slice(0, 2)))

    expect(container.querySelector(PART_SKELETON)).not.toBeNull()
    expect(container.querySelector("img")).toBeNull()
  })

  it("届いていない部品を渡さない本文は、骨組みも内容部品の無い節も描かない", () => {
    const draft = partsDraftOf("toolu_drafted", STAGED_PARTS.slice(0, 5), WRITING_DRAFT)
    const { container } = render(
      <Report
        reveal={false}
        turnId={1}
        className=""
        revealClassName=""
        blockClassName=""
        body={draft.regions}
      />,
    )

    expect(container.querySelector(SKELETON)).toBeNull()
    expect(container.textContent).not.toContain("架空のセクション二")
  })
})
