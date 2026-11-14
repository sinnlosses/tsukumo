// デザイントークンを、名前・見本・使い分けの表にして並べる。値は `theme.css` の `var()` をそのまま当てて描く。

import type { CSSProperties, ReactElement } from "react"

import { Heading } from "../../ui/heading/heading.tsx"
import { Text } from "../../ui/text/text.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import {
  COLOR_TOKENS,
  FONT_TOKENS,
  MOTION_TOKENS,
  RADIUS_TOKENS,
  SHADOW_TOKENS,
  SPACE_TOKENS,
} from "./design-token-list.ts"
import styles from "./design.module.css"

type Token = { readonly name: string; readonly use: string }

export function TokenGallery(): ReactElement {
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
      <TokenTable title="色" tokens={COLOR_TOKENS} sample={colorSample} />
      <TokenTable title="字の大きさ" tokens={FONT_TOKENS} sample={fontSample} />
      <TokenTable title="余白" tokens={SPACE_TOKENS} sample={spaceSample} />
      <TokenTable title="角丸" tokens={RADIUS_TOKENS} sample={radiusSample} />
      <TokenTable title="影" tokens={SHADOW_TOKENS} sample={shadowSample} />
      <TokenTable title="動き" tokens={MOTION_TOKENS} sample={motionSample} />
    </VStack>
  )
}

function colorSample(name: string): ReactElement {
  return <span className={styles["design-swatch"]} style={{ background: `var(${name})` }} />
}

function fontSample(name: string): ReactElement {
  return <span style={{ fontSize: `var(${name})` }}>あいうABC</span>
}

function spaceSample(name: string): ReactElement {
  return <span className={styles["design-space-bar"]} style={{ width: `var(${name})` }} />
}

function radiusSample(name: string): ReactElement {
  return (
    <span className={styles["design-radius-sample"]} style={{ borderRadius: `var(${name})` }} />
  )
}

function shadowSample(name: string): ReactElement {
  return <span className={styles["design-shadow-sample"]} style={{ boxShadow: `var(${name})` }} />
}

function motionSample(name: string): ReactElement {
  const style: CSSProperties = { transitionDuration: `var(${name})` }
  return <span style={style}>{name} の長さで切り替わる</span>
}

function TokenTable(props: {
  readonly title: string
  readonly tokens: readonly Token[]
  readonly sample: (name: string) => ReactElement
}): ReactElement {
  return (
    <VStack
      element="section"
      name={{ kind: "label", label: props.title }}
      gap="sm"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className=""
    >
      <Heading level={3} size="subheading" tone="ink" weight="bold" className="">
        {props.title}
      </Heading>
      <div className={styles["design-token-scroll"]}>
        <table className={styles["design-token-table"]}>
          <tbody>
            {props.tokens.map((token) => (
              <tr key={token.name}>
                <th scope="row">
                  <Text element="span" size="secondary" tone="ink" weight="normal" className="">
                    <code>{token.name}</code>
                  </Text>
                </th>
                <td>{props.sample(token.name)}</td>
                <td>
                  <Text
                    element="span"
                    size="secondary"
                    tone="ink-quiet"
                    weight="normal"
                    className=""
                  >
                    {token.use}
                  </Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </VStack>
  )
}
