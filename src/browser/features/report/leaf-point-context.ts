// 「聞く」が指せる位置。節の中の内容部品だけが指せる（図・振り返り・頭の欄は節の外で、既定の `none` のまま）。

import { createContext } from "react"

export type SectionPoint =
  | { readonly kind: "none" }
  | {
      readonly kind: "section"
      readonly reportToolUseId: string
      /** 節の見出しの字。無ければ空。 */
      readonly heading: string
    }

export const SectionPointContext = createContext<SectionPoint>({ kind: "none" })

export type LeafIdentity =
  | { readonly kind: "none" }
  | { readonly kind: "leaf"; readonly componentId: string; readonly componentKind: string }

export const LeafIdentityContext = createContext<LeafIdentity>({ kind: "none" })
