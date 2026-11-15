// 姿の世代が替わったら、その描画のうちに初期値へ戻る state。
// 戻すのは描画中の `setState` で行うので、世代が替わった回の描画から新しい初期値を読む（effect を挟まないので1コミット遅れない）。

import { useState } from "react"

type Keyed<T> = { readonly generation: number; readonly value: T }

export function useGenerationState<T>(
  generation: number,
  initial: () => T,
): readonly [T, (value: T) => void] {
  const [keyed, setKeyed] = useState<Keyed<T>>(() => ({ generation, value: initial() }))
  let current = keyed
  if (keyed.generation !== generation) {
    current = { generation, value: initial() }
    setKeyed(current)
  }
  return [
    current.value,
    (value) => {
      setKeyed({ generation, value })
    },
  ]
}
