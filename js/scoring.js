/* scoring.js - 对照准确率与打分（零依赖，对齐比对）
   不是逐字硬对位：带前瞻窗口的贪心对齐，能容忍漏打/多打——
   漏一个字后面不再全红，错题本也不再被连带污染。 */
(function (global) {
  var LOOKAHEAD = 10;

  // 常见中英文等价标点映射（用于宽松标点模式）
  var PUNCT_MAP = {
    "，": ",", "。": ".", "！": "!", "？": "?",
    "；": ";", "：": ":", "（": "(", "）": ")",
    "【": "[", "】": "]", "“": "\"", "”": "\"",
    "‘": "'", "’": "'", "、": ",", "—": "-"
  };

  function normChar(ch, loosePunct) {
    if (!loosePunct || !ch) return ch;
    return PUNCT_MAP[ch] || ch;
  }

  function charEq(a, b, loosePunct) {
    if (a === b) return true;
    if (!loosePunct) return false;
    return normChar(a, true) === normChar(b, true);
  }

  // 对齐 ref 与 input，返回 { perChar, pairs, extraCount, curIndex }
  // perChar: ref 每个字 0 未打 / 1 对 / 2 错（含漏打）
  // pairs: 给复盘用的已消费对子 [{ r: 对照字, t: 输入字或null(漏打) }]
  // extraCount: 输入中多打的字符数（含中间多打跳过的和末尾多出的）
  // curIndex: 当前对齐到 ref 的下标（供光标定位）
  function align(ref, input, opts) {
    ref = ref || "";
    input = input || "";
    var loosePunct = !!(opts && opts.loosePunct);
    var rl = ref.length, il = input.length;
    var perChar = [];
    var pairs = [];
    var extraCount = 0;
    var i = 0, j = 0;
    function indexOfFrom(s, ch, from, to) {
      for (var k = from; k < to && k < s.length; k++) {
        if (charEq(s[k], ch, loosePunct)) return k;
      }
      return -1;
    }
    while (i < rl && j < il) {
      if (charEq(ref[i], input[j], loosePunct)) {
        perChar.push(1);
        pairs.push({ r: ref[i], t: input[j] });
        i++; j++;
      } else {
        var p = indexOfFrom(ref, input[j], i + 1, i + 1 + LOOKAHEAD);
        var q = indexOfFrom(input, ref[i], j + 1, j + 1 + LOOKAHEAD);
        // 若两边都能在窗口内找到，优先选偏移更小的那一边
        if (p !== -1 && (q === -1 || (p - i) <= (q - j))) {
          // 输入的这个字在对照后文出现过 → 中间对照字被漏打
          while (i < p) { perChar.push(2); pairs.push({ r: ref[i], t: null }); i++; }
        } else if (q !== -1) {
          // 对照的这个字在输入后文出现过 → 输入多了字
          while (j < q) { pairs.push({ r: null, t: input[j] }); extraCount++; j++; }
        } else {
          // 都找不到 → 普通打错，各走一步
          perChar.push(2);
          pairs.push({ r: ref[i], t: input[j] });
          i++; j++;
        }
      }
    }
    if (j < il) {
      while (j < il) { pairs.push({ r: null, t: input[j] }); extraCount++; j++; }
    }
    var curIndex = i;
    while (i < rl) { perChar.push(0); i++; }
    return { perChar: perChar, pairs: pairs, extraCount: extraCount, curIndex: curIndex };
  }

  // 返回 { correct, errors, typedErrors, total, accuracy, progress, perChar[], extra, errorIndexes[], curIndex, done }
  // 实时 accuracy 按「已打部分（含漏打与多打）」计算，避免刚开打时因未打字被算错而只有个位数准确率；
  // 综合分 score 结合准确率与完成度（未打完时分数按完成度折算）。
  function scoreReference(ref, input, opts) {
    ref = ref || "";
    input = input || "";
    var rl = ref.length, il = input.length;
    var a = align(ref, input, opts);
    var correct = 0;
    var refErrors = 0;
    var errorIndexes = [];
    for (var i = 0; i < a.perChar.length; i++) {
      if (a.perChar[i] === 1) correct++;
      else if (a.perChar[i] === 2) {
        refErrors++;
        if (errorIndexes.length < 50) errorIndexes.push(i);
      }
    }
    var extra = a.extraCount;
    var evaluated = correct + refErrors + extra;
    var accuracy = evaluated === 0 ? 100 : (correct / evaluated) * 100;
    var progress = rl === 0 ? 0 : Math.min(100, (a.curIndex / rl) * 100);
    var missing = Math.max(0, rl - a.curIndex);
    var totalErrors = refErrors + extra + missing;
    // 综合分：准确率为主，完成度为辅；未打完时分数打折，避免只打对前几个字就拿高分
    var completeness = rl === 0 ? 0 : Math.min(1, a.curIndex / rl);
    var score = il === 0 ? 0 : accuracy * (0.4 + 0.6 * completeness);
    return {
      correct: correct,
      errors: refErrors + extra,
      totalErrors: totalErrors,
      total: Math.max(rl, il),
      refLen: rl,
      inputLen: il,
      extra: extra,
      missing: missing,
      accuracy: accuracy,
      progress: progress,
      score: score,
      perChar: a.perChar,
      errorIndexes: errorIndexes,
      curIndex: a.curIndex,
      done: rl > 0 && a.curIndex >= rl
    };
  }

  function gradeLabel(score) {
    if (score >= 95) return "S · 大师";
    if (score >= 90) return "A · 优秀";
    if (score >= 80) return "B · 良好";
    if (score >= 70) return "C · 合格";
    if (score >= 60) return "D · 加油";
    return "E · 继续练";
  }

  // 找出错字 Top（按字符归类，便于针对性练习）
  function topErrors(ref, input, n, opts) {
    n = n || 8;
    var map = Object.create(null);
    var a = align(ref, input, opts);
    var pairs = a.pairs;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (p.t === null) {
        var k1 = "漏打「" + printable(p.r) + "」";
        map[k1] = (map[k1] || 0) + 1;
      } else if (p.r === null) {
        var kExtra = "多打「" + printable(p.t) + "」";
        map[kExtra] = (map[kExtra] || 0) + 1;
      } else if (!charEq(p.r, p.t, !!(opts && opts.loosePunct))) {
        var k2 = "应为「" + printable(p.r) + "」打成「" + printable(p.t) + "」";
        map[k2] = (map[k2] || 0) + 1;
      }
    }
    var arr = Object.keys(map).map(function (k) { return { label: k, count: map[k] }; });
    arr.sort(function (a, b) { return b.count - a.count; });
    return arr.slice(0, n);
  }

  function printable(ch) {
    if (ch === " ") return "空格";
    if (ch === "\n") return "换行";
    if (ch === "\t") return "Tab";
    return ch;
  }

  global.TypingScoring = {
    align: align,
    scoreReference: scoreReference,
    gradeLabel: gradeLabel,
    topErrors: topErrors
  };
})(typeof window !== "undefined" ? window : this);
