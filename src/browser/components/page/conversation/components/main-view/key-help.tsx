// 紙のキーの一覧（`?` で開く）。閉じるのは Esc・外側のクリック。

import type { ReactElement } from "react"

import { Dialog } from "../../../../ui/dialog/dialog.tsx"
import { PAPER_KEYS } from "./domain/key-list.ts"
import styles from "./main-view.module.css"

export function KeyHelp(props: {
  readonly open: boolean
  readonly onClose: () => void
}): ReactElement {
  return (
    <Dialog
      open={props.open}
      ariaLabel="キーの一覧"
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["key-help"] ?? ""}
    >
      <h2 className={styles["key-help-title"]}>キーの一覧</h2>
      <table className={styles["key-help-table"]}>
        <thead>
          <tr>
            <th>キー</th>
            <th>すること</th>
          </tr>
        </thead>
        <tbody>
          {PAPER_KEYS.map((row) => (
            <tr key={row.keys.join("")}>
              <td className={styles["key-help-keys"]}>
                {row.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </td>
              <td>{row.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  )
}
