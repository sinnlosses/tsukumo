import { Window } from "happy-dom"
import { describe, expect, test } from "vitest"

import { FIGURE_SELECTOR } from "../../../../scripts/capture/lib/paper-figure-selector.ts"

describe("FIGURE_SELECTOR", () => {
  test("mermaid・timeline・カードの連鎖の根だけに当たり、子の class と無関係な要素には当たらない", () => {
    const { document } = new Window()
    document.body.innerHTML = `
      <pre class="mermaid" id="mermaid"></pre>
      <div class="report-timeline_x1" id="timeline"><div class="report-timeline-axis_x3" id="axis"></div></div>
      <ol class="report-card-chain_x2" id="chain"><li class="report-card-chain-card_x4" id="card"></li></ol>
      <div id="other"></div>`
    const ids = Array.from(document.querySelectorAll(FIGURE_SELECTOR)).map((element) => element.id)
    expect(ids).toEqual(["mermaid", "timeline", "chain"])
  })
})
