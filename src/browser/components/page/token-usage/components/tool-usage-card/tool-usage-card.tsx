import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import type { ToolTableView } from "../../hooks/use-token-usage.ts"
import tokenUsageStyles from "../../token-usage.module.css"
import { BarredValue } from "../barred-value/barred-value.tsx"
import { TableCardHead } from "../table-card-head/table-card-head.tsx"
import styles from "./tool-usage-card.module.css"

type ToolUsageCardProps = {
  readonly tools: ToolTableView
}

/**
 * ツール別の札。残りの行があれば「ほか n 件を見る」で開き、開いたら「閉じる」に変えて戻せる。
 * 結果の大きさの列だけに横棒を添える。
 */
export function ToolUsageCard(props: ToolUsageCardProps): ReactElement {
  const { more } = props.tools

  return (
    <section className={tokenUsageStyles["usage-card"]}>
      <TableCardHead title="ツール別" order="結果の大きい順" />
      <table className={clsx(tokenUsageStyles["token-usage-table"], styles["tool-usage-table"])}>
        <thead>
          <tr>
            <th scope="col">ツール</th>
            <th scope="col">回数</th>
            <th scope="col">結果の大きさ</th>
          </tr>
        </thead>
        <tbody>
          {props.tools.rows.map((tool) => (
            <tr key={tool.name}>
              <th scope="row" className={tokenUsageStyles["token-usage-name"]}>
                {tool.name}
              </th>
              <td>{tool.calls}</td>
              <td>
                <BarredValue formatted={tool.size} share={tool.share} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {more.kind === "some" && (
        <Button
          variant="link"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["usage-table-more"]}
          onClick={more.onToggle}
        >
          {more.label}
        </Button>
      )}
    </section>
  )
}
