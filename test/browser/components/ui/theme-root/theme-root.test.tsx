import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ThemeRoot } from "../../../../../src/browser/components/ui/theme-root/theme-root.tsx"

afterEach(() => {
  cleanup()
})

describe("ThemeRoot", () => {
  it("<html> に tsukumo のテーマの印が付き、Astryx の部品の文言が日本語になる", () => {
    render(
      <ThemeRoot>
        <Dialog isOpen={true} onOpenChange={() => {}} aria-label="架空のダイアログ">
          <DialogHeader title="架空の見出し" onOpenChange={() => {}} />
        </Dialog>
      </ThemeRoot>,
    )

    expect(document.documentElement.getAttribute("data-astryx-theme")).toBe("tsukumo")
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDefined()
  })
})
