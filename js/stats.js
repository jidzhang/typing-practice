/* stats.js - 计数与速度统计（零依赖） */
(function (global) {
  function countStats(text) {
    text = text || "";
    var han = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    var latin = (text.match(/[A-Za-z]/g) || []).length;
    var digits = (text.match(/[0-9]/g) || []).length;
    var spaces = (text.match(/\s/g) || []).length;
    var lines = text === "" ? 0 : text.split("\n").length;
    // 英文单词：连续字母/数字/撇号
    var wordsEn = (text.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g) || []).length;
    // 中文词粗略按字计；总有效字符（去空白）
    var nonSpace = text.replace(/\s/g, "").length;
    return {
      total: text.length,
      han: han,
      latin: latin,
      digits: digits,
      spaces: spaces,
      lines: lines,
      wordsEn: wordsEn,
      nonSpace: nonSpace
    };
  }

  // 中文速度：字/分钟；英文速度：词/分钟；统一也给 CPM（字符/分钟）
  function calcSpeed(charCount, wordCount, seconds) {
    if (!seconds || seconds <= 0) return { cpm: 0, wpm: 0, cps: 0 };
    var min = seconds / 60;
    return {
      cpm: Math.round(charCount / min),
      wpm: Math.round(wordCount / min),
      cps: +(charCount / seconds).toFixed(2)
    };
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (s < 10 ? "0" + s : "" + s);
  }

  global.TypingStats = {
    countStats: countStats,
    calcSpeed: calcSpeed,
    formatTime: formatTime
  };
})(window);
