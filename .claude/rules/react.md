---
paths:
  - "src/browser/**/*.{ts,tsx,css}"
  - "test/browser/**/*.{ts,tsx}"
  - "story/**/*.{ts,tsx}"
---

# React とスタイルの書き方

規則の正典はこのファイル。理由と例外は `docs/coding-standards.md` の括弧の節（冒頭の「節の索引」で引く）。

- **`ReactElement` を返す関数は `function` で書く**（`const` は `memo` で包むときだけ。「部品は `function` で書く」）
- `memo` / `useCallback` / `useMemo` は手で書かず、メモ化は React Compiler に任せる。残してよい理由は「React」節「手でメモ化しない」の2つだけ
- **条件付きの描画は `{条件 && <部品 />}` で書き、`? … : null` にしない。** 左辺は `boolean` に限る（「条件付きの描画は `&&` で書く」）
- **`useEffect` は「React の外と同期する」4類型だけ。** 依存配列を手で間引かない（「React」節「useEffect は4類型だけ」「useEffect の代わりに使うもの」）
- **2つ以上の class 名をつなぐときは clsx を使う**。`components/ui/` の部品へ渡す className は除く（`composes` で畳む）（「class 名は clsx で組む」）
