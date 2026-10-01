// `image` の塊の画像。サーバの棚（`/report-image/`）から起動トークンを付けて読み、読めなければ「出せない」の札に替える。
//
// 許可リストが `/report-image/` 以外の `src` を属性ごと落とすので、`src` が無い `img` も札にする（外部の URL を指していた画像など）。

import { type JSX, type ReactElement, useState } from "react"
import type { ExtraProps } from "react-markdown"

import { REPORT_IMAGE_PATH_PREFIX } from "../../../../../../../shared/report/report-image.ts"
import { sessionTokenUrl } from "../../../../../../domain/session-token-url.ts"
import styles from "./report-notation.module.css"

const MISSING_TEXT = "画像を出せない（読めなかったか、tsukumo を起こし直して手放した）"

type ReportImageProps = JSX.IntrinsicElements["img"] & ExtraProps

export function ReportImage(props: ReportImageProps): ReactElement {
  const [failed, setFailed] = useState(false)
  const alt = props.alt ?? ""

  if (failed || typeof props.src !== "string" || !props.src.startsWith(REPORT_IMAGE_PATH_PREFIX)) {
    return (
      <span role="img" aria-label={alt} className={styles["report-image-missing"]}>
        {MISSING_TEXT}
      </span>
    )
  }
  return <img src={sessionTokenUrl(props.src)} alt={alt} onError={() => setFailed(true)} />
}
