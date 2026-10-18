# ブラウザ側

最終更新: 2026-09-28。ステータス: **正典**。

責務: ブラウザ側（`src/browser/`）の中の規則。状態の持ち方・Markdown・重いライブラリ・立ち絵の
動き・CSS・`components/ui/` の部品の作法を持つ。
読む時: `src/browser/` の部品・store・CSS を足す・直すとき。
直す時: ブラウザ側の状態の置き場・描き方・共有部品の作法を変えたとき。

本文は2つの子のファイルに分けてある。節の見出しはここに残し、中身は移し先を引く。

- `docs/architecture/browser/state-and-rendering.md`: 状態の持ち方、Markdown、立ち絵の動き
- `docs/architecture/browser/bundle-style-component.md`: 重いライブラリ、CSS、`components/ui/` の部品

## 節の索引

| 節         | 中身                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| ## browser | 状態の持ち方、Markdown、重いライブラリ、立ち絵の動き、CSS、`components/ui/` の部品（variant の作法と一覧） |

## browser

### 状態の持ち方

本文は `docs/architecture/browser/state-and-rendering.md`「状態の持ち方」。

### Markdown（`components/page/conversation/components/markdown/renderer/markdown-renderer.tsx`）

本文は `docs/architecture/browser/state-and-rendering.md`「Markdown（`components/page/conversation/components/markdown/renderer/markdown-renderer.tsx`）」。

### 重いライブラリ

本文は `docs/architecture/browser/bundle-style-component.md`「重いライブラリ」。

### 立ち絵の動き

本文は `docs/architecture/browser/state-and-rendering.md`「立ち絵の動き」。

### CSS

本文は `docs/architecture/browser/bundle-style-component.md`「CSS」。

### `components/ui/` の部品（variant の作法と一覧）

本文は `docs/architecture/browser/bundle-style-component.md`「`components/ui/` の部品（variant の作法と一覧）」。
置くかどうかを決める「読み手の数は問わない」、`className` で重ねる「上書きは `className` の1つ」もそこにある。
