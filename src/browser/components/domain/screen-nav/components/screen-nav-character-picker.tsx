// 帯の左端のキャラクターの顔と、押すと開くキャラクターの選び口。
//
// 同じ部品を広い画面の帯と狭い画面の「≡」の面の両方に置くので、id は `useId()` でこの器ごとに振る（`aria-controls` が指す先が重ならない）。

import clsx from "clsx"
import { ChevronDown } from "lucide-react"
import { useId, type ReactElement } from "react"

import { Text } from "../../../ui/text/text.tsx"
import { CharacterFace } from "../../character-face.tsx"
import type { ScreenNavCharacterPicker as Picker } from "../hooks/use-character-picker.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-character-picker.module.css"

export type ScreenNavCharacterPickerProps = {
  readonly picker: Picker
}

const IN_USE_MARK = "使用中"

export function ScreenNavCharacterPicker(props: ScreenNavCharacterPickerProps): ReactElement {
  const { picker } = props
  // 預け先はここで分解して受ける（`picker.toggleRef` の形のまま渡すと `react(refs)` が落ちる）。
  const { toggleRef } = picker
  const panelId = useId()

  // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
  return (
    <div
      className={clsx(
        styles["screen-nav-character-picker"],
        shellStyles["screen-nav-character-picker"],
      )}
    >
      <button
        type="button"
        ref={toggleRef}
        className={styles["screen-nav-character-picker-toggle"]}
        aria-expanded={picker.open}
        aria-controls={panelId}
        aria-label={picker.label}
        title={picker.label}
        onClick={picker.onToggle}
      >
        <CharacterFace
          url={picker.face.url}
          alt={picker.face.alt}
          className={clsx(styles["screen-nav-face"], shellStyles["screen-nav-face"])}
        />
        <span className={styles["screen-nav-character-picker-mark"]} aria-hidden="true">
          <ChevronDown size={10} strokeWidth={2.2} />
        </span>
      </button>
      {picker.open && (
        <ul
          id={panelId}
          className={clsx(
            styles["screen-nav-character-picker-panel"],
            shellStyles["screen-nav-character-picker-panel"],
          )}
          aria-label="キャラクター"
        >
          {picker.options.map((option) => (
            <li key={option.name}>
              <button
                type="button"
                className={styles["screen-nav-character-picker-option"]}
                aria-current={option.inUse}
                disabled={picker.blocked && !option.inUse}
                title={option.inUse ? undefined : picker.blockedTitle}
                onClick={() => picker.onPick(option.name)}
              >
                <CharacterFace
                  url={option.face.url}
                  alt=""
                  className={styles["screen-nav-character-picker-face"]}
                />
                <Text
                  element="span"
                  size="inherit"
                  tone="inherit"
                  weight="inherit"
                  className={styles["screen-nav-character-picker-name"]}
                >
                  {option.label}
                </Text>
                {option.inUse && (
                  <Text
                    element="span"
                    size="label"
                    tone="accent"
                    weight="inherit"
                    className={styles["screen-nav-character-picker-in-use"]}
                  >
                    {IN_USE_MARK}
                  </Text>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
