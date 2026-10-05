# `capture-view.ts` に偽の時計を進める口（`--advance <ms>`）を足し、待ち時間で変わる画を道具で撮れるようにする（振り返り: GH-375）

- 札: 黄 道具（24回目）
- 根: capture-adhoc-playwright
- 根拠: GH-370 で撮る前の操作を渡す口を足したあとも、GH-375 の委譲先は待ちの一言（ターンが閉じて2分後に出る）を撮るために使い捨ての撮影スクリプトを書いた。`capture-view.ts` には時計を進める口が無く、`page.clock.install` だけでは `Temporal.Now` が差し替わらず1回目は出なかった（委譲先の friction log。`test/e2e/scenario-run.ts` の `installFixedClock` と同じ差し替えが要った）
- 出し先: タスクにする。`scripts/lib/capture-preparation.ts` の操作に「時計を進める」を足し、`installFixedClock` と同じ差し替え（`Temporal.Now` を含む）を `capture-view.ts` が撮る前に入れる。`docs/architecture/testing.md`「手で確かめること」の `capture-view.ts` の段落に1文足す。2回目なので、手順書への追記ではなく道具の口で塞ぐ
