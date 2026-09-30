import type { ReactElement } from "react"

import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import type { DiaryBookTocMonth } from "../../../../hooks/use-diary-book.ts"
import { TOC_LABEL } from "../../domain/toc-label.ts"
import styles from "./toc.module.css"

export function Toc(props: {
  readonly months: readonly DiaryBookTocMonth[]
  readonly onSelect: (date: string) => void
}): ReactElement {
  return (
    <div className={styles["diary-book-toc"]} role="dialog" aria-label={TOC_LABEL}>
      {props.months.length === 0 ? (
        <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
          まだ日記が無い。
        </Text>
      ) : (
        props.months.map((month) => (
          <section key={month.heading} className={styles["diary-book-toc-month"]}>
            <Heading
              level={3}
              size="subheading"
              tone="ink"
              weight="bold"
              className={styles["diary-book-toc-heading"]}
            >
              {month.heading}
            </Heading>
            <ul className={styles["diary-book-toc-list"]}>
              {month.days.map((day) => (
                <li key={day.date}>
                  <button
                    type="button"
                    className={styles["diary-book-toc-day"]}
                    onClick={() => {
                      props.onSelect(day.date)
                    }}
                  >
                    {day.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
