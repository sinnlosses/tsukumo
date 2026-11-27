// 説明の枠で、選んだ箱の依存先と依存元を、相手の題と import 数で多い順に並べる。
// 各向きは3件まで出し、残りは「ほか n モジュール」の行を押すと全部を出す。

import { type ReactElement, useState } from "react"

import type { MapView } from "../../../shared/architecture-map/map-view.ts"
import { Button } from "../../components/ui/button/button.tsx"
import styles from "./map-box-connection-list.module.css"

type Connection = {
  readonly title: string
  readonly count: number
}

const CONNECTIONS_SHOWN_COUNT = 3

export function MapBoxConnections(props: {
  readonly boxId: string
  readonly view: MapView
}): ReactElement {
  const { dependencies, dependents } = connectionsOf(props.boxId, props.view)
  return (
    <>
      <ConnectionList label="依存先（import 数）" connections={dependencies} />
      <ConnectionList label="依存元（import 数）" connections={dependents} />
    </>
  )
}

function ConnectionList(props: {
  readonly label: string
  readonly connections: readonly Connection[]
}): ReactElement {
  const [opened, setOpened] = useState(false)
  const hiddenCount = props.connections.length - CONNECTIONS_SHOWN_COUNT
  const folded = hiddenCount > 0 && !opened
  const shown = folded ? props.connections.slice(0, CONNECTIONS_SHOWN_COUNT) : props.connections
  return (
    <div className={styles["section"]}>
      <span className={styles["label"]}>{props.label}</span>
      {props.connections.length === 0 ? (
        <span>なし</span>
      ) : (
        <ul className={styles["rows"]}>
          {shown.map((connection) => (
            <li key={connection.title} className={styles["row"]}>
              <span>{connection.title}</span>
              <span>{connection.count}</span>
            </li>
          ))}
        </ul>
      )}
      {folded && (
        <Button
          variant="ghost"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["more"]}
          onClick={() => {
            setOpened(true)
          }}
        >
          {`ほか ${String(hiddenCount)} モジュール`}
        </Button>
      )}
    </div>
  )
}

function connectionsOf(
  id: string,
  view: MapView,
): { readonly dependencies: readonly Connection[]; readonly dependents: readonly Connection[] } {
  const titleOf = (otherId: string) =>
    view.boxes.find((box) => box.id === otherId)?.title ?? otherId
  const byCountDesc = (a: Connection, b: Connection) => b.count - a.count
  return {
    dependencies: view.edges
      .filter((edge) => edge.from === id)
      .map((edge) => ({ title: titleOf(edge.to), count: edge.count }))
      .toSorted(byCountDesc),
    dependents: view.edges
      .filter((edge) => edge.to === id)
      .map((edge) => ({ title: titleOf(edge.from), count: edge.count }))
      .toSorted(byCountDesc),
  }
}
