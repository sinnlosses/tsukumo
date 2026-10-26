# ブラウザ側

ステータス: **正典**。

責務: ブラウザ側（`src/browser/`）の中の規則。状態の持ち方・Markdown・重いライブラリ・立ち絵の
動き・CSS・`components/ui/` の部品の作法を持つ。
読む時: `src/browser/` の部品・store・CSS を足す・直すとき。
直す時: ブラウザ側の状態の置き場・描き方・共有部品の作法を変えたとき。

## このファイルの読み方

節の本文は子のファイル（`docs/architecture/browser/`）にある。下の目次で子を1つ特定し、その子のファイルを丸ごと読む。

## 目次

この表は `pnpm run format` が子のファイルの責務の行から書き直すので、手で直さない。

| ファイル                                              | 説明                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `docs/architecture/browser/bundle-style-component.md` | ブラウザ側（`src/browser/`）の重いライブラリの読み方・CSS・`components/ui/` の部品の作法。 |
| `docs/architecture/browser/state-and-rendering.md`    | ブラウザ側（`src/browser/`）の状態の持ち方・Markdown・立ち絵の動き。                       |
