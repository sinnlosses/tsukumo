// 新しい器の紙の確かさの台帳。落ちた・確かめていない・確かめたの3群を、1行1つの `details` で描く。
// 落ちた行は開いて出し、確かめた行は読む深さが記録でなければ1行に畳む。

import type { ReactElement } from "react"

import type { ReportCheckSeal } from "../../../../shared/report/report-check-seal.ts"
import { plainInline } from "../../../../shared/report/report-inline-markdown.ts"
import type { ReadingDepth } from "../../../stores/reading-depth.ts"
import type {
  CertaintyLedger as LedgerValue,
  CertaintyLedgerPassedRow,
  CertaintyLedgerRow,
} from "../domain/certainty-ledger.ts"
import { InlineMarkdown } from "../markdown.tsx"
import styles from "./leaf.module.css"
import { stageDisplayName } from "./work-record.tsx"

type Tone = "ng" | "unknown" | "ok"

const GROUPS = [
  { key: "failed", tone: "ng", mark: "✕", word: "落ちた" },
  { key: "unknown", tone: "unknown", mark: "?", word: "確かめていない" },
  { key: "passed", tone: "ok", mark: "✓", word: "確かめた" },
] as const satisfies readonly {
  readonly key: keyof LedgerValue["counts"]
  readonly tone: Tone
  readonly mark: string
  readonly word: string
}[]

const SEEN = "記録あり"
const CLAIMED = "申告のみ"

export function CertaintyLedger(props: {
  readonly ledger: LedgerValue
  readonly depth: ReadingDepth
}): ReactElement {
  const { ledger, depth } = props
  return (
    <div className={styles["ledger"]} role="group" aria-label="確かさの台帳">
      {GROUPS.map(
        (group) =>
          ledger[group.key].length > 0 && (
            <section key={group.key} data-tone={group.tone}>
              <p className={styles["ledger-label"]}>
                {`${group.word} ― ${String(ledger[group.key].length)}件`}
              </p>
              {group.key === "passed" && depth !== 3 ? (
                <PassedFold rows={ledger.passed} />
              ) : (
                ledger[group.key].map((row, index) => (
                  <LedgerRow
                    key={`${String(index)}:${row.text}`}
                    row={row}
                    tone={group.tone}
                    mark={group.mark}
                    open={group.key === "failed" || (group.key === "unknown" && depth === 3)}
                  />
                ))
              )}
            </section>
          ),
      )}
    </div>
  )
}

function LedgerRow(props: {
  readonly row: CertaintyLedgerRow
  readonly tone: Tone
  readonly mark: string
  readonly open: boolean
}): ReactElement {
  const { row, tone } = props
  const origin = originOf(row.seal)
  const hasBody = origin !== "" || row.detail.trim() !== "" || row.howToVerify.trim() !== ""
  return (
    <details className={styles["ledger-row"]} data-tone={tone} open={props.open}>
      <summary>
        <LedgerMark tone={tone} mark={props.mark} />
        <span className={styles["ledger-text"]}>
          <RowText row={row} />
          {row.kind === "check" && row.figure.trim() !== "" && (
            <b className={styles["ledger-figure"]}>{` ${plainInline(row.figure)}`}</b>
          )}
        </span>
        {tone === "unknown" ? <span /> : <Seal seen={row.seal.kind !== "claimed"} />}
        <Command text={row.command === "" && tone === "unknown" ? "未実行" : row.command} />
      </summary>
      {hasBody && (
        <div className={styles["ledger-body"]}>
          {origin !== "" && <p className={styles["ledger-origin"]}>{origin}</p>}
          {row.detail.trim() !== "" && (
            <p>{row.kind === "claim" ? <InlineMarkdown text={row.detail} /> : row.detail}</p>
          )}
          {row.howToVerify.trim() !== "" && (
            <p>
              <span className={styles["ledger-how"]}>確かめ方:</span>{" "}
              {row.kind === "claim" ? (
                <InlineMarkdown text={row.howToVerify} />
              ) : (
                plainInline(row.howToVerify)
              )}
            </p>
          )}
        </div>
      )}
    </details>
  )
}

/** 主張の行の文は、押すと `location.hash` を書かずに同じ紙の中の主張へ転がす（`location.hash` は見ているターンの経路）。 */
function RowText(props: { readonly row: CertaintyLedgerRow }): ReactElement {
  const { row } = props
  if (row.kind === "check") {
    return <>{plainInline(row.text)}</>
  }
  return (
    <a
      href={`#${row.targetId}`}
      onClick={(event) => {
        event.preventDefault()
        const paper =
          event.currentTarget.closest("[data-report-body]") ?? event.currentTarget.ownerDocument
        paper.querySelector(`#${CSS.escape(row.targetId)}`)?.scrollIntoView({ block: "start" })
      }}
    >
      <InlineMarkdown text={row.text} />
    </a>
  )
}

/** 確かめた行の畳み。`summary` は文の頭を「・」でつなぎ、裏取りの印を数えて添える。開くと1件1行の行が出る。 */
function PassedFold(props: { readonly rows: readonly CertaintyLedgerPassedRow[] }): ReactElement {
  const { rows } = props
  const seen = rows.filter((row) => row.seal.kind !== "claimed").length
  const claimed = rows.length - seen
  const sealText = [
    seen > 0 ? `${SEEN} ${String(seen)}` : "",
    claimed > 0 ? `申告 ${String(claimed)}` : "",
  ]
    .filter((part) => part !== "")
    .join(" ・ ")
  return (
    <details className={styles["ledger-row"]} data-tone="ok" data-ledger-fold="">
      <summary>
        <LedgerMark tone="ok" mark="✓" />
        <span className={styles["ledger-text"]}>
          {rows.map((row) => plainInline(row.head)).join("・")}
        </span>
        <span className={styles["ledger-seal"]} data-seen={claimed === 0 ? "" : undefined}>
          {sealText}
        </span>
        <span className={styles["ledger-command"]}>開くと1件ずつ</span>
      </summary>
      <div className={styles["ledger-fold-rows"]}>
        {rows.map((row, index) => (
          <LedgerRow
            key={`${String(index)}:${row.text}`}
            row={row}
            tone="ok"
            mark="✓"
            open={false}
          />
        ))}
      </div>
    </details>
  )
}

function LedgerMark(props: { readonly tone: Tone; readonly mark: string }): ReactElement {
  return (
    <span className={styles["ledger-mark"]} data-tone={props.tone} aria-hidden="true">
      {props.mark}
    </span>
  )
}

/** 4列目のコマンド。字が無ければ列を空けるだけの空の要素を置く。 */
function Command(props: { readonly text: string }): ReactElement {
  return props.text === "" ? (
    <span />
  ) : (
    <code className={styles["ledger-command"]}>{props.text}</code>
  )
}

function Seal(props: { readonly seen: boolean }): ReactElement {
  return (
    <span className={styles["ledger-seal"]} data-seen={props.seen ? "" : undefined}>
      {props.seen ? SEEN : CLAIMED}
    </span>
  )
}

/** 開いた中の、どの記録と照らしたかの1文。申告のみなら空文字。 */
function originOf(seal: ReportCheckSeal): string {
  switch (seal.kind) {
    case "run":
      return "打った Bash と照らした"
    case "record": {
      const { stage } = seal
      const count =
        stage.count.kind === "counted" ? ` ${stage.count.tests.toLocaleString("en-US")}件` : ""
      return `検証の控えと照らした（${stageDisplayName(stage.name)}${count}）`
    }
    case "claimed":
      return ""
  }
}
