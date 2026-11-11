// 返す層の口・節・部品の位置を渡して、案・主張の部品を描く。

import { fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { vi } from "vitest"

import {
  LeafIdentityContext,
  SectionPointContext,
} from "../../src/browser/features/report/leaf-point-context.ts"
import { ClaimsLeaf } from "../../src/browser/features/report/leaf/claims-leaf.tsx"
import { OptionsLeaf } from "../../src/browser/features/report/leaf/options-leaf.tsx"
import { ReplyPointScope } from "../../src/browser/features/report/reply-point.tsx"
import {
  type ReplyPort,
  ReplyPortContext,
  type ReplyPortSlot,
} from "../../src/browser/features/report/reply-port.ts"
import type { A2uiReportComponent } from "../../src/shared/report/a2ui-report-catalog.ts"
import { PLAIN_LEAF_VALUE } from "./direct-leaf-compare.tsx"

/** 字を押して単位を指し、余白の「聞く・頼む」で欄を開いて頼むに切り替える。 */
export function openRequestAt(text: string): HTMLElement {
  fireEvent.click(screen.getByText(text))
  fireEvent.click(screen.getByRole("button", { name: "聞く・頼む" }))
  fireEvent.click(screen.getByRole("radio", { name: "頼む" }))
  return screen.getByRole("textbox")
}

export function renderNoteLeaf(part: A2uiReportComponent, options: { readonly port: boolean }) {
  const ask = vi.fn<ReplyPort["ask"]>()
  const slot: ReplyPortSlot = options.port
    ? {
        kind: "open",
        port: {
          appendDraft: vi.fn<ReplyPort["appendDraft"]>(),
          prependDraft: vi.fn<ReplyPort["prependDraft"]>(),
          ask,
        },
      }
    : { kind: "none" }
  const view = render(
    <ReplyPortContext value={slot}>
      <ReplyPointScope rootRef={createRef<HTMLElement>()}>
        <SectionPointContext
          value={{ kind: "section", reportToolUseId: "toolu_1", heading: "架空の節" }}
        >
          <LeafIdentityContext
            value={{ kind: "leaf", componentId: part.id, componentKind: part.component }}
          >
            {part.component === "Claims" ? (
              <ClaimsLeaf part={part} value={PLAIN_LEAF_VALUE} />
            ) : (
              <OptionsLeaf part={part} value={PLAIN_LEAF_VALUE} />
            )}
          </LeafIdentityContext>
        </SectionPointContext>
      </ReplyPointScope>
    </ReplyPortContext>,
  )
  return { ask, ...view }
}
