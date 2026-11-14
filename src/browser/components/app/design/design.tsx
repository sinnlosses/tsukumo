// 見本帳（`#design`）の入口。部屋の頭の入口には出さず、hash を打って開く。
// デザイントークン・`ui/` の部品・カタログの全部品を1ページに並べる。
// 重ねる紙ではなく画面を置き換えて開くので、会話の画面へ戻るリンクを頭に置く。

import type { ReactElement } from "react"

import { useScreenHref } from "../../../stores/screen.tsx"
import { Heading } from "../../ui/heading/heading.tsx"
import { CATALOG_EXAMPLES } from "./catalog-example.ts"
import { CatalogGallery } from "./catalog-gallery.tsx"
import styles from "./design.module.css"
import { ScreenPartGallery } from "./screen-part-gallery.tsx"
import { TokenGallery } from "./token-gallery.tsx"
import { UiGallery } from "./ui-gallery.tsx"

export function Design(): ReactElement {
  const screenHref = useScreenHref()
  return (
    <main className={styles["design"]}>
      <a className={styles["design-back"]} href={screenHref("conversation")}>
        ← 会話の画面へ戻る
      </a>
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
      <section>
        <Heading level={2} size="heading" tone="ink" weight="bold" className="">
          画面の部品
        </Heading>
        <ScreenPartGallery />
      </section>
    </main>
  )
}
