/** 色見本1つ（画面の差し色・衣装ごとの差し色の両方）。`value` は16進のまま字にも出す。 */
export type AccentSwatchModel = {
  readonly inputId: string
  readonly label: string
  /** ラベルの下に小さく添える字（衣装のモデル名）。 */
  readonly sublabel: { readonly kind: "none" } | { readonly kind: "shown"; readonly text: string }
  /** 読み上げの名前（ラベルと添え字をつないだもの）。 */
  readonly ariaLabel: string
  readonly value: string
  readonly onChange: (color: string) => void
}
