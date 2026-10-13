/* scoring.js - 对照准确率与打分（零依赖，逐字位置比对） */
(function (global) {
  // 返回 { correct, errors, total, accuracy, progress, perChar[], extra, errorIndexes[] }
  // accuracy = correct / max(refLen, inputLen) * 100（缺字、多字都扣分）
  // progress = inputLen / refLen
  function scoreReference(ref, input) {
    ref = ref || "";
    input = input || "";
    var rl = ref.length, il = input.length;
    var minLen = Math.min(rl, il);
    var total = Math.max(rl, il);
    var correct = 0;
    var perChar = [];      // ref 每个字：0 未打，1 对，2 错
    var errorIndexes = [];
    for (var i = 0; i < rl; i++) {
      if (i < il) {
        if (ref[i] === input[i]) { perChar.push(1); correct++; }
        else { perChar.push(2); errorIndexes.push(i); }
      } else {
        perChar.push(0);
      }
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
      perChar: perChar,
      errorIndexes: errorIndexes.slice(0, 50)
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
    var len = Math.min(ref.length, input.length);
    for (var i = 0; i < len; i++) {
      if (ref[i] !== input[i]) {
        var k = "应为「" + printable(ref[i]) + "」打成「" + printable(input[i]) + "」";
        map[k] = (map[k] || 0) + 1;
      }
    }
    if (input.length > ref.length) {
      map["多余输入 " + (input.length - ref.length) + " 字"] = input.length - ref.length;
    }
    if (ref.length > input.length) {
      map["还差 " + (ref.length - input.length) + " 字未输入"] = 1;
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
})(window);
