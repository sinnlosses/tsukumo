import { useRef, type ReactElement } from "react"

import { Portrait } from "../../../../../../domain/portrait.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../achievement.module.css"
import type { DiaryBookPage } from "../../../../hooks/use-diary-book.ts"
import { Lamp } from "../../../lamp/lamp.tsx"
import { useFitDiaryPage } from "../../hooks/use-fit-diary-page.ts"
import { BlankReview } from "../blank-review/blank-review.tsx"

const BLANK_BODY = "このページは、まだ白紙。"

export function RightPage(props: {
  readonly page: Extract<DiaryBookPage, { readonly kind: "ready" }>
}): ReactElement {
  const { page } = props
  const pageRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useFitDiaryPage(pageRef, bodyRef)
  return (
    <div ref={pageRef} className={styles["diary-book-right"]}>
      <div className={styles["diary-book-date-head"]}>
        <span className={styles["diary-book-kanji-date"]}>{page.kanjiDate}</span>
        <Text
          element="span"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["diary-book-weekday"]}
        >
          {page.weekday}
        </Text>
        <span className={styles["diary-book-lamp"]}>
          <Lamp level={page.lampLevel} />
          {page.lampLabel}
        </span>
      </div>
      {page.right.kind === "written" ? (
        <div ref={bodyRef} className={styles["diary-book-body"]}>
          {page.right.paragraphs.map((paragraph) => (
            <p key={paragraph.key} className={styles["diary-book-paragraph"]}>
              {paragraph.timeLabel !== undefined && (
                <Text
                  element="span"
                  size="label"
                  tone="ink-quiet"
                  weight="inherit"
                  className={styles["diary-book-paragraph-time"]}
                >
                  {paragraph.timeLabel}
                </Text>
              )}
              {paragraph.body}
            </p>
          ))}
        </div>
      ) : (
        <div ref={bodyRef} className={styles["diary-book-blank-body"]}>
          {BLANK_BODY}
        </div>
      )}
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="lg"
        align="end"
        justify="start"
        wrap="nowrap"
        className={styles["diary-book-signature"]}
      >
        {page.right.kind === "blank" && (
          <BlankReview review={page.right.review} writerName={page.portraitName} />
        )}
        <div className={styles["diary-book-signature-portrait"]}>
          {page.portrait.portraitUrl !== undefined && (
            <Portrait
              url={page.portrait.portraitUrl}
              accent={page.portrait.accent}
              altText={page.portrait.altText}
              expression="default"
              outfit="default"
              motion={undefined}
              className={styles["diary-book-signature-image"]}
            />
          )}
          <Text
            element="span"
            size="subheading"
            tone="ink-quiet"
            weight="inherit"
            className={styles["diary-book-signature-name"]}
          >
            {page.portraitName}
          </Text>
        </div>
      </HStack>
    </div>
  )
}
