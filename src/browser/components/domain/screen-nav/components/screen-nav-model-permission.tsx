// 帯の右端、モデル・effort・許可モードのドロップダウン。
// 枠と下向きの矢印は `Select` が持つので、ここは置き方と字の色だけを渡す。
// キーボードの操作・読み上げ・選択肢の開き方はブラウザに任せる。
//
// 見える項目名は置かない。値（「Opus」「自動判定」）が何の値かは字で分かるので、`aria-label` と `title` に「モデル」「effort」「許可モード」を入れるだけにとどめる。
//
// 3つが1つのまとまりとして動く（狭い画面では丸ごと「≡」の中へ入る）ので、1つの部品に畳んである。
//
// モデル・許可モードはターン進行中も変えられる（起こし直さない）ので、押せない状態を持たない。
// effort だけ、いまのモデルが対応しない・まだ読めていないときに押せなくする（`EffortSelect`）。

import clsx from "clsx"
import { useId, type ReactElement } from "react"

import { EFFORT_PLACEHOLDER_VALUE, effortLabel } from "../../../../domain/effort-label.ts"
import { MODEL_LABELS } from "../../../../domain/model-label.ts"
import { PERMISSION_MODE_LABELS } from "../../../../domain/permission-mode-label.ts"
import type { ModelPermissionControl } from "../../../../stores/model-permission.ts"
import { Select } from "../../../ui/select/select.tsx"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-model-permission.module.css"

export type ScreenNavModelPermissionProps = {
  readonly modelPermission: ModelPermissionControl
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
  const permissionModeClass = clsx(
    styles["screen-nav-permission-mode-select"],
    permissionModeDangerous && styles["is-danger"],
  )
  // 同じ部品が広い画面の帯と狭い画面の「≡」の両方に載るので、`id` は `useId()` で毎回作る。
  // 固定文字列だと開いている間だけ id が重複し、HTML として不正になる。
  const modelSelectId = useId()
  const effortSelectId = useId()
  const permissionModeSelectId = useId()

  // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
  return (
    <span
      className={clsx(
        styles["screen-nav-model-permission"],
        shellStyles["screen-nav-model-permission"],
      )}
    >
      <Select
        id={modelSelectId}
        ariaLabel="モデル"
        frameClassName={styles["screen-nav-select"]}
        className={styles["screen-nav-model-select"]}
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
          frameClassName={styles["screen-nav-select"]}
          className={styles["screen-nav-effort-select"]}
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
          frameClassName={styles["screen-nav-select"]}
          className={styles["screen-nav-effort-select"]}
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
        frameClassName={styles["screen-nav-select"]}
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
