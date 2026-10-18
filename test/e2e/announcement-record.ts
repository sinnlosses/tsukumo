// 読み上げの領域に挿入された文を、ページの側で控えに積む台本。

export const ANNOUNCED_LOG = "__announced"

/** 読み上げの領域へ挿入された文を、ページを開いた時点から控えへ積む台本。 */
export const RECORD_ANNOUNCEMENTS_SCRIPT = `(() => {
  const log = [];
  window.${ANNOUNCED_LOG} = log;
  const selector = "[data-live-announcer] p";
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const found = node.matches(selector) ? [node] : Array.from(node.querySelectorAll(selector));
        for (const paragraph of found) log.push(paragraph.textContent);
      }
    }
  }).observe(document, { childList: true, subtree: true });
})()`
