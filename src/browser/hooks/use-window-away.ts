// 窓が利用者の目の前に無いか（フォーカスが外れている・タブが裏にある）。

import { useEffect, useState } from "react"

export function useWindowAway(): boolean {
  const [away, setAway] = useState(() => document.hidden)

  useEffect(() => {
    const onBlur = (): void => setAway(true)
    const onFocus = (): void => setAway(document.hidden)
    const onVisibilityChange = (): void => setAway(document.hidden)
    window.addEventListener("blur", onBlur)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  return away
}
