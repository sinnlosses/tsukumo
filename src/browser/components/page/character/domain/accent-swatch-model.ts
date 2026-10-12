/** 色見本1つ。`value` は16進のまま字にも出す。 */
export type AccentSwatchModel = {
  readonly inputId: string
  readonly label: string
  readonly value: string
  readonly onChange: (color: string) => void
}
