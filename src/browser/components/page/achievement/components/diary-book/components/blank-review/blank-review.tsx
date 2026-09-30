import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import type { AchievementReviewButton } from "../../../../hooks/use-achievement.ts"
import styles from "./blank-review.module.css"

export function BlankReview(props: {
  readonly review: AchievementReviewButton
  readonly writerName: string
}): ReactElement {
  const { review } = props
  return (
    <div className={styles["diary-book-review"]}>
      <Button
        type="button"
        variant="solid-accent"
        size="body"
        pressed="none"
        disabled={review.availability.kind === "blocked"}
        ariaLabel={undefined}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["diary-book-review-button"]}
        onClick={review.onReview}
      >
        <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
          {review.label}
        </Text>
      </Button>
      {review.availability.kind === "blocked" && review.availability.reason !== "" ? (
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["diary-book-review-note"]}
        >
          {review.availability.reason}
        </Text>
      ) : (
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["diary-book-review-note"]}
        >
          {props.writerName}がこのページに日記を書きます
        </Text>
      )}
    </div>
  )
}
