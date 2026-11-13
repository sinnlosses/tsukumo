// 新しい器の紙の節を畳む・開くボタン。畳んだ節は部品を外さず、欄の `data-folded` を見て CSS が隠す。

import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { useReadingDepth } from "../../../stores/reading-depth.ts"

export function SectionFoldButton(props: {
  readonly foldKey: string
  readonly folded: boolean
}): ReactElement {
  const toggleFold = useReadingDepth((state) => state.toggleFold)
  return (
    <Button
      variant="ghost"
      size="label"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "expander", expanded: !props.folded }}
      className=""
      onClick={() => toggleFold({ kind: "section", key: props.foldKey })}
    >
      {props.folded ? "開く" : "畳む"}
    </Button>
  )
}
