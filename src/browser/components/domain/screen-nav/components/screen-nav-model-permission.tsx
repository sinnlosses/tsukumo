// 帯の右端、モデル・effort・許可モードのドロップダウン（docs/screen-design.md 13.9「動き方の
// 操作子」）。**枠と下向きの矢印は部品（`components/ui/select/select.tsx`）が持つ**ので、ここは置き方と
// 字の色だけを `.screen-nav-select` で渡す（screen-nav.module.css）。キーボードの操作・読み上げ・
// 選択肢の開き方はブラウザに任せる。
//
// **見える項目名は置かない。** 値（「Opus」「自動判定」）が何の値かは字で分かるので、
// `aria-label` と `title` に「モデル」「effort」「許可モード」を入れるだけにとどめる。
//
// **1つの部品に畳んである**のは、3つが1つのまとまりとして動くため——狭い画面では丸ごと
// 「≡」の中へ入る（部屋の名前・仕事/雑談のトグルと同じ畳み方）。
//
// **モデル・許可モードはターン進行中も変えられる**（起こし直さない。いまのサイドバーと同じ）
// ので `disabled` を持たない。**effort だけ、いまのモデルが対応しない・まだ読めていないときに
// `disabled` にする**（`docs/screen-design.md` 13.9「動き方の操作子」。
// `src/browser/components/domain/screen-nav/domain/effort-label.ts` の `EffortSelect`）。

import { useId, type ReactElement } from "react"

import { Select } from "../../../../components/ui/select/select.tsx"
import { EFFORT_PLACEHOLDER_VALUE, effortLabel } from "../domain/effort-label.ts"
import { MODEL_LABELS } from "../domain/model-label.ts"
import { PERMISSION_MODE_LABELS } from "../domain/permission-mode-label.ts"
import { type ScreenNavModelPermission } from "../hooks/use-screen-nav.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-model-permission.module.css"

export type ScreenNavModelPermissionProps = {
  readonly modelPermission: ScreenNavModelPermission
}

export function ScreenNavModelPermissionSelect(props: ScreenNavModelPermissionProps): ReactElement {
  const {
    model,
    onSetModel,
    effort,
    onSetEffort,
    permissionMode,
    permissionModeDangerous,
    onSetPermissionMode,
  } = props.modelPermission
  const permissionModeClass = permissionModeDangerous
    ? `${styles["screen-nav-permission-mode-select"]} ${styles["is-danger"]}`
    : (styles["screen-nav-permission-mode-select"] ?? "")
  // **同じ部品が広い画面の帯と狭い画面の「≡」の両方に載る**（部屋の名前・トグルと同じ畳み方）ので、
  // `id` は `useId()` で毎回作る（固定文字列だと開いている間だけ id が重複し、HTML として不正になる）。
  const modelSelectId = useId()
  const effortSelectId = useId()
  const permissionModeSelectId = useId()

  // **`shellStyles["screen-nav-model-permission"]` は見た目を持たない**（広い画面から隠す規則
  // `.screen-nav > .screen-nav-model-permission` と「≡」の面の中で縦に積む規則
  // `.screen-nav-panel .screen-nav-model-permission` のためだけの参照）。CSS Modules は
  // class 名をファイルごとにハッシュ化するので、`screen-nav.module.css` 側の選択子を当てるには
  // このファイル自身の class も要る（docs/design.md 6.6）。
  return (
    <span
      className={`${styles["screen-nav-model-permission"]} ${shellStyles["screen-nav-model-permission"]}`}
    >
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
      {effort.kind === "known" ? (
        <Select
          id={effortSelectId}
          ariaLabel="effort"
          frameClassName={styles["screen-nav-select"] ?? ""}
          className={styles["screen-nav-effort-select"] ?? ""}
          value={effort.value}
          disabled={false}
          title="effort"
          options={effort.options.map((value) => ({ value, label: effortLabel(value) }))}
          onChange={onSetEffort}
        />
      ) : (
        <Select
          id={effortSelectId}
          ariaLabel="effort"
          frameClassName={styles["screen-nav-select"] ?? ""}
          className={styles["screen-nav-effort-select"] ?? ""}
          value={EFFORT_PLACEHOLDER_VALUE}
          disabled={true}
          title={effort.reason}
          options={[{ value: EFFORT_PLACEHOLDER_VALUE, label: "—" }]}
          onChange={() => {}}
        />
      )}
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
