// 聞いた部品の下に出す、指した所の1行と問い・答えの対。題の行の右に出すバッジもここに置く。

import type { ReactElement } from "react"

import { Badge } from "../../../components/ui/badge/badge.tsx"
import { Button } from "../../../components/ui/button/button.tsx"
import { DEFAULT_CHARACTER_NAME } from "../../../domain/portrait-appearance.ts"
import { useSession } from "../../../stores/session.ts"
import type { AskPair, LeafAskThread } from "../domain/ask-thread.ts"
import styles from "./leaf.module.css"

export function AskBadge(props: { readonly thread: LeafAskThread }): ReactElement {
  const { thread } = props
  return (
    <Badge tone={thread.waiting ? "warn" : "accent"} shape="pill" className="">
      聞 {thread.count}・{thread.waiting ? "答え待ち" : "答えた"}
    </Badge>
  )
}

type AskThreadViewProps = {
  readonly thread: LeafAskThread
  /** 題の行を持つ部品か。持たない部品は、バッジを答えの欄の頭に置く。 */
  readonly captioned: boolean
  /** 「続けて聞く」。同じ指した所でその場の入力欄を開く。 */
  readonly onContinue: (pair: AskPair) => void
  /** 「これを頼む」。答えの字を下書きにして、同じ指した所で頼むの入力欄を開く。 */
  readonly onRequest: (pair: AskPair) => void
}

export function AskThreadView(props: AskThreadViewProps): ReactElement {
  const characterName =
    useSession((session) => session.state.character?.name) ?? DEFAULT_CHARACTER_NAME
  return (
    <div className={styles["ask-thread"]} role="group" aria-label="聞いたこと">
      {!props.captioned && <AskBadge thread={props.thread} />}
      {props.thread.pairs.map((pair, index) => (
        <div className={styles["ask-pair"]} key={`${String(index)}:${pair.question}`}>
          <p className={styles["ask-pointed"]}>
            ↳ {pair.row === undefined ? "この部品について" : `${pair.row.label}の行について`}
          </p>
          <p>
            <span className={styles["ask-speaker"]}>あなた</span> {pair.question}
          </p>
          <p>
            {pair.answer.kind === "answered" ? (
              <>
                <span className={styles["ask-speaker"]}>{characterName}</span> {pair.answer.text}
              </>
            ) : (
              `${characterName}が調べています…（作業は始めていない）`
            )}
          </p>
          {pair.answer.kind === "answered" && (
            <Button
              variant="ghost"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["ask-continue"]}
              onClick={() => {
                props.onRequest(pair)
              }}
            >
              これを頼む
            </Button>
          )}
          {pair.answer.kind === "answered" && (
            <Button
              variant="ghost"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["ask-continue"]}
              onClick={() => {
                props.onContinue(pair)
              }}
            >
              続けて聞く
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
