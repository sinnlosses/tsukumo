// `appearance: base-select`（customizable select）の `<selectedcontent>` は `@types/react` にまだ無い。
// ブラウザが選ばれている `<option>` の中身をここへ自動で写すだけで、React から子要素は渡さない。

import "react"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      selectedcontent: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
