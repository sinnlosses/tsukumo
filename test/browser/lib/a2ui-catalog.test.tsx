import {
  createComponentImplementation,
  A2uiSurface,
  type ReactComponentImplementation,
} from "@a2ui/react/v0_9"
import { Catalog, MessageProcessor } from "@a2ui/web_core/v0_9"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

afterEach(() => {
  cleanup()
})

const CATALOG_ID = "https://tsukumo.example/test/a2ui-catalog/v1"

const catalogDocument = {
  catalogId: CATALOG_ID,
  components: {
    Paragraph: {
      type: "object",
      allOf: [
        { $ref: "common_types.json#/$defs/ComponentCommon" },
        {
          type: "object",
          properties: {
            component: { const: "Paragraph" },
            text: { type: "string" },
          },
          required: ["component", "text"],
        },
      ],
      unevaluatedProperties: false,
    },
  },
}

describe("A2UI のカタログ（JSON Schema で書いて fromJson で読ませる）", () => {
  it("1 部品のカタログを MessageProcessor に通すと、A2uiSurface が文字を描く", () => {
    const schemaOnly = Catalog.fromJson(catalogDocument, "v0.9")
    const api = schemaOnly.components.get("Paragraph")
    if (api === undefined) throw new Error("Paragraph が読まれていない")
    const Paragraph = createComponentImplementation(api, ({ props }) => <p>{props.text}</p>)
    const catalog = new Catalog(CATALOG_ID, "v0.9", [Paragraph], [])
    const processor = new MessageProcessor<ReactComponentImplementation>([catalog])
    processor.processMessages([
      { version: "v0.9", createSurface: { surfaceId: "report", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "report",
          components: [{ id: "root", component: "Paragraph", text: "こんにちは" }],
        },
      },
    ])
    const surface = processor.model.surfacesMap.get("report")
    if (surface === undefined) throw new Error("surface が作られていない")

    render(<A2uiSurface surface={surface} />)

    expect(screen.getByText("こんにちは").tagName).toBe("P")
  })
})
