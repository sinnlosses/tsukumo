// 「HTML で保存」の結果の1行。押した場所のすぐ下（板では下端の帯のすぐ上）に出す。
// 保存した: 印・パス・「ブラウザで開く」「Finder で表示」・×。できなかった: 理由・「もう一度」・×。
// パスは長いと頭を省き、末尾（ファイル名）を残す。

import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { CloseIcon } from "../../../../ui/icon/icon.tsx"
import type { ReportExportModel } from "./hooks/use-report-export.ts"
import styles from "./main-view.module.css"

type ReportExportNoticeProps = {
  readonly model: ReportExportModel
  /** 「もう一度」で保存し直す。 */
  readonly onRetry: () => void
}

export function ReportExportNotice(props: ReportExportNoticeProps): ReactElement {
  const { notice } = props.model
  if (notice.kind === "none") {
    return <></>
  }
  const close = (
    <Button
      variant="ghost-hover-rule-soft"
      size="label"
      pressed="none"
      disabled={false}
      ariaLabel="知らせを閉じる"
      disclosure={{ kind: "none" }}
      className={styles["report-export-close"]}
      onClick={props.model.dismiss}
    >
      <CloseIcon />
    </Button>
  )
  if (notice.kind === "saved") {
    return (
      <div className={styles["report-export-slot"]}>
        <div className={styles["report-export-notice"]} role="status">
          <span className={styles["report-export-mark"]}>✓ 保存した</span>
          <span className={styles["report-export-path"]}>
            <bdi>{notice.path}</bdi>
          </span>
          <Button
            variant="outline-surface"
            size="label"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["report-export-action"]}
            onClick={props.model.openInBrowser}
          >
            ブラウザで開く
          </Button>
          <Button
            variant="outline-surface"
            size="label"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["report-export-action"]}
            onClick={props.model.revealInFinder}
          >
            Finder で表示
          </Button>
          {close}
        </div>
      </div>
    )
  }
  return (
    <div className={styles["report-export-slot"]}>
      <div className={styles["report-export-notice"]} role="alert" data-failed="">
        <span className={styles["report-export-mark"]}>保存できなかった</span>
        <span className={styles["report-export-path"]}>{notice.reason}</span>
        <Button
          variant="outline-surface"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["report-export-action"]}
          onClick={props.onRetry}
        >
          もう一度
        </Button>
        {close}
      </div>
    </div>
  )
}
