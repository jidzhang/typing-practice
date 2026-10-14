/* scoring.js - 对照准确率与打分（零依赖，对齐比对）
   不是逐字硬对位：带前瞻窗口的贪心对齐，能容忍漏打/多打——
   漏一个字后面不再全红，错题本也不再被连带污染。 */
(function (global) {
  var LOOKAHEAD = 10;

  // 对齐 ref 与 input，返回 { perChar, pairs, extraCount }
  // perChar: ref 每个字 0 未打 / 1 对 / 2 错（含漏打）
  // pairs: 给复盘用的已消费对子 [{ r: 对照字, t: 输入字或null(漏打) }]
  function align(ref, input) {
    ref = ref || "";
    input = input || "";
    var rl = ref.length, il = input.length;
    var perChar = [];
    var pairs = [];
    var i = 0, j = 0;
    function indexOfFrom(s, ch, from, to) {
      for (var k = from; k < to && k < s.length; k++) {
        if (s[k] === ch) return k;
      }
      return -1;
    }
    while (i < rl && j < il) {
      if (ref[i] === input[j]) {
        perChar.push(1);
        pairs.push({ r: ref[i], t: input[j] });
        i++; j++;
      } else {
        // 输入的这个字在对照后文出现过 → 中间对照字被漏打
        var p = indexOfFrom(ref, input[j], i + 1, i + 1 + LOOKAHEAD);
        if (p !== -1) {
          while (i < p) { perChar.push(2); pairs.push({ r: ref[i], t: null }); i++; }
        } else {
          // 对照的这个字在输入后文出现过 → 输入多了字
          var q = indexOfFrom(input, ref[i], j + 1, j + 1 + LOOKAHEAD);
          if (q !== -1) {
            j = q;
          } else {
            // 都找不到 → 普通打错，各走一步
            perChar.push(2);
            pairs.push({ r: ref[i], t: input[j] });
            i++; j++;
          }
        }
      }
    }
    while (i < rl) { perChar.push(j < il ? 1 : 0); if (j < il) { pairs.push({ r: ref[i], t: input[j] }); j++; } i++; }
    return { perChar: perChar, pairs: pairs };
  }

  // 返回 { correct, errors, total, accuracy, progress, perChar[], extra, errorIndexes[] }
  // accuracy = correct / max(refLen, inputLen) * 100（缺字、多字都扣分）
  // progress = inputLen / refLen
  function scoreReference(ref, input) {
    ref = ref || "";
    input = input || "";
    var rl = ref.length, il = input.length;
    var total = Math.max(rl, il);
    var a = align(ref, input);
    var correct = 0;
    var errorIndexes = [];
    for (var i = 0; i < a.perChar.length; i++) {
      if (a.perChar[i] === 1) correct++;
      else if (a.perChar[i] === 2 && errorIndexes.length < 50) errorIndexes.push(i);
    }
    var extra = il > rl ? il - rl : 0;
    var errors = total === 0 ? 0 : (total - correct);
    var accuracy = total === 0 ? 100 : (correct / total) * 100;
    var progress = rl === 0 ? 0 : Math.min(100, (il / rl) * 100);
    // 综合分：准确率为主，完成度为辅；未打完时分数打折，避免只打对前几个字就拿高分
    var completeness = rl === 0 ? 0 : Math.min(1, il / rl);
    var score = accuracy * (0.7 + 0.3 * completeness);
    if (total === 0) score = 0;
    return {
      correct: correct,
      errors: errors,
      total: total,
      refLen: rl,
      inputLen: il,
      extra: extra,
      missing: Math.max(0, rl - il),
      accuracy: accuracy,
      progress: progress,
      score: score,
      perChar: a.perChar,
      errorIndexes: errorIndexes
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
  function topErrors(ref, input, n) {
    n = n || 8;
    var map = Object.create(null);
    var pairs = align(ref, input).pairs;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (p.t === null) {
        var k1 = "漏打「" + printable(p.r) + "」";
        map[k1] = (map[k1] || 0) + 1;
      } else if (p.r !== p.t) {
        var k2 = "应为「" + printable(p.r) + "」打成「" + printable(p.t) + "」";
        map[k2] = (map[k2] || 0) + 1;
      }
    }
    var rl = (ref || "").length, il = (input || "").length;
    if (il > rl) {
      map["多余输入 " + (il - rl) + " 字"] = il - rl;
    }
    if (rl > il) {
      map["还差 " + (rl - il) + " 字未输入"] = 1;
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
    scoreReference: scoreReference,
    gradeLabel: gradeLabel,
    topErrors: topErrors
  };
})(typeof window !== "undefined" ? window : this);
