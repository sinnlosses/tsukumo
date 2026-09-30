# 「押せる行は Button にしない」の正典と、覚えていることの行を Button にした決定の食い違いを片方に寄せる（振り返り: GH-123）

- 札: 黄 正典の不備（4回目）
- 根拠: GH-123 の対象（GH-18 の 2026-09-29 のユーザー決定）に `persona-memory-section.tsx` の覚えていることの行が入っていたが、`docs/architecture/browser.md`「`components/ui/` の部品」は「押せる行・押せる文字（中身そのものを押すもの）は `Button` にしない」としている。委譲先は「蒸し返さない」に従って `Button`（variant `text-ink-hover-underline`）へ置き換え、食い違いを friction log に残した
- 出し先: `docs/architecture/browser.md` の `Button` の項を正典として、どちらかに寄せる。開く口を兼ねる行は `Button` にしてよいと例外を書くか、覚えていることの行を `<button>` に戻すかを人が決める
