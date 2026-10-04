# Markdown 一式の `import()` 分割を、Suspense の fallback に `aria-busy="true"` を出す形で試し直す（振り返り: GH-202）

- 札: 赤 診断違い（2回目）
- 根: e2e-frozen-clock-wakeup
- 根拠: GH-202 で B（Markdown 一式を `React.lazy` + `Suspense` で分割。min 後の `main.js` 1,826,202 → 1,460,854 bytes、20.0% 減）が `test/e2e/report-main-view.test.ts` を5件とも止め、委譲先は「`settledDom` の作り自体を変える判断が要る」と見立てて止まり、利用者が B を見送った。だが `docs/architecture/testing.md` の「非同期の取得…は `aria-busy="true"` を出し」の項がすでに、表示する側が `aria-busy="true"` を出せば `settledDom` が時計を 1ms ずつ進めて起こす仕組みを定めている。fallback に印を出せば E2E の基盤を変えずに済んだ見込みが高い（未検証）
- 出し先: 正典とタスクの2つ。正典は `docs/architecture/testing.md` の同じ項に「`Suspense` の fallback も読み込みが済むまで表示が続く要素に当たる」を足す（2回目なので、委譲先が次に同じ所で止まらないよう規則の側で塞ぐ）。タスクは、Suspense の fallback（高さを持たない空の器）に `aria-busy="true"` を出して B をやり直し、`report-main-view` の E2E が通るかと、React の Suspense の表示の間引き（約 300ms）を 1ms 刻みで進めても E2E が重くならないかを測る。通らなければ見送った理由を `docs/architecture/browser.md`「重いライブラリ」に1行残す
