# ブラウザ側

ステータス: **正典**。

責務: ブラウザ側（`src/browser/`）の中の規則。状態の持ち方・Markdown・重いライブラリ・立ち絵の
動き・CSS・`components/ui/` の部品の作法を持つ。
読む時: `src/browser/` の部品・store・CSS を足す・直すとき。
直す時: ブラウザ側の状態の置き場・描き方・共有部品の作法を変えたとき。

## このファイルの読み方

節の本文は子のファイル（`docs/architecture/browser/`）にある。下の索引で節を1つ特定し、その子のファイルだけを開いて読む。

## 節の索引

この表は `pnpm run format` が子のファイルの題と見出しから書き直すので、手で直さない。

| ファイル                                              | 題                           | 節                                                                                                                                    |
| ----------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/browser/bundle-style-component.md` | ブラウザ側: 組み立てと見た目 | browser / 重いライブラリ / CSS / `components/ui/` の部品（variant の作法と一覧）                                                      |
| `docs/architecture/browser/state-and-rendering.md`    | ブラウザ側: 状態と描き方     | browser / 状態の持ち方 / Markdown（`components/page/conversation/components/markdown/renderer/markdown-renderer.tsx`） / 立ち絵の動き |
