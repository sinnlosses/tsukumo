// 帯の右端、モデル・許可モードのドロップダウン（docs/design.md 13.9「動き方の操作子」）。
// **枠と下向きの矢印は部品（`components/select.tsx`）が持つ**ので、ここは置き方と字の色だけを
// `.screen-nav-select` で渡す（screen-nav.module.css）。キーボードの操作・読み上げ・選択肢の
// 開き方はブラウザに任せる。
//
// **見える項目名は置かない。** 値（「Opus」「自動判定」）が何の値かは字で分かるので、
// `aria-label` と `title` に「モデル」「許可モード」を入れるだけにとどめる。
//
// **1つの部品に畳んである**のは、2つが1つのまとまりとして動くため——狭い画面では丸ごと
// 「≡」の中へ入る（部屋の名前・仕事/雑談のトグルと同じ畳み方）。
//
// **ターン進行中も変えられる**（起こし直さない。いまのサイドバーと同じ）ので、`disabled` は
// 持たない。

import { useId, type ReactElement } from "react"

import { Select } from "../../../components/select.tsx"
import { MODEL_LABELS } from "../../../lib/model-label.ts"
import { PERMISSION_MODE_LABELS } from "../../../lib/permission-mode-label.ts"
import { type ScreenNavModelPermission } from "../hooks/use-screen-nav.ts"
import styles from "../screen-nav.module.css"

export type ScreenNavModelPermissionProps = {
  readonly modelPermission: ScreenNavModelPermission
}

export function ScreenNavModelPermissionSelect(props: ScreenNavModelPermissionProps): ReactElement {
  const { model, onSetModel, permissionMode, permissionModeDangerous, onSetPermissionMode } =
    props.modelPermission
  const permissionModeClass = permissionModeDangerous
    ? `${styles["screen-nav-permission-mode-select"]} ${styles["is-danger"]}`
    : (styles["screen-nav-permission-mode-select"] ?? "")
  // **同じ部品が広い画面の帯と狭い画面の「≡」の両方に載る**（部屋の名前・トグルと同じ畳み方）ので、
  // `id` は `useId()` で毎回作る（固定文字列だと開いている間だけ id が重複し、HTML として不正になる）。
  const modelSelectId = useId()
  const permissionModeSelectId = useId()

  return (
    <span className={styles["screen-nav-model-permission"]}>
      <Select
        id={modelSelectId}
        ariaLabel="モデル"
        frameClassName={styles["screen-nav-select"] ?? ""}
        className={styles["screen-nav-model-select"] ?? ""}
        value={model}
        disabled={false}
        title="モデル"
        options={MODEL_LABELS.map(([value, label]) => ({ value, label }))}
        onChange={onSetModel}
      />
      <Select
        id={permissionModeSelectId}
        ariaLabel="許可モード"
        frameClassName={styles["screen-nav-select"] ?? ""}
        className={permissionModeClass}
        value={permissionMode}
        disabled={false}
        title="許可モード"
        options={PERMISSION_MODE_LABELS.map(([value, label]) => ({ value, label }))}
        onChange={onSetPermissionMode}
      />
    </span>
  )
}
