# E2E で途中のイベントを待って撮る場面に、撮り終えるまで次の手が来ない間合いを仕組みで持たせる（振り返り: GH-121）

- 札: 黄 揺れ（6回目）
- 根拠: GH-121（E2E の Chrome を1つに寄せる件）の受け入れで、`test/e2e/background-task.test.ts`「背景で走らせた直後は、ターンが終わっても背景のタスクが残る」と `test/e2e/final-report-label.test.ts`「背景のタスクが残っているあいだは、あとから来た report にも札を立てない」が、messages に次の `background-tasks-changed` が1件多く載って落ちた（Chrome 1つで5回中3回、2つで3回中1回）。どちらも `turn-finished` を待ってから撮るが、場面（`background-task-short`・`background-task-interim-report`）では次の手まで 1.0 秒しかなく、撮る処理（2回の `settledDom` と `screenshot`）は変更前でも p90 0.55 秒・最大 0.8 秒、他の作業ツリーの負荷が重なると変更前の形でも4回中3回落ちた。1秒の競り合いが変更前から潜んでいて、E2E の本数・Chrome の繋ぎ方・マシンの負荷を変える件のたびに表に出る
- 出し先: 仕組みで塞ぐタスク1件。`test/e2e/scenario-run.ts` の足場で、`waitForEvent` で待ったイベントの次の手までの間合い（`test/fixture/fake-session.json` の予定から読める）が一定以上あることを検査し、足りない場面では落とす。そのうえで上の2件が使う場面を、撮り終えるまで次の手が来ない形に分ける（背景のタスクが走ったまま終わる場面を別に持つ、など）。これが済めば、GH-121 で見送った「Chrome を1つに寄せる」（テスト関連のメモリ 7.4GB → 5.3GB、E2E 約80秒 → 約40秒）をもう一度検討できる
