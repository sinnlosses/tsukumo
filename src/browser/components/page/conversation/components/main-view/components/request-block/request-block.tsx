// 依頼の全文を出す部品。見ているやり取りの依頼と添えた画像を、本文の頭に出す。
// 見出し「依頼」と1行目と開く口「全文」の1行に畳み、開くと全文と画像が出て「畳む」で畳み直す。
// ページの中の本物の `h2` はこの塊の見出し1つ（レポートの `##` は `h4` に落とす）。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import type { MainViewRequest } from "../../../../../../../../shared/session/main-view-shape.ts"
import { withOccurrenceKeys } from "../../../../../../../domain/occurrence-key.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { PromptImageThumbnails } from "../../../prompt-image/prompt-image.tsx"
import { turnRequestLines } from "../../domain/turn-title.ts"
import { useClamped } from "./hooks/use-clamped.ts"
import styles from "./request-block.module.css"

const REQUEST_LABEL = "依頼"
const OPEN_LABEL = "全文"
const COLLAPSE_LABEL = "畳む"

type RequestBlockProps = {
  readonly request: MainViewRequest
}

export function RequestBlock(props: RequestBlockProps): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const { ref, clamped } = useClamped<HTMLParagraphElement>()
  const lines = turnRequestLines(props.request)
  const hasMore = lines.length > 1 || props.request.images.length > 0 || clamped
  const shown = expanded ? lines : lines.slice(0, 1)

  return (
    <section className={styles["request-block"]}>
      <div className={styles["request-row"]}>
        <Heading
          level={2}
          size="secondary"
          tone="ink-quiet"
          weight="normal"
          className={styles["request-label"]}
        >
          {REQUEST_LABEL}
        </Heading>
        <p className={clsx(styles["request-lines"], expanded && styles["is-expanded"])} ref={ref}>
          <Text element="span" size="secondary" tone="inherit" weight="inherit" className="">
            {withOccurrenceKeys(shown, (text) => text).map(({ key, item: line, index }) => (
              <span key={key}>
                {index > 0 && <br />}
                {line}
              </span>
            ))}
          </Text>
        </p>
        {(expanded || hasMore) && (
          <Button
            variant="text-accent"
            size="action"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            ariaHasPopup={undefined}
            disclosure={{ kind: "expander", expanded }}
            title={undefined}
            className={styles["request-more"]}
            onClick={() => {
              setExpanded(!expanded)
            }}
          >
            <span
              className={clsx(styles["request-chevron"], expanded && styles["is-expanded"])}
              aria-hidden="true"
            />
            {expanded ? COLLAPSE_LABEL : OPEN_LABEL}
          </Button>
        )}
      </div>
      {expanded && <PromptImageThumbnails images={props.request.images} size="full" />}
    </section>
  )
}
