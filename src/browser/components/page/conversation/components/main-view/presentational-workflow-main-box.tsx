// ワークフロースクリプトの図の両端に置く、メインの「着手」の列と、メインの箱（着手・送り出し）。

import type { ReactElement } from "react"

import { Badge } from "../../../../ui/badge/badge.tsx"
import { ClickableCard } from "../../../../ui/clickable-card/clickable-card.tsx"
import { Surface } from "../../../../ui/surface/surface.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { WorkStripMainBox } from "./hooks/use-work-strip-step-list.ts"
import styles from "./main-view.module.css"

/** 段の列の前の「着手」の列。見出しの下線は点線で、箱は押すと手元に着手の手順を出すメインの箱。 */
export function PresentationalWorkflowPrelude(props: {
  readonly box: WorkStripMainBox
  readonly pressed: boolean
  readonly onPress: () => void
}): ReactElement {
  return (
    <>
      <p
        className={styles["workflow-diagram-column-head"]}
        data-kind="prelude"
        style={{ "--step-start": "1" }}
      >
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="normal"
          className={styles["workflow-diagram-name"]}
        >
          着手
        </Text>
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="normal"
          className={styles["workflow-diagram-head-time"]}
        >
          {props.box.duration}
        </Text>
      </p>
      <div
        className={styles["workflow-diagram-column"]}
        style={{ "--step-start": "1", "--step-span": "1" }}
      >
        <div data-diagram-end="prelude">
          <ClickableCard
            label={`着手 メイン 手順 ${String(props.box.count)}`}
            tone="dashed"
            pressed={props.pressed}
            onClick={props.onPress}
            className=""
          >
            <MainBoxRows name="着手" box={props.box} />
          </ClickableCard>
        </div>
      </div>
    </>
  )
}

/** メインの箱。エージェントの箱と区別できるよう破線の枠に「メイン」の札を付ける。 */
export function PresentationalWorkflowMainBox(props: {
  readonly name: string
  readonly box: WorkStripMainBox
  readonly endKey: string
  readonly current?: boolean
}): ReactElement {
  return (
    <div data-diagram-end={props.endKey} data-current={props.current === true}>
      <Surface
        element="div"
        tone="surface"
        space="sm"
        radius="lg"
        shadow="none"
        className={styles["workflow-diagram-main"]}
      >
        <MainBoxRows name={props.name} box={props.box} />
      </Surface>
    </div>
  )
}

function MainBoxRows(props: {
  readonly name: string
  readonly box: WorkStripMainBox
}): ReactElement {
  const { box } = props
  return (
    <>
      <span className={styles["workflow-diagram-row"]}>
        <Text
          element="span"
          size="label"
          tone="ink"
          weight="semibold"
          className={styles["workflow-diagram-name"]}
        >
          {props.name}
        </Text>
        {box.duration !== "" && (
          <Text
            element="span"
            size="label"
            tone="ink-quiet"
            weight="normal"
            className={styles["workflow-diagram-time"]}
          >
            {box.duration}
          </Text>
        )}
      </span>
      <span className={styles["workflow-diagram-row"]}>
        <Badge tone="accent" shape="square" className="">
          メイン
        </Badge>
        <Text element="span" size="label" tone="ink-quiet" weight="normal" className="">
          手順 {String(box.count)}
        </Text>
      </span>
    </>
  )
}
