// `graph` の塊を、カードの連鎖・折り返しの図・mermaid のどれで描くかを決める。

import { type CardChainItem, cardChainOf } from "./card-chain-markdown.ts"
import type { GraphFoldFigure } from "./graph-fold-figure.ts"
import { graphFoldFigure } from "./graph-fold.ts"
import type { ReportGraph } from "./report-block-diagram.ts"
import { graphSource } from "./report-graph-markdown.ts"

export type GraphDrawing =
  | { readonly kind: "chain"; readonly chain: readonly CardChainItem[] }
  | { readonly kind: "fold"; readonly figure: GraphFoldFigure }
  | { readonly kind: "mermaid"; readonly source: string }

/** 5 節点以下の一本道はカードの連鎖、折り返して置ける図は折り返し、それ以外は mermaid。 */
export function graphDrawingOf(block: ReportGraph): GraphDrawing {
  const chain = cardChainOf(block.source)
  if (chain !== undefined) {
    return { kind: "chain", chain }
  }
  const figure = graphFoldFigure(block.source)
  if (figure !== undefined) {
    return { kind: "fold", figure }
  }
  return { kind: "mermaid", source: graphSource(block) }
}
