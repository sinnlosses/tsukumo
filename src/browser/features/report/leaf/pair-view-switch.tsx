// 紙の見せ方（並べる・後だけ・前だけ）の切り替え。最初の `before-after` の対の題の行の右に1つだけ置く。
// 題の番号が無い対は題の行が無いので、その対の図の上に置く。

import { type ReactElement, use } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import type { PairView } from "../domain/pair-view.ts"
import styles from "../renderer/report-notation.module.css"
import { PairViewContext } from "./pair-view-context.ts"

const CHOICES = ["side", "after", "before"] as const satisfies readonly PairView[]

export function PairViewSwitch(): ReactElement {
  const { view, setView, labels } = use(PairViewContext)
  const words = { side: "並べる", after: labels.after, before: labels.before }
  return (
    <div role="group" aria-label="見せ方" className={styles["report-pair-switch"]}>
      {CHOICES.map((choice) => (
        <Button
          key={choice}
          variant="ghost"
          size="label"
          pressed={view === choice ? "on" : "off"}
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["report-pair-switch-view"]}
          onClick={() => setView(choice)}
        >
          {words[choice]}
        </Button>
      ))}
    </div>
  )
}
