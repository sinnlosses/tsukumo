// 画面の色を `document.documentElement`（`:root`）のトークンへ差す・そこから読む。色の検査と差す内容の判断は `appearance-color`。

import {
  ACCENT_TOKEN_NAME,
  appearanceTokenName,
  appearanceTokenWrites,
  backgroundVeilFloorWrite,
  type AppearanceColorKey,
  type AppearanceColorOverride,
  type RootTokenWrite,
} from "../domain/appearance-color.ts"

/** `:root` に反映する。`undefined` は「上書きしない」＝ 既定に戻す。背景の覆いの下限も差し直す。 */
export function applyAppearanceColorOverride(value: AppearanceColorOverride): void {
  appearanceTokenWrites(value).forEach(writeRootToken)
  writeRootToken(
    backgroundVeilFloorWrite({
      ground: readCurrentColor("ground"),
      ink: readCurrentColor("ink"),
    }),
  )
}

/** 今その色に見えている16進値。上書き中ならその値、無ければ `:root` の既定値。 */
export function readCurrentColor(key: AppearanceColorKey): string {
  return readRootToken(appearanceTokenName(key))
}

/** 今のキャラクターの色（`--accent`）。パックが差した値、無ければ `theme.css` の `:root` の既定値が返る。 */
export function readAccentColor(): string {
  return readRootToken(ACCENT_TOKEN_NAME)
}

function writeRootToken(write: RootTokenWrite): void {
  if (write.value === undefined) {
    document.documentElement.style.removeProperty(write.name)
  } else {
    document.documentElement.style.setProperty(write.name, write.value)
  }
}

function readRootToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
