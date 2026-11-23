// 箱を指すバッジ。入力欄の頭・利用者の吹き出し・本文・セリフで同じ形を使う。外す口（`onRemove`）があるのは入力欄だけ。

import { X } from "lucide-react"
import type { ReactElement } from "react"

import styles from "./map-box-badge.module.css"
import { MAP_LEVEL_TEXT, type MapBoxBadgeValue } from "./map-box-mention.ts"

type MapBoxBadgeProps = {
  readonly badge: MapBoxBadgeValue
  readonly onRemove?: () => void
}

export function MapBoxBadge({ badge, onRemove }: MapBoxBadgeProps): ReactElement {
  return (
    <span className={styles["badge"]} data-testid="map-box-badge">
      <span className={styles["badge-title"]}>{badge.title}</span>
      <span className={styles["badge-level"]}>{MAP_LEVEL_TEXT[badge.level]}</span>
      {onRemove !== undefined && (
        <button
          type="button"
          className={styles["badge-remove"]}
          aria-label="この箱のバッジを外す"
          onClick={onRemove}
        >
          <X size={12} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
