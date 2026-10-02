// `image` の塊の画像。サーバの棚（`/report-image/`）から起動トークンを付けて読み、読めなければ「出せない」の札に替える。
//
// 許可リストが `/report-image/` 以外の `src` を属性ごと落とすので、`src` が無い `img` も札にする（外部の URL を指していた画像など）。

import { type JSX, type ReactElement, useState } from "react"
import type { ExtraProps } from "react-markdown"

import { REPORT_IMAGE_PATH_PREFIX } from "../../../../../../../shared/report/report-image.ts"
import { sessionTokenUrl } from "../../../../../../domain/session-token-url.ts"
import styles from "./report-notation.module.css"

const MISSING_LABEL = "画像を出せない"
const MISSING_REASON = "読めなかったか、tsukumo を起こし直して手放した"
const MISSING_TEXT = `${MISSING_LABEL}（${MISSING_REASON}）`

type ReportImageProps = JSX.IntrinsicElements["img"] & ExtraProps

export function ReportImage(props: ReportImageProps): ReactElement {
  const [failed, setFailed] = useState(false)
  const alt = props.alt ?? ""

  if (failed || typeof props.src !== "string" || !props.src.startsWith(REPORT_IMAGE_PATH_PREFIX)) {
    return (
      <span role="img" aria-label={alt || MISSING_TEXT} className={styles["report-image-missing"]}>
        <span className={styles["report-image-missing-body"]} aria-hidden="true">
          <MissingImageIcon />
          <span className={styles["report-image-missing-label"]}>{MISSING_LABEL}</span>
          <span className={styles["report-image-missing-reason"]}>{MISSING_REASON}</span>
        </span>
      </span>
    )
  }
  return <img src={sessionTokenUrl(props.src)} alt={alt} onError={() => setFailed(true)} />
}

function MissingImageIcon(): ReactElement {
  return (
    <span className={styles["report-image-missing-icon"]}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M21 16l-5-5-6 6M3 3l18 18" />
      </svg>
    </span>
  )
}
