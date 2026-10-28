import { createComponentImplementation, type ReactComponentImplementation } from "@a2ui/react/v0_9"
import { Catalog, MessageProcessor } from "@a2ui/web_core/v0_9"
import { describe, expect, it } from "vitest"

import { loadReportCatalogApis } from "../../../src/browser/lib/a2ui-catalog-load.ts"

function processorOfDocument() {
  const apis = loadReportCatalogApis()
  const implementations = [...apis.components.values()].map((api) =>
    createComponentImplementation(api, () => null),
  )
  const catalog = new Catalog<ReactComponentImplementation>(apis.id, "v0.9", implementations, [])
  return { processor: new MessageProcessor<ReactComponentImplementation>([catalog]), catalog }
}

describe("loadReportCatalogApis", () => {
  it("Catalog.fromJson が文書を読み、26 部品を持つ", () => {
    const catalog = loadReportCatalogApis()

    expect(catalog.components.size).toBe(26)
    expect(catalog.components.has("Report")).toBe(true)
    expect(catalog.components.has("Row")).toBe(true)
  })

  it("Report・Section・Row・Paragraph を含むメッセージを受け、数を入れた text は拒む", () => {
    const { processor, catalog } = processorOfDocument()
    processor.processMessages([
      { version: "v0.9", createSurface: { surfaceId: "r", catalogId: catalog.id } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "r",
          components: [
            { id: "root", component: "Report", children: ["s"] },
            { id: "s", component: "Section", heading: "見出し", children: ["row"] },
            { id: "row", component: "Row", children: ["p"] },
            { id: "p", component: "Paragraph", text: "本文" },
          ],
        },
      },
    ])

    expect(processor.model.surfacesMap.get("r")).toBeDefined()
    expect(() => {
      processor.processMessages([
        {
          version: "v0.9",
          updateComponents: {
            surfaceId: "r",
            components: [{ id: "bad", component: "Paragraph", text: 5 }],
          },
        },
      ])
    }).toThrow(/Paragraph|text/)
  })
})
