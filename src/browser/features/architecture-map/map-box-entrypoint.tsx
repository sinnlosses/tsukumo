// 説明の枠で、選んだ箱の読み始めるファイルを1行ずつ出し、押すとエディタで開く。

import type { ReactElement } from "react"

import { Button } from "../../components/ui/button/button.tsx"
import { useSession } from "../../stores/session.ts"
import styles from "./map-box-entrypoint.module.css"

export function MapBoxEntrypoints(props: {
  readonly entrypoints: readonly string[]
}): ReactElement {
  const dispatch = useSession((session) => session.dispatch)
  return (
    <div className={styles["section"]}>
      <span className={styles["label"]}>エントリポイント</span>
      {props.entrypoints.map((path) => (
        <Button
          key={path}
          variant="ghost"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          title={path}
          className={styles["entry"]}
          onClick={() => {
            void dispatch.host.openFile({ path })
          }}
        >
          {tailOf(path)}
        </Button>
      ))}
    </div>
  )
}

/** パスの末尾の2区切り（親のディレクトリとファイル名）。 */
function tailOf(path: string): string {
  return path.split("/").slice(-2).join("/")
}
