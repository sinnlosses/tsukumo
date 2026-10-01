import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import styles from "../../diary-book.module.css"

export function NavButton(props: {
  readonly label: string | undefined
  readonly fallback: string
  readonly onClick: () => void
  readonly reverse?: boolean
}): ReactElement {
  const disabled = props.label === undefined
  const text = props.label ?? props.fallback
  return (
    <Button
      variant="outline"
      size="secondary"
      pressed="none"
      disabled={disabled}
      ariaLabel={undefined}
      disclosure={{ kind: "none" }}
      ariaHasPopup={undefined}
      title={undefined}
      className={styles["diary-book-topbar-button"]}
      onClick={props.onClick}
    >
      {props.reverse ? (
        <>
          {text}
          {" ›"}
        </>
      ) : (
        <>
          {"‹ "}
          {text}
        </>
      )}
    </Button>
  )
}
