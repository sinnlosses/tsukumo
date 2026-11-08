// 返す層の口・節・部品の位置を渡して、案・主張の部品を描く。

import { fireEvent, render, screen } from "@testing-library/react"
import { vi } from "vitest"

/** 同じ名前のボタンの `index` 番目を押す。 */
export function clickNthButton(name: string, index: number): void {
  const button = screen.getAllByRole("button", { name })[index]
  if (button === undefined) {
    throw new Error(`ボタンが足りない: ${name} の ${String(index)} 番目`)
  }
  fireEvent.click(button)
}

import {
  LeafIdentityContext,
  SectionPointContext,
} from "../../src/browser/features/report/leaf-point-context.ts"
import { ClaimsLeaf } from "../../src/browser/features/report/leaf/claims-leaf.tsx"
import { OptionsLeaf } from "../../src/browser/features/report/leaf/options-leaf.tsx"
import {
  type ReplyPort,
  ReplyPortContext,
  type ReplyPortSlot,
} from "../../src/browser/features/report/reply-port.ts"
import type { A2uiReportComponent } from "../../src/shared/report/a2ui-report-catalog.ts"
import { PLAIN_LEAF_VALUE } from "./direct-leaf-compare.tsx"

export function renderNoteLeaf(part: A2uiReportComponent, options: { readonly port: boolean }) {
  const ask = vi.fn<ReplyPort["ask"]>()
  const slot: ReplyPortSlot = options.port
    ? { kind: "open", port: { appendDraft: vi.fn<ReplyPort["appendDraft"]>(), ask } }
    : { kind: "none" }
  const view = render(
    <ReplyPortContext value={slot}>
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
    </ReplyPortContext>,
  )
  return { ask, ...view }
}
