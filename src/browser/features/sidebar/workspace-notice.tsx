// サイドバーの「セッション情報」の先頭に出す、作業場所についての知らせ（畳めなかった
// worktree・マージが止まった理由。`docs/architecture.md`「worktree でセッションを分ける」
// 決定3）。tsukumo が出した知らせであって claude の発言ではないので、メインビューのターンの
// 流れには並べない（同じ節の決定3）。
//
// **作業先・ブランチ・コードの出所の行はここには無い**（T-365 で外した。ブランチは帯の読み
// （`docs/design.md` 13.9「いまの動き方の読み」）へ、作業先・コードの出所のパスは部屋の名前の
// `title` へ移った（同13.9「部屋の名前」）。パスはブランチから辿れる——`worktreeBranch`
// （`src/server/core/workspace.ts`）が `tsukumo/<名前>` とworktree の置き場を同じ `<名前>` から
// 作っているため、外しても読めなくならない）。

import { type ReactElement } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import styles from "./sidebar.module.css"

/**
 * 知らせの行（0件以上）。**2列の grid（`sidebar.module.css` の `.session-info`）の直の子**として
 * 並ぶよう、入れ物を挟まずラベルと値の対だけを返す。知らせが無ければ何も出さない（空の行を
 * 並べても読み取れるものが無い。`character` の `<select>` と同じ振る舞い）。
 */
export function WorkspaceNotice(): ReactElement | null {
  const notices = useSessionSelector((session) => session.state.workspaceNotices)
  if (notices.length === 0) {
    return null
  }

  return (
    <>
      {notices.map((notice) => (
        <NoticeRow key={notice} notice={notice} />
      ))}
    </>
  )
}

/**
 * 知らせ1件。**文面はサーバが組んだまま出す**（`src/server/core/workspace.ts`）。改行も含めて
 * そのまま読めないと、どのブランチのどの worktree を人が引き取るのかが分からない。
 */
function NoticeRow(props: { readonly notice: string }): ReactElement {
  return (
    <>
      <span className={styles["session-info-label"]}>知らせ</span>
      <span className={styles["session-info-value"]}>
        <span className={styles["workspace-notice"]}>{props.notice}</span>
      </span>
    </>
  )
}
