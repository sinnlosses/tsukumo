// story を描くページの下地。tsukumo のページと同じグローバルな CSS と、
// `<App>` が重ねる Provider（立ち絵の取得が読む TanStack Query）を用意する。

import type { Preview } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement } from "react"

import "../src/browser/styles/theme.css"

const queryClient = new QueryClient()

const preview = {
  decorators: [withQueryClient],
  parameters: { layout: "fullscreen" },
} satisfies Preview

export default preview

function withQueryClient(Story: () => ReactElement): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  )
}
