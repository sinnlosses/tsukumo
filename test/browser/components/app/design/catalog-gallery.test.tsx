import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CATALOG_EXAMPLES } from "../../../../../src/browser/components/app/design/catalog-example.ts"
import { CatalogGallery } from "../../../../../src/browser/components/app/design/catalog-gallery.tsx"
import { REPORT_COMPONENT_SCHEMAS } from "../../../../../src/shared/report/a2ui-report-catalog.ts"

afterEach(cleanup)

const FALLBACK = "この例は本文にならなかった"

function drawnNames(container: HTMLElement): readonly string[] {
  return [...container.querySelectorAll("[data-catalog-part]")].map(
    (element) => element.getAttribute("data-catalog-part") ?? "",
  )
}

describe("カタログの見本", () => {
  it("カタログの全部品が、見本帳に1つずつ本文の面として描かれる", () => {
    const { container } = render(<CatalogGallery examples={CATALOG_EXAMPLES} />)

    expect(drawnNames(container).toSorted()).toEqual(
      Object.keys(REPORT_COMPONENT_SCHEMAS).toSorted(),
    )
    expect(container.textContent).not.toContain(FALLBACK)
  })

  it("見本帳に無い部品があると、カタログとの突き合わせが落ちる", () => {
    const { Report: _omitted, ...withoutReport } = CATALOG_EXAMPLES
    const { container } = render(<CatalogGallery examples={withoutReport} />)

    expect(drawnNames(container).toSorted()).not.toEqual(
      Object.keys(REPORT_COMPONENT_SCHEMAS).toSorted(),
    )
  })
})
