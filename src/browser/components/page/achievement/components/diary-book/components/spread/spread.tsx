import type { ReactElement } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import type { DiaryBookPage } from "../../../../hooks/use-diary-book.ts"
import { LeftPage } from "../left-page/left-page.tsx"
import { RightPage } from "../right-page/right-page.tsx"
import styles from "./spread.module.css"

const LOADING_NOTE = "…"
const FAILED_NOTE = "成果を取れなかった。"

export function Spread(props: { readonly page: DiaryBookPage }): ReactElement {
  const { page } = props
  if (page.kind === "loading") {
    return (
      <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
        {LOADING_NOTE}
      </Text>
    )
  }
  if (page.kind === "failed") {
    return (
      <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
        {FAILED_NOTE}
      </Text>
    )
  }
  return (
    <>
      <LeftPage page={page} />
      <div className={styles["diary-book-gutter"]} />
      <RightPage page={page} />
    </>
  )
}
