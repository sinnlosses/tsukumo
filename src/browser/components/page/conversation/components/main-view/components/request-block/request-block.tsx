// 依頼の塊。見ているやり取りの依頼の全文と添えた画像を、本文の頭に出す。
// 4行を超えたら4行だけ出し、「続き n 行」で開いて「畳む」で畳み直す。
// ページの中の本物の `h2` はこの塊の見出し1つ（レポートの `##` は `h4` に落とす）。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import type { MainViewRequest } from "../../../../../../../../shared/session/main-view.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { PromptImageThumbnails } from "../../../prompt-image/prompt-image.tsx"
import { turnRequestLines } from "../../domain/turn-title.ts"
import styles from "./request-block.module.css"

const REQUEST_LABEL = "依頼"
const COLLAPSE_LABEL = "畳む"

const FOLDED_LINE_COUNT = 4

export type RequestBlockProps = {
  readonly request: MainViewRequest
}

export function RequestBlock(props: RequestBlockProps): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const lines = turnRequestLines(props.request)
  const foldable = lines.length > FOLDED_LINE_COUNT
  const shown = foldable && !expanded ? lines.slice(0, FOLDED_LINE_COUNT) : lines
  const hiddenCount = lines.length - FOLDED_LINE_COUNT

  return (
    <section className={styles["request-block"]}>
      <Heading
        level={2}
        size="label"
        tone="ink-quiet"
        weight="normal"
        className={styles["request-label"]}
      >
        {REQUEST_LABEL}
      </Heading>
      {shown.length > 0 && (
        <Text
          element="p"
          size="secondary"
          tone="inherit"
          weight="inherit"
          className={styles["request-lines"]}
        >
          {shown.map((line, index) => (
            <span key={index}>
              {index > 0 && <br />}
              {line}
            </span>
          ))}
        </Text>
      )}
      {foldable && (
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
          {expanded ? COLLAPSE_LABEL : `続き ${String(hiddenCount)} 行`}
        </Button>
      )}
      <PromptImageThumbnails images={props.request.images} size="full" />
    </section>
  )
}
