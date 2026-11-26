import type { ReactElement } from "react"

import {
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRows,
} from "../../../../ui/table/table.tsx"
import type { ModelRowView } from "../../hooks/use-token-usage.ts"
import tokenUsageStyles from "../../token-usage.module.css"
import { BarredValue } from "../barred-value/barred-value.tsx"
import { TableCardHead } from "../table-card-head/table-card-head.tsx"

type ModelUsageCardProps = {
  readonly models: readonly ModelRowView[]
}

/**
 * モデル別の札。届く順がそのまま並び順。
 * 出力の列だけに、その列の最大に対する横棒を添える。
 */
export function ModelUsageCard(props: ModelUsageCardProps): ReactElement {
  return (
    <section className={tokenUsageStyles["usage-card"]}>
      <TableCardHead title="モデル別" order="出力の多い順" />
      <Table>
        <TableHead>
          <TableRow className="" header>
            <TableHeaderCell align="left" sort="unspecified" hidden={false} scope="col">
              モデル
            </TableHeaderCell>
            <TableHeaderCell align="right" sort="unspecified" hidden={false} scope="col">
              入力
            </TableHeaderCell>
            <TableHeaderCell align="right" sort="unspecified" hidden={false} scope="col">
              出力
            </TableHeaderCell>
            <TableHeaderCell align="right" sort="unspecified" hidden={false} scope="col">
              キャッシュ読み
            </TableHeaderCell>
            <TableHeaderCell align="right" sort="unspecified" hidden={false} scope="col">
              キャッシュ作成
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableRows>
          {props.models.map((entry) => (
            <TableRow key={entry.model} className="" header={false}>
              <TableHeaderCell align="left" sort="unspecified" hidden={false} scope="row">
                {entry.model}
              </TableHeaderCell>
              <TableCell
                align="right"
                className={tokenUsageStyles["token-usage-number"]}
                hidden={false}
                span={1}
              >
                {entry.input}
              </TableCell>
              <TableCell
                align="right"
                className={tokenUsageStyles["token-usage-number"]}
                hidden={false}
                span={1}
              >
                <BarredValue formatted={entry.output} share={entry.outputShare} />
              </TableCell>
              <TableCell
                align="right"
                className={tokenUsageStyles["token-usage-number"]}
                hidden={false}
                span={1}
              >
                {entry.cacheRead}
              </TableCell>
              <TableCell
                align="right"
                className={tokenUsageStyles["token-usage-number"]}
                hidden={false}
                span={1}
              >
                {entry.cacheCreation}
              </TableCell>
            </TableRow>
          ))}
        </TableRows>
      </Table>
    </section>
  )
}
