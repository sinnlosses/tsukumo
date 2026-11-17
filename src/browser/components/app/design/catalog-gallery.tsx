// カタログの部品を、例ごとに a2ui の面で描いて並べる。並べる部品は渡された一覧のとおりで、ここには名前を書かない。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { type DraftSource, mainViewDraftOf } from "../../../domain/main-view/a2ui-draft-view.ts"
import { A2uiReport } from "../../../features/report/a2ui-surface.tsx"
import { Heading } from "../../ui/heading/heading.tsx"
import { Surface } from "../../ui/surface/surface.tsx"
import { Text } from "../../ui/text/text.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import styles from "./design.module.css"

type CatalogGalleryProps = {
  readonly examples: Readonly<Record<string, readonly A2uiReportComponent[]>>
}

export function CatalogGallery(props: CatalogGalleryProps): ReactElement {
  return (
    <VStack
      element="div"
      name={{ kind: "none" }}
      gap="lg"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className=""
    >
      {Object.entries(props.examples).map(([name, parts]) => (
        <CatalogPart key={name} name={name} parts={parts} />
      ))}
    </VStack>
  )
}

/** 見本は書き終えた一覧で、画像の置き場を持たない。 */
const GALLERY_SOURCE = {
  writing: false,
  imageSource: { kind: "none" },
} as const satisfies DraftSource

function CatalogPart(props: {
  readonly name: string
  readonly parts: readonly A2uiReportComponent[]
}): ReactElement {
  const draft = mainViewDraftOf(`gallery-${props.name}`, props.parts, [], GALLERY_SOURCE)
  const regions = draft?.kind === "parts" ? draft.regions : undefined
  return (
    <div data-catalog-part={props.name} className={styles["design-catalog-part"]}>
      <Surface
        element="section"
        tone="surface"
        space="md"
        radius="lg"
        shadow="none"
        className={styles["design-catalog-surface"]}
      >
        <Heading level={3} size="subheading" tone="ink" weight="bold" className="">
          {props.name}
        </Heading>
        {regions?.a2ui.kind === "surface" ? (
          <A2uiReport
            body={regions}
            view={regions.a2ui}
            reveal={false}
            turnId={0}
            className=""
            revealClassName=""
            blockClassName=""
          />
        ) : (
          <Text element="p" size="body" tone="ink-quiet" weight="normal" className="">
            この例は本文にならなかった
          </Text>
        )}
      </Surface>
    </div>
  )
}
