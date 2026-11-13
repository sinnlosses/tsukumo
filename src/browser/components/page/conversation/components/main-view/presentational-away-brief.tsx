// 戻ったときに働くあいだの紙の頭に出す、離れていたあいだのまとめと、どこまで見たかの印。

import type { ReactElement } from "react"

import { InlineMarkdown } from "../../../../../features/report/markdown.tsx"
import type { AwayBrief } from "../../domain/away-brief.ts"
import styles from "./main-view.module.css"
import { WorkPlanAskBlock } from "./presentational-work-plan-ask.tsx"

const AWAY_LABEL = "離れていたあいだのまとめ"
const WAITING = "あなたを待っていること"
const CHANGED = "変わったこと"
const ASSUMED = "置いた前提"
const COURSE = "進め方"
const AS_PLANNED = "計画どおり。"
const REPLANNED = "計画を直した: "
const ANSWER_NEEDED = "あなたの答えが1つ要る。"
const READ_MARK = "ここから先は、前に見たあと"

export function AwayBriefBlock(props: {
  readonly brief: Extract<AwayBrief, { readonly kind: "brief" }>
}): ReactElement {
  const { brief } = props
  const headline = `離れていた ${String(brief.minutes)} 分のあいだに、${String(brief.total)}段のうち${String(brief.settled)}段が済んだ。`
  return (
    <section className={styles["work-plan-away"]} aria-label={AWAY_LABEL}>
      <p className={styles["work-plan-conclusion"]}>
        {brief.waiting.kind === "asked" ? `${headline}${ANSWER_NEEDED}` : headline}
      </p>
      <div>
        {brief.waiting.kind === "asked" && (
          <AwayPart heading={WAITING}>
            <WorkPlanAskBlock ask={brief.waiting} />
          </AwayPart>
        )}
        {brief.changes.length > 0 && (
          <AwayPart heading={CHANGED}>
            <ul className={styles["work-plan-away-list"]}>
              {brief.changes.map((change) => (
                <li key={change.key}>
                  {change.title}
                  {change.summary !== "" && (
                    <>
                      {": "}
                      <InlineMarkdown text={change.summary} />
                    </>
                  )}
                  {change.touched > 0 && `（${String(change.touched)}ファイル）`}
                </li>
              ))}
            </ul>
          </AwayPart>
        )}
        {brief.assumptions.length > 0 && (
          <AwayPart heading={ASSUMED}>
            <ul className={styles["work-plan-away-list"]}>
              {brief.assumptions.map((assumption) => (
                <li key={assumption}>
                  <InlineMarkdown text={assumption} />
                </li>
              ))}
            </ul>
          </AwayPart>
        )}
        <AwayPart heading={COURSE}>
          {brief.replans.length === 0 ? (
            <p>{AS_PLANNED}</p>
          ) : (
            <ul className={styles["work-plan-away-list"]}>
              {brief.replans.map((reason) => (
                <li key={reason}>
                  {REPLANNED}
                  <InlineMarkdown text={reason} />
                </li>
              ))}
            </ul>
          )}
        </AwayPart>
      </div>
    </section>
  )
}

/** 計画の並びの中で、前に見ていた段と新しい段の境に引く印。 */
export function ReadMark(): ReactElement {
  return <li className={styles["work-plan-read-mark"]}>{READ_MARK}</li>
}

function AwayPart(props: {
  readonly heading: string
  readonly children: ReactElement
}): ReactElement {
  return (
    <section className={styles["work-plan-away-part"]}>
      <h3 className={styles["work-plan-turn-heading"]}>{props.heading}</h3>
      <div>{props.children}</div>
    </section>
  )
}
