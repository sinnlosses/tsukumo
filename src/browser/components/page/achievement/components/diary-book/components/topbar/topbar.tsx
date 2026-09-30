import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../achievement.module.css"
import { DIARY_BOOK_TITLE } from "../../../../domain/diary-book-title.ts"
import { TOC_LABEL } from "../../domain/toc-label.ts"
import { NavButton } from "../nav-button/nav-button.tsx"

const CLOSE_LABEL = "閉じる"
const PREVIOUS_LABEL = "前の日"
const NEXT_LABEL = "次の日"

export function Topbar(props: {
  readonly openNote: string
  readonly previous: { readonly label: string } | undefined
  readonly next: { readonly label: string } | undefined
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onToggleToc: () => void
  readonly onClose: () => void
}): ReactElement {
  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
      gap="md"
      align="center"
      justify="start"
      wrap="wrap"
      className=""
    >
      <Text
        element="span"
        size="heading"
        tone="ink"
        weight="inherit"
        className={styles["diary-book-title"]}
      >
        {DIARY_BOOK_TITLE}
      </Text>
      <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
        {props.openNote}
      </Text>
      <div className={styles["diary-book-topbar-spacer"]} />
      <NavButton
        label={props.previous?.label}
        fallback={PREVIOUS_LABEL}
        onClick={props.onPrevious}
      />
      <NavButton label={props.next?.label} fallback={NEXT_LABEL} onClick={props.onNext} reverse />
      <Button
        type="button"
        variant="outline"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["diary-book-topbar-button"]}
        onClick={props.onToggleToc}
      >
        {TOC_LABEL}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["diary-book-topbar-button"]}
        onClick={props.onClose}
      >
        {CLOSE_LABEL}
      </Button>
    </HStack>
  )
}
