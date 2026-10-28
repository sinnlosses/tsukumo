// 見本帳（`#design`）の入口。帯には出さず、hash を打って開く。
// デザイントークン・`ui/` の部品・カタログの全部品を1ページに並べる。

import type { ReactElement } from "react"

import { Heading } from "../../ui/heading/heading.tsx"
import { CATALOG_EXAMPLES } from "./catalog-example.ts"
import { CatalogGallery } from "./catalog-gallery.tsx"
import styles from "./design.module.css"
import { TokenGallery } from "./token-gallery.tsx"
import { UiGallery } from "./ui-gallery.tsx"

export function Design(): ReactElement {
  return (
    <main className={styles["design"]}>
      <Heading level={1} size="heading" tone="ink" weight="bold" className="">
        見本帳
      </Heading>
      <section>
        <Heading level={2} size="heading" tone="ink" weight="bold" className="">
          デザイントークン
        </Heading>
        <TokenGallery />
      </section>
      <section>
        <Heading level={2} size="heading" tone="ink" weight="bold" className="">
          ui/ の部品
        </Heading>
        <UiGallery />
      </section>
      <section>
        <Heading level={2} size="heading" tone="ink" weight="bold" className="">
          カタログの部品
        </Heading>
        <CatalogGallery examples={CATALOG_EXAMPLES} />
      </section>
    </main>
  )
}
