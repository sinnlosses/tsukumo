import clsx from "clsx"
import type { ReactElement } from "react"

import type { ModelRowView } from "../../hooks/use-token-usage.ts"
import tokenUsageStyles from "../../token-usage.module.css"
import { BarredValue } from "../barred-value/barred-value.tsx"
import { TableCardHead } from "../table-card-head/table-card-head.tsx"
import styles from "./model-usage-card.module.css"

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
      <table className={clsx(tokenUsageStyles["token-usage-table"], styles["model-usage-table"])}>
        <thead>
          <tr>
            <th scope="col">モデル</th>
            <th scope="col">入力</th>
            <th scope="col">出力</th>
            <th scope="col">キャッシュ読み</th>
            <th scope="col">キャッシュ作成</th>
          </tr>
        </thead>
        <tbody>
          {props.models.map((entry) => (
            <tr key={entry.model}>
              <th scope="row" className={tokenUsageStyles["token-usage-name"]}>
                {entry.model}
              </th>
              <td>{entry.input}</td>
              <td>
                <BarredValue formatted={entry.output} share={entry.outputShare} />
              </td>
              <td>{entry.cacheRead}</td>
              <td>{entry.cacheCreation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
