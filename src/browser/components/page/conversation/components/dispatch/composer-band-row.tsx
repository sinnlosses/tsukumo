// 入力欄の上の帯（`ComposerBand`）を描く。帯が無いときは何も描かない。

import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import styles from "./dispatch.module.css"
import type { ComposerBand } from "./domain/composer-band.ts"

export function ComposerBandRow({ band }: { readonly band: ComposerBand }): ReactElement {
  return (
    <>
      {(band.kind === "disconnected" || band.kind === "clear-dropped") && (
        <Text
          element="p"
          size="secondary"
          tone={band.kind === "disconnected" ? "state-ng" : "state-warn"}
          weight="inherit"
          className={styles["dispatch-band-text"]}
        >
          <span role="status">{band.text}</span>
        </Text>
      )}
      {band.kind === "ended" && (
        <HStack
          element="div"
          name={{ kind: "none" }}
          gap="sm"
          align="center"
          justify="between"
          wrap="wrap"
          className={styles["dispatch-band"]}
        >
          <Text
            element="p"
            size="secondary"
            tone="state-ng"
            weight="inherit"
            className={styles["dispatch-band-text"]}
          >
            <span role="status">{band.text}</span>
          </Text>
          <Button
            variant="outline"
            size="label"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["dispatch-band-jump"]}
            onClick={band.onRestart}
          >
            {RESTART_LABEL}
          </Button>
        </HStack>
      )}
      {/* 答え待ちのあいだだけ出る帯（誰が何を待っているか）と、お伺いのカードへフォーカスを移す口。 */}
      {band.kind === "inquiry" && (
        <HStack
          element="div"
          name={{ kind: "none" }}
          gap="sm"
          align="center"
          justify="between"
          wrap="wrap"
          className={styles["dispatch-band"]}
        >
          <Text
            element="p"
            size="secondary"
            tone="state-warn"
            weight="inherit"
            className={styles["dispatch-band-text"]}
          >
            {band.text}
          </Text>
          <Button
            variant="outline-hover-warn"
            size="label"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["dispatch-band-jump"]}
            title={JUMP_CONDITION_NOTE}
            ariaDescription={JUMP_CONDITION_NOTE}
            onClick={band.onJump}
          >
            {INQUIRY_JUMP_LABEL}
            <JumpKeyMark />
          </Button>
        </HStack>
      )}
      {band.kind === "favor" && (
        <HStack
          element="div"
          name={{ kind: "none" }}
          gap="sm"
          align="center"
          justify="between"
          wrap="wrap"
          className={styles["dispatch-band"]}
        >
          <Text
            element="p"
            size="secondary"
            tone="accent"
            weight="inherit"
            className={styles["dispatch-band-text"]}
          >
            {band.text}
          </Text>
          <Button
            variant="outline-accent"
            size="label"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["dispatch-band-jump"]}
            title={JUMP_CONDITION_NOTE}
            ariaDescription={JUMP_CONDITION_NOTE}
            onClick={band.onJump}
          >
            {FAVOR_JUMP_LABEL}
            <JumpKeyMark />
          </Button>
        </HStack>
      )}
    </>
  )
}

const INQUIRY_JUMP_LABEL = "選択肢へ"
const FAVOR_JUMP_LABEL = "お願いへ"
const JUMP_KEY = "↑"
const JUMP_CONDITION_NOTE = "入力欄が空のとき ↑ でも移れます"
const RESTART_LABEL = "新しく始める"

/** 口に添えるキーの印。見える字だけで、口の名前には入れない。 */
function JumpKeyMark(): ReactElement {
  return (
    <kbd className={styles["dispatch-band-key"]} aria-hidden="true">
      {JUMP_KEY}
    </kbd>
  )
}
