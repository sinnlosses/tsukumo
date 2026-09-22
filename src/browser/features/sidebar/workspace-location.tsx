// サイドバーの「セッション情報」の、いまどこで動いているかの行
// （`docs/architecture.md`「worktree でセッションを分ける」）。
//
// **出すのは2つの場所**。claude の作業先（切った worktree）と、tsukumo のプロセスが動かして
// いるコードの出所（元の作業ツリー）で、**この2つは常に食い違う** — worktree で直した tsukumo
// 自身のコードは、元へマージして起こし直すまで効かない（T-349 の決定2）。読み取れないと
// デバッグのたびに迷うので、区画を増やさず行だけを足す。
//
// 切っていないとき（git リポジトリでない・`TSUKUMO_WORKTREE=0`）はブランチの行が消える。

import { type ReactElement } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import styles from "./sidebar.module.css"

/**
 * いま動いている場所の行。**まだ届いていないときは行ごと出さない**（`character` の
 * `<select>` と同じ振る舞い。空の値を並べても読み取れるものが無い）。
 *
 * 2列の grid（`sidebar.module.css` の `.session-info`）の直の子として並ぶよう、入れ物を挟まず
 * ラベルと値の対だけを返す。
 */
export function WorkspaceLocation(): ReactElement | null {
  const workspace = useSessionSelector((session) => session.state.workspace)
  if (workspace === undefined) {
    return null
  }

  const { workdir } = workspace
  return (
    <>
      <WorkspaceRow label="作業先" value={workdir.path} />
      {workdir.kind === "worktree" ? (
        <WorkspaceRow label="ブランチ" value={workdir.branch} />
      ) : null}
      <WorkspaceRow label="コードの出所" value={workspace.source} />
    </>
  )
}

/**
 * ラベルと値の対1行。**パスは折り返して全部出す**（省略すると、どの worktree に居るのかを
 * 読み取るという目的そのものが果たせない）。`title` にも同じ文字列を置くので、狭いときでも
 * 触れば1行で読める。
 */
function WorkspaceRow(props: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <>
      <span className={styles["session-info-label"]}>{props.label}</span>
      <span className={styles["session-info-value"]}>
        <span className={styles["workspace-path"]} title={props.value}>
          {props.value}
        </span>
      </span>
    </>
  )
}
