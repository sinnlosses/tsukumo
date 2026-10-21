// 画面1つ分の描画の失敗を受け止める境界。
// 失敗した画面の場所に説明と読み込み直すボタンを出し、ほかの画面と画面のナビの帯は残す。
// ErrorBoundary は class でしか書けないので、ここだけ class で書く。

import { Component, type ErrorInfo, type ReactElement, type ReactNode } from "react"

import { reportBrowserError } from "../../domain/browser-error-report.ts"
import { Button } from "../ui/button/button.tsx"
import { Text } from "../ui/text/text.tsx"
import styles from "./screen-boundary.module.css"

const FAILURE_MESSAGE = "この画面を描けませんでした。読み込み直してください。"
const RELOAD_LABEL = "読み込み直す"

type ScreenBoundaryProps = {
  readonly children: ReactNode
}

type ScreenBoundaryState = { readonly kind: "rendering" } | { readonly kind: "failed" }

export class ScreenBoundary extends Component<ScreenBoundaryProps, ScreenBoundaryState> {
  override state: ScreenBoundaryState = { kind: "rendering" }

  static getDerivedStateFromError(): ScreenBoundaryState {
    return { kind: "failed" }
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    reportBrowserError("render-failure", error)
  }

  override render(): ReactNode {
    if (this.state.kind === "failed") {
      return <ScreenFailure />
    }
    return this.props.children
  }
}

function ScreenFailure(): ReactElement {
  return (
    <div className={styles["screen-failure"]} role="alert">
      <Text element="p" size="body" tone="ink" weight="normal" className="">
        {FAILURE_MESSAGE}
      </Text>
      <Button
        variant="outline"
        size="body"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        ariaHasPopup={undefined}
        disclosure={{ kind: "none" }}
        title={undefined}
        className={styles["screen-failure-reload"]}
        onClick={() => {
          window.location.reload()
        }}
      >
        {RELOAD_LABEL}
      </Button>
    </div>
  )
}
