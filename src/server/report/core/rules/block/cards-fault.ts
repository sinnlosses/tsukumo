/** 差し戻す `cards` の塊の、塊の並びでの 1 始まりの位置と項目数。`unlabeled` は `label` の空の項目があること。 */
export type CardsFault = {
  readonly position: number
  readonly itemCount: number
  readonly unlabeled: boolean
}
