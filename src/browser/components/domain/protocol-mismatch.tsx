// サーバとこのページの版（`PROTOCOL_VERSION`）が合わないときに、画面の代わりに出す知らせ
// （docs/design.md 4.4）。**会話の画面は描かない**——形の違う記録を部品に読ませると、無いはずの
// フィールドを読んで壊れる（起こし直していない tsukumo が、組み直した画面を配ったときに起きる）。
//
// 読み込み直して直るのは「プロセスは新しく、タブが古い」ときだけで、逆（プロセスが古い）は
// tsukumo を上げ直すまで直らないので、両方を1行ずつ書く。

import { type ReactElement } from "react"

import styles from "./protocol-mismatch.module.css"

export function ProtocolMismatch(): ReactElement {
  return (
    <div className={styles["protocol-mismatch"]} role="alert">
      <p className={styles["protocol-mismatch-title"]}>tsukumo とこのページの版が合いません</p>
      <p>ページを読み込み直してください。</p>
      <p>読み込み直しても出るときは、tsukumo を上げ直してください。</p>
    </div>
  )
}
