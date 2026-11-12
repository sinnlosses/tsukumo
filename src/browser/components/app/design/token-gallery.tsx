// デザイントークンを、名前・見本・使い分けの表にして並べる。値は `theme.css` の `var()` をそのまま当てて描く。

import type { CSSProperties, ReactElement } from "react"

import { Badge } from "../../ui/badge/badge.tsx"
import { Heading } from "../../ui/heading/heading.tsx"
import { Text } from "../../ui/text/text.tsx"
import { PaperTone, type PaperToneName } from "../../ui/theme-root/paper-tone.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import {
  COLOR_TOKENS,
  EASING_TOKENS,
  FAMILY_TOKENS,
  FONT_TOKENS,
  MOTION_TOKENS,
  RADIUS_TOKENS,
  SHADOW_TOKENS,
  SPACE_TOKENS,
} from "./design-token-list.ts"
import styles from "./design.module.css"

type Token = { readonly name: string; readonly use: string }

const NIGHT_ONLY = ["night"] as const satisfies readonly PaperToneName[]
const NIGHT_AND_DAY = ["night", "day"] as const satisfies readonly PaperToneName[]

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
      <PaperSampleRow />
      <TokenTable title="色" tokens={COLOR_TOKENS} tones={NIGHT_AND_DAY} sample={colorSample} />
      <TokenTable title="字の大きさ" tokens={FONT_TOKENS} tones={NIGHT_ONLY} sample={fontSample} />
      <TokenTable title="書体" tokens={FAMILY_TOKENS} tones={NIGHT_ONLY} sample={familySample} />
      <TokenTable title="余白" tokens={SPACE_TOKENS} tones={NIGHT_ONLY} sample={spaceSample} />
      <TokenTable title="角丸" tokens={RADIUS_TOKENS} tones={NIGHT_ONLY} sample={radiusSample} />
      <TokenTable title="影" tokens={SHADOW_TOKENS} tones={NIGHT_ONLY} sample={shadowSample} />
      <TokenTable title="動き" tokens={MOTION_TOKENS} tones={NIGHT_ONLY} sample={motionSample} />
      <TokenTable title="緩急" tokens={EASING_TOKENS} tones={NIGHT_ONLY} sample={easingSample} />
    </VStack>
  )
}

const TONE_LABEL = {
  night: "夜",
  day: "昼",
} as const satisfies Record<PaperToneName, string>

function PaperSampleRow(): ReactElement {
  return (
    <VStack
      element="section"
      name={{ kind: "label", label: "紙の見本" }}
      gap="sm"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className=""
    >
      <Heading level={3} size="subheading" tone="ink" weight="bold" className="">
        紙の見本
      </Heading>
      <div className={styles["design-paper-row"]}>
        {NIGHT_AND_DAY.map((tone) => (
          <PaperTone key={tone} tone={tone}>
            <PaperSample tone={tone} />
          </PaperTone>
        ))}
      </div>
    </VStack>
  )
}

function PaperSample(props: { readonly tone: PaperToneName }): ReactElement {
  return (
    <div className={styles["design-paper"]} data-paper-tone={props.tone}>
      <Text element="p" size="secondary" tone="ink-quiet" weight="normal" className="">
        {TONE_LABEL[props.tone]}の紙
      </Text>
      <Heading level={2} size="heading" tone="ink" weight="bold" className="">
        節の見出し
      </Heading>
      <Text element="p" size="body" tone="ink" weight="normal" className="">
        本文の字は紙の上で読む。見本の値は字と地の比を 4.5 以上に保つ。
      </Text>
      <span className={styles["design-ink-soft"]}>読ませる補助の字</span>
      <div className={styles["design-float"]}>
        <Badge tone="ok" shape="square" className="">
          ✓ 済み
        </Badge>
        <Badge tone="warn" shape="square" className="">
          ! 答え待ち
        </Badge>
        <Badge tone="ng" shape="square" className="">
          ✕ 失敗
        </Badge>
        <span className={styles["design-voice"]}>セリフの明朝</span>
      </div>
    </div>
  )
}

function colorSample(name: string): ReactElement {
  return <span className={styles["design-swatch"]} style={{ background: `var(${name})` }} />
}

function fontSample(name: string): ReactElement {
  return <span style={{ fontSize: `var(${name})` }}>あいうABC</span>
}

function familySample(name: string): ReactElement {
  return <span style={{ fontFamily: `var(${name})` }}>舞台と紙 Stage 0123</span>
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

function easingSample(name: string): ReactElement {
  const style: CSSProperties = { transitionTimingFunction: `var(${name})` }
  return <span style={style}>{name} の緩急で切り替わる</span>
}

function TokenTable(props: {
  readonly title: string
  readonly tokens: readonly Token[]
  readonly tones: readonly PaperToneName[]
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
          {props.tones.length > 1 && (
            <thead>
              <tr>
                <td />
                {props.tones.map((tone) => (
                  <th key={tone} scope="col">
                    <Text
                      element="span"
                      size="secondary"
                      tone="ink-quiet"
                      weight="normal"
                      className=""
                    >
                      {TONE_LABEL[tone]}
                    </Text>
                  </th>
                ))}
                <td />
              </tr>
            </thead>
          )}
          <tbody>
            {props.tokens.map((token) => (
              <tr key={token.name}>
                <th scope="row">
                  <Text element="span" size="secondary" tone="ink" weight="normal" className="">
                    <code>{token.name}</code>
                  </Text>
                </th>
                {props.tones.map((tone) => (
                  <td key={tone} data-tone={tone}>
                    <PaperTone tone={tone}>
                      <span className={styles["design-tone-cell"]}>{props.sample(token.name)}</span>
                    </PaperTone>
                  </td>
                ))}
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
