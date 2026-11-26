import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import {
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRows,
} from "../../../../ui/table/table.tsx"
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
      <Table>
        <TableHead>
          <TableRow className="" header>
            <TableHeaderCell align="left" sort="unspecified" hidden={false} scope="col">
              ツール
            </TableHeaderCell>
            <TableHeaderCell align="right" sort="unspecified" hidden={false} scope="col">
              回数
            </TableHeaderCell>
            <TableHeaderCell align="right" sort="unspecified" hidden={false} scope="col">
              結果の大きさ
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableRows>
          {props.tools.rows.map((tool) => (
            <TableRow key={tool.name} className="" header={false}>
              <TableHeaderCell align="left" sort="unspecified" hidden={false} scope="row">
                {tool.name}
              </TableHeaderCell>
              <TableCell
                align="right"
                className={tokenUsageStyles["token-usage-number"]}
                hidden={false}
                span={1}
              >
                {tool.calls}
              </TableCell>
              <TableCell
                align="right"
                className={tokenUsageStyles["token-usage-number"]}
                hidden={false}
                span={1}
              >
                <BarredValue formatted={tool.size} share={tool.share} />
              </TableCell>
            </TableRow>
          ))}
        </TableRows>
      </Table>
      {more.kind === "some" && (
        <Button
          variant="link"
          size="action"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["usage-table-more"]}
          onClick={more.onToggle}
        >
          {more.label}
        </Button>
      )}
    </section>
  )
}
