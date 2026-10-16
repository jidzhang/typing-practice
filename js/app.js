/* app.js - 主逻辑：计时 / 计数 / 打分 / 击键记录 / 速度曲线 / 错题本 / 挑战赛 / 自动复制 */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }

  var pad = $("pad"), refEdit = $("refEdit"), refView = $("refView"),
    sampleSel = $("sampleSel"), msg = $("msg"), toastEl = $("toast"),
    autoCopyBox = $("autoCopy"), switchLabel = $("switchLabel"),
    loosePunctBox = $("loosePunct");

  var tabFree = $("tabFree"), tabRef = $("tabRef"), refCard = $("refCard");
  var btnStart = $("btnStart"), btnPause = $("btnPause"), btnReset = $("btnReset"), btnFinish = $("btnFinish");
  var btnCopySel = $("btnCopySel"), btnCopyAll = $("btnCopyAll"),
      btnSelectAll = $("btnSelectAll"), btnClear = $("btnClear");
  var btnUseCustom = $("btnUseCustom"), btnPracticeMistakes = $("btnPracticeMistakes"), customDetails = $("customDetails");
  var btnNextSample = $("btnNextSample"), btnRandomSample = $("btnRandomSample");
  var btnReportRetry = $("btnReportRetry"), btnReportNext = $("btnReportNext"), btnReportMistakes = $("btnReportMistakes");
  var btnClearHist = $("btnClearHist"), btnExportHist = $("btnExportHist"), btnTheme = $("btnTheme"), btnZen = $("btnZen");
  var fontSize = $("fontSize"), fontVal = $("fontVal");
  var challengeDur = $("challengeDur"), targetCpm = $("targetCpm"), targetAcc = $("targetAcc");

  var LS_CONTENT = "tpp-content-v1", LS_REF = "tpp-ref-v1", LS_SETTINGS = "tpp-settings-v1",
      LS_HIST = "tpp-history-v1", LS_MISTAKES = "tpp-mistakes-v1", LS_KEYSTAT = "tpp-keystat-v1";

  var state = {
    mode: "ref",
    themePref: "auto", // auto | light | dark：auto 跟随系统
    loosePunct: false,
    samples: [],
    refText: "",
    started: false,
    paused: false,
    finished: false,
    startStamp: 0,      // performance.now() 基准
    elapsed: 0,         // 秒（累计，暂停时冻结）
    timerId: null,
    challengeLeft: 0,   // 挑战剩余秒，0=不限时
    challengeTotal: 0,
    keys: [],           // 本次击键原始记录（节流保存）
    keyCount: 0,
    backCount: 0,
    ikiList: [],        // 键间隔 ms
    lastKeyT: 0,
    perKey: {},         // code -> {n, err, ikiSum}
    composing: false,
    speedHist: [],      // {t(sec), cpm}
    lastTickLen: 0,
    chart: null,
    mistakes: {},       // char -> count（跨次累计的错字本）
    totalKeyStat: {}    // 跨次累计 code -> {n, err}
  };

  function scoreOpts() {
    return { loosePunct: !!state.loosePunct };
  }

  /* ---------- 小组件 ---------- */
  var toastTimer = null;
  function toast(t) {
    toastEl.textContent = t;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1600);
  }
  function setMsg(t, cls) { msg.textContent = t || ""; msg.className = cls || ""; }
  function nowSec() { return state.elapsed + (state.started && !state.paused ? (performance.now() - state.startStamp) / 1000 : 0); }

  /* ---------- 设置持久化 ---------- */
  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}");
      if (s.mode) state.mode = s.mode;
      if (typeof s.autoCopy === "boolean") autoCopyBox.checked = s.autoCopy;
      if (typeof s.loosePunct === "boolean") {
        state.loosePunct = s.loosePunct;
        if (loosePunctBox) loosePunctBox.checked = s.loosePunct;
      }
      // 主题偏好：新存档带 themeV=1，直接用 auto/light/dark；
      // 老存档只有解析后的 light/dark，其中 dark 必为手动点过，保留为显式，
      // light 无法区分是否手动过，一律按 auto 跟随系统
      if (s.themeV === 1 && (s.theme === "auto" || s.theme === "light" || s.theme === "dark")) {
        state.themePref = s.theme;
      } else if (s.theme === "dark") {
        state.themePref = "dark";
      } else {
        state.themePref = "auto";
      }
      if (s.zen === true) document.body.dataset.zen = "true";
      applyTheme();
      if (s.fontSize) { fontSize.value = s.fontSize; applyFont(); }
      if (s.targetCpm) targetCpm.value = s.targetCpm;
      if (s.targetAcc) targetAcc.value = s.targetAcc;
      if (s.challengeDur) challengeDur.value = s.challengeDur;
    } catch (e) {}
    try { state.mistakes = JSON.parse(localStorage.getItem(LS_MISTAKES) || "{}"); } catch (e) { state.mistakes = {}; }
    try { state.totalKeyStat = JSON.parse(localStorage.getItem(LS_KEYSTAT) || "{}"); } catch (e) { state.totalKeyStat = {}; }
    refreshSwitchLabel();
    refreshThemeBtn();
    refreshZenBtn();
  }
  function saveSettings() {
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify({
        mode: state.mode,
        autoCopy: autoCopyBox.checked,
        loosePunct: state.loosePunct,
        theme: state.themePref || "auto",
        themeV: 1,
        zen: document.body.dataset.zen === "true",
        fontSize: fontSize.value,
        targetCpm: targetCpm.value, targetAcc: targetAcc.value,
        challengeDur: challengeDur.value
      }));
      localStorage.setItem(LS_MISTAKES, JSON.stringify(state.mistakes));
      localStorage.setItem(LS_KEYSTAT, JSON.stringify(state.totalKeyStat));
    } catch (e) {}
  }
  function refreshZenBtn() {
    var on = document.body.dataset.zen === "true";
    if (!btnZen) return;
    btnZen.textContent = on ? "↩ 退出专注" : "🧘 专注";
    btnZen.title = on ? "退出专注后可看速度曲线、错因复盘和历史成绩" : "专注模式：只留练习区并放大";
  }
  function setZen(on) {
    document.body.dataset.zen = on ? "true" : "false";
    refreshZenBtn(); saveSettings();
    if (on) toast("专注模式：其他面板已隐藏，退出后可看评分、曲线和复盘");
    if (!on && state.chart) { try { state.chart.resize(); } catch (e) {} }
    if (on) pad.focus();
  }
  function applyFont() {
    var px = parseInt(fontSize.value, 10) || 18;
    document.documentElement.style.setProperty("--pad-font", px + "px");
    fontVal.textContent = px + "px";
  }
  function refreshSwitchLabel() {
    switchLabel.childNodes[1].textContent = autoCopyBox.checked ? " 选中自动复制：开 " : " 选中自动复制：关 ";
  }
  function currentTheme() {
    if (state.themePref === "light" || state.themePref === "dark") return state.themePref;
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
    catch (e) { return "light"; }
  }
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", currentTheme());
    refreshThemeBtn();
  }
  function refreshThemeBtn() {
    var pref = state.themePref || "auto";
    btnTheme.textContent = pref === "auto" ? "🌓 自动" : (pref === "dark" ? "🌙 深色" : "☀ 浅色");
    btnTheme.title = "主题：自动跟随系统 / 浅色 / 深色，点击切换（当前" +
      (pref === "auto" ? "自动" : (pref === "dark" ? "深色" : "浅色")) + "）";
  }

  /* ---------- 练习文本 ---------- */
  function selectedSample() {
    return state.samples.filter(function (x) { return x.id === sampleSel.value; })[0] || null;
  }
  function syncSampleSel() {
    for (var i = 0; i < state.samples.length; i++) {
      if (state.samples[i].text === state.refText) { sampleSel.value = state.samples[i].id; return; }
    }
  }
  function openCustomEditor() {
    if (customDetails) customDetails.open = true;
    // 触屏上 focus 可能唤不起键盘：至少把编辑框滚到可见并闪一下
    try { refEdit.focus({ preventScroll: true }); } catch (e) { try { refEdit.focus(); } catch (e2) {} }
    try { refEdit.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
    try {
      refEdit.classList.remove("flash");
      void refEdit.offsetWidth;
      refEdit.classList.add("flash");
      setTimeout(function () { refEdit.classList.remove("flash"); }, 1300);
    } catch (e) {}
  }
  function initSamples() {
    function fill(list) {
      state.samples = list || [];
      sampleSel.innerHTML = "";
      state.samples.forEach(function (s, i) {
        var o = document.createElement("option");
        o.value = s.id; o.textContent = s.name;
        sampleSel.appendChild(o);
      });
      // 恢复上次 ref：用启动快照（启动瞬间 updateAll 会跑一次，此时读库已被污染）
      var savedRef = bootSavedRef;
      if (savedRef) {
        state.refText = savedRef;
        refEdit.value = savedRef;
        syncSampleSel();
      } else if (state.samples.length) {
        var def = null;
        for (var i = 0; i < state.samples.length; i++) {
          if (state.samples[i].id === "cn-news-ai") { def = state.samples[i]; break; }
        }
        def = def || state.samples[0];
        state.refText = def.text;
        refEdit.value = state.refText;
        sampleSel.value = def.id;
      }
      renderRef();
    }
    // 优先 fetch 本地 json（http 服务下），失败则用内置兜底（file:// 也可用）
    fetch("texts/samples.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(fill).catch(function () {
      fill(window.SAMPLE_TEXTS || []);
    });
  }

  /* ---------- 对照高亮 ---------- */
  function renderRef() {
    if (state.mode !== "ref") {
      refView.innerHTML = "<span class='todo'>自由练习模式不对照原文，直接打字即可。</span>";
      refreshPbBadge();
      return;
    }
    var ref = state.refText || "", input = pad.value || "";
    var res = window.TypingScoring.scoreReference(ref, input, scoreOpts());
    var html = "";
    var cur = Math.min(res.curIndex, ref.length);
    for (var i = 0; i < ref.length; i++) {
      var ch = ref[i];
      var disp = escapeHtml(ch); // 与输入区逐字同宽：不插入额外符号
      var cls = res.perChar[i] === 1 ? "ok" : (res.perChar[i] === 2 ? "err" : "todo");
      if (i === cur) cls += " cur";
      html += "<span class='" + cls + "'>" + disp + "</span>";
    }
    if (!ref) html = "<span class='todo'>请在上方选择范文或粘贴自定义文本后点「设为对照文本」。</span>";
    else if (res.extra > 0 && res.curIndex >= ref.length) {
      html += "<div style='margin-top:8px;font-size:13px;color:var(--err-fg)'>超出原文 " + res.extra + " 字，已计入扣分。</div>";
    }
    var keepScroll = 0;
    try { keepScroll = refView.scrollTop; } catch (e) {}
    refView.innerHTML = html;
    try {
      var curEl = refView.querySelector("span.cur");
      if (curEl && refView.scrollHeight > refView.clientHeight) {
        var top = curEl.offsetTop - refView.offsetTop;
        var h = refView.clientHeight;
        if (top < keepScroll + 16 || top > keepScroll + h - 38) {
          refView.scrollTop = Math.max(0, top - Math.round(h * 0.38));
        } else {
          refView.scrollTop = keepScroll;
        }
      } else if (keepScroll) {
        refView.scrollTop = keepScroll;
      }
    } catch (e) {}
    $("refProgressBar").style.width = res.progress.toFixed(1) + "%";
    refreshPbBadge();
    return res;
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function refreshPbBadge() {
    var badge = $("pbBadge");
    if (!badge) return;
    if (state.mode !== "ref" || !state.refText) {
      badge.classList.add("hidden");
      return;
    }
    var name = currentSampleName();
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem(LS_HIST) || "[]"); } catch (e) {}
    var best = null;
    for (var i = 0; i < hist.length; i++) {
      var h = hist[i];
      if (h.sample === name && h.mode === "对照") {
        if (!best || (h.score || 0) > (best.score || 0) || ((h.score || 0) === (best.score || 0) && (h.cpm || 0) > (best.cpm || 0))) {
          best = h;
        }
      }
    }
    if (!best) {
      badge.classList.add("hidden");
      return;
    }
    badge.textContent = "🏆 本篇最佳：" + best.cpm + " 字/分 · " + (best.acc != null ? best.acc + "%" : "—") + " · " + (best.score != null ? best.score + "分" : "");
    badge.classList.remove("hidden");
  }

  /* ---------- 统计 + 打分 + 击键面板 ---------- */
  function updateAll(fromInput) {
    var text = pad.value || "";
    var st = window.TypingStats.countStats(text);
    $("stTotal").textContent = st.total;
    $("stHan").textContent = st.han;
    $("stWords").textContent = st.wordsEn;
    $("stLines").textContent = st.lines;
    var sel = window.TypingClipboard.getSelectedText(pad);
    $("stSel").textContent = sel.length;

    var sec = nowSec();
    var spd = window.TypingStats.calcSpeed(st.nonSpace, st.wordsEn, sec);
    $("mTime").innerHTML = window.TypingStats.formatTime(sec);
    $("mCpm").innerHTML = spd.cpm + " <small>字/分</small>";
    $("mWpm").innerHTML = spd.wpm + " <small>词/分</small>";
    if ($("hudSpeed")) $("hudSpeed").textContent = spd.cpm;

    var res = null;
    var stRefWrap = $("stRefWrap"), stProgress = $("stProgress");
    if (state.mode === "ref") {
      res = renderRef();
      var acc = res.accuracy, score = res.score;
      $("mAcc").innerHTML = (text.length ? acc.toFixed(1) + " <small>%</small>" : "—");
      $("mScore").textContent = text.length ? Math.round(score) : "—";
      $("mGrade").textContent = text.length ? window.TypingScoring.gradeLabel(score) : "—";
      $("mGrade").style.color = !text.length ? "var(--muted)" : (score >= 90 ? "var(--caret)" : (score >= 70 ? "var(--chart-line)" : "var(--err-fg)"));
      if ($("hudAcc")) $("hudAcc").textContent = text.length ? acc.toFixed(1) + "%" : "—";
      if (stRefWrap) stRefWrap.classList.remove("hidden");
      if (stProgress) stProgress.textContent = res.curIndex + "/" + res.refLen + " (" + Math.round(res.progress) + "%)";
    } else {
      $("mAcc").textContent = "—";
      $("mScore").textContent = "—";
      $("mGrade").textContent = "自由练";
      $("mGrade").style.color = "var(--muted)";
      if ($("hudAcc")) $("hudAcc").textContent = "自由";
      if (stRefWrap) stRefWrap.classList.add("hidden");
    }

    // 目标达成提示
    var tcpm = parseInt(targetCpm.value, 10) || 0;
    var tacc = parseFloat(targetAcc.value) || 0;
    if (tcpm > 0 || tacc > 0) {
      var okC = tcpm > 0 ? spd.cpm >= tcpm : true;
      var okA = (tacc > 0 && res) ? res.accuracy >= tacc : (tacc > 0 ? true : true);
      $("targetState").textContent = (okC && okA) ? "✓ 已达标" : "未达标";
      $("targetState").style.color = (okC && okA) ? "var(--caret)" : "var(--err-fg)";
    } else { $("targetState").textContent = "未设目标"; $("targetState").style.color = "var(--muted)"; }

    // 击键面板
    $("mKeys").textContent = state.keyCount;
    $("mBack").textContent = state.backCount;
    var br = state.keyCount ? (state.backCount / state.keyCount * 100) : 0;
    $("mBackRate").innerHTML = br.toFixed(1) + " <small>%</small>";
    var avgIki = state.ikiList.length ? (state.ikiList.reduce(function (a, b) { return a + b; }, 0) / state.ikiList.length) : 0;
    $("mIki").innerHTML = state.ikiList.length ? Math.round(avgIki) + " <small>ms</small>" : "—";
    // 节奏稳定性：IKI 标准差越小越稳
    var stable = "—";
    if (state.ikiList.length >= 10) {
      var mean = avgIki, va = 0;
      state.ikiList.forEach(function (x) { va += (x - mean) * (x - mean); });
      va = Math.sqrt(va / state.ikiList.length);
      var cv = mean ? va / mean : 9;
      stable = cv < 0.6 ? "稳" : (cv < 1.1 ? "一般" : "飘");
    }
    $("mStable").textContent = stable;

    // 挑战倒计时
    if (state.challengeTotal > 0) {
      $("mChallenge").textContent = window.TypingStats.formatTime(state.challengeLeft);
    } else { $("mChallenge").textContent = "∞"; }

    // 自动保存
    flushSave(text);

    // 速度采样（每 tick 由 timer 推入，这里只在输入时补记长度变化）
    if (fromInput && state.started && !state.paused) { state.lastTickLen = text.replace(/\s/g, "").length; }
    return { stats: st, speed: spd, result: res };
  }
  function flushSave(text) {
    try {
      localStorage.setItem(LS_CONTENT, (text == null ? pad.value : text) || "");
      // 对照为空时不写：启动瞬间范文还没载入，不能把已存对照清空
      if (state.refText) localStorage.setItem(LS_REF, state.refText);
      saveSettings();
      var t = new Date();
      $("stSave").textContent = "已自动保存 " + pad2(t.getHours()) + ":" + pad2(t.getMinutes()) + ":" + pad2(t.getSeconds());
    } catch (e) { $("stSave").textContent = "浏览器禁止本地保存"; }
  }
  function pad2(n) { return (n < 10 ? "0" + n : "" + n); }

  function renderErrors(res) {
    var box = $("errList");
    if (state.mode !== "ref" || !res || !pad.value) { box.innerHTML = "<li>开始打字后，这里会列出你最常打错的对照，帮你针对性加练。</li>"; $("slowList").innerHTML = "<li>多打 30 个键后，这里会列出你按得最慢 / 最常删的键。</li>"; return; }
    var tops = window.TypingScoring.topErrors(state.refText, pad.value, 6, scoreOpts());
    box.innerHTML = tops.length ? tops.map(function (x) { return "<li>" + escapeHtml(x.label) + " × " + x.count + "</li>"; }).join("") : "<li>目前零错字，保持！</li>";
    // 慢键：按平均 IKI 排序
    var arr = Object.keys(state.perKey).map(function (code) {
      var o = state.perKey[code];
      return { code: code, n: o.n, avg: o.n ? o.ikiSum / o.n : 0, err: o.err || 0 };
    }).filter(function (x) { return x.n >= 3; });
    arr.sort(function (a, b) { return b.avg - a.avg; });
    var slow = arr.slice(0, 5);
    $("slowList").innerHTML = slow.length ? slow.map(function (x) {
      return "<li><code>" + escapeHtml(x.code.replace("Key", "")) + "</code> 平均 " + Math.round(x.avg) + "ms · " + x.n + "次" + (x.err ? " · 关联删改 " + x.err : "") + "</li>";
    }).join("") : "<li>样本还不够，多打几个字再看。</li>";
  }

  /* ---------- 计时器 ---------- */
  function startTimer() {
    if (state.started && !state.paused) return;
    if (!state.started) {
      state.started = true;
      state.finished = false;
      state.elapsed = 0;
      state.speedHist = [];
      var cd = parseInt(challengeDur.value, 10) || 0;
      state.challengeTotal = cd;
      state.challengeLeft = cd;
    }
    state.paused = false;
    state.startStamp = performance.now();
    clearInterval(state.timerId);
    state.timerId = setInterval(onTick, 500);
    refreshTimerBtns();
  }
  function pauseTimer() {
    if (!state.started || state.paused) return;
    state.elapsed = nowSec();
    state.paused = true;
    clearInterval(state.timerId);
    refreshTimerBtns();
  }
  function resetAll(clearText) {
    clearInterval(state.timerId);
    state.started = false; state.paused = false; state.finished = false;
    state.elapsed = 0; state.speedHist = [];
    state.keys = []; state.keyCount = 0; state.backCount = 0;
    state.ikiList = []; state.lastKeyT = 0; state.perKey = {};
    state.challengeLeft = 0; state.challengeTotal = 0;
    state.lastTickLen = 0;
    window.TypingClipboard.resetHistory();
    if (clearText) { pad.value = ""; }
    $("reportBox").classList.add("hidden");
    updateChart();
    updateAll(false);
    renderErrors(state.mode === "ref" ? window.TypingScoring.scoreReference(state.refText, pad.value, scoreOpts()) : null);
    refreshTimerBtns();
  }
  function onTick() {
    var sec = nowSec();
    // 挑战倒计时
    if (state.challengeTotal > 0 && state.started && !state.paused) {
      var used = sec;
      state.challengeLeft = Math.max(0, state.challengeTotal - used);
      if (state.challengeLeft <= 0) {
        finishPractice(true);
        return;
      }
    }
    // 每 2 秒记录一个速度点
    var st = window.TypingStats.countStats(pad.value || "");
    var spd = window.TypingStats.calcSpeed(st.nonSpace, st.wordsEn, sec);
    var last = state.speedHist[state.speedHist.length - 1];
    if (!last || sec - last.t >= 2) {
      state.speedHist.push({ t: Math.round(sec), cpm: spd.cpm });
      if (state.speedHist.length > 180) state.speedHist.shift();
      updateChart();
    }
    updateAll(false);
  }
  function refreshTimerBtns() {
    btnStart.disabled = state.started && !state.paused;
    btnPause.disabled = !state.started || state.paused;
  }

  /* ---------- 速度曲线（本地 Chart.js，离线） ---------- */
  function updateChart() {
    var cv = $("speedChart");
    if (typeof Chart === "undefined") { $("chartEmpty").classList.remove("hidden"); return; }
    $("chartEmpty").classList.add("hidden");
    var labels = state.speedHist.map(function (p) { return p.t + "s"; });
    var data = state.speedHist.map(function (p) { return p.cpm; });
    if (state.chart) {
      state.chart.data.labels = labels;
      state.chart.data.datasets[0].data = data;
      state.chart.update("none");
      return;
    }
    var cs = getComputedStyle(document.documentElement);
    var tickColor = (cs.getPropertyValue("--muted") || "").trim() || "#6b7280";
    var lineColor = (cs.getPropertyValue("--chart-line") || "").trim() || "#c2410c";
    var fillColor = (cs.getPropertyValue("--chart-fill") || "").trim() || "rgba(194,65,12,.10)";
    state.chart = new Chart(cv, {
      type: "line",
      data: { labels: labels, datasets: [{ label: "速度（字/分）", data: data, tension: 0.3, fill: true, pointRadius: 0, borderWidth: 2, borderColor: lineColor, backgroundColor: fillColor }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, color: tickColor }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: tickColor } }
        }
      }
    });
  }

  /* ---------- VS Code 风编辑（开心打字 + 开心编辑） ----------
     原则：单区间改动走 execCommand，能进原生撤销栈（Ctrl+Z 可反悔）；
     每次改完手动派发 input，保证计数/打分/自动保存跟上。
     组字中（isComposing / keyCode 229）一律不拦截，不打断中文输入。 */
  function fireInput() { pad.dispatchEvent(new Event("input", { bubbles: true })); }
  function isWordCh(ch) { return !!ch && /[\p{L}\p{N}_$]/u.test(ch); }
  function isHan(ch) { return !!ch && /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch); }
  function replaceRange(a, b, text) {
    pad.focus();
    pad.setSelectionRange(a, b);
    var ok = false;
    try { ok = text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, text); }
    catch (err) { ok = false; }
    if (!ok) {
      var v = pad.value;
      pad.value = v.slice(0, a) + text + v.slice(b);
      var pos = a + text.length;
      pad.setSelectionRange(pos, pos);
    }
    fireInput();
  }
  function lineStartOf(v, pos) { return v.lastIndexOf("\n", pos - 1) + 1; }
  function lineEndOf(v, pos) { var i = v.indexOf("\n", pos); return i === -1 ? v.length : i; }
  function lineNoOf(v, pos) { var n = 0; for (var i = 0; i < pos; i++) if (v[i] === "\n") n++; return n; }
  function lineStartByNo(v, no) {
    if (no <= 0) return 0;
    var n = 0;
    for (var i = 0; i < v.length; i++) { if (v[i] === "\n") { n++; if (n === no) return i + 1; } }
    return v.length;
  }
  function offsetOf(lines, no, col) {
    var o = 0;
    for (var i = 0; i < no; i++) o += lines[i].length + 1;
    return o + Math.min(col == null ? 0 : col, (lines[no] || "").length);
  }
  // 对选中涉及的整行做变换，fn(lines, sl, el) 返回 {lines, sel} 或 null（取消）
  function withLines(fn) {
    var v = pad.value, s = pad.selectionStart, e = pad.selectionEnd;
    var sl = lineNoOf(v, s);
    var el = s === e ? sl : lineNoOf(v, Math.max(s, e - 1));
    var lines = v.split("\n");
    var r = fn(lines, sl, el, s, e);
    if (!r) return false;
    pad.focus();
    pad.value = r.lines.join("\n");
    pad.setSelectionRange(r.sel[0], r.sel[1]);
    fireInput();
    return true;
  }
  // Ctrl+Backspace / Ctrl+Delete：按词删除（中文一次一字，空白连片吃掉）
  function killWord(dir) {
    var v = pad.value, s = pad.selectionStart, e = pad.selectionEnd;
    if (s !== e) { replaceRange(s, e, ""); return true; }
    var p = s, delA = -1, delB = -1;
    if (dir < 0) {
      if (p === 0) return false;
      var i = p - 1;
      if (/\s/.test(v[i])) { while (i >= 0 && /\s/.test(v[i])) i--; delA = i + 1; delB = p; }
      else if (isHan(v[i])) { delA = p - 1; delB = p; }
      else { while (i >= 0 && isWordCh(v[i])) i--; delA = i + 1; delB = p; }
    } else {
      if (p >= v.length) return false;
      var j = p;
      if (/\s/.test(v[j])) { while (j < v.length && /\s/.test(v[j])) j++; delA = p; delB = j; }
      else if (isHan(v[j])) { delA = p; delB = p + 1; }
      else { while (j < v.length && isWordCh(v[j])) j++; delA = p; delB = j; }
    }
    if (delA === delB || delA < 0) return false;
    replaceRange(delA, delB, "");
    return true;
  }
  // Ctrl+Enter / Ctrl+Shift+Enter：下方 / 上方插入空行（继承缩进）
  function insertLine(after) {
    var v = pad.value, s = pad.selectionStart;
    var lines = v.split("\n");
    var no = lineNoOf(v, s);
    var m = (lines[no] || "").match(/^[ \t]*/);
    var at = after ? no + 1 : no;
    lines.splice(at, 0, m ? m[0] : "");
    pad.focus();
    pad.value = lines.join("\n");
    var pos = offsetOf(lines, at, (m ? m[0] : "").length);
    pad.setSelectionRange(pos, pos);
    fireInput();
    return true;
  }
  // Ctrl+D：先选中光标处词，再按选中下一个相同词（到文尾自动回绕）
  var findTerm = null;
  function selectNext() {
    var v = pad.value, s = pad.selectionStart, e = pad.selectionEnd;
    if (!v) return false;
    if (s === e) {
      var ws = s, we = s;
      if ((s < v.length && isHan(v[s])) || (s === v.length && s > 0 && isHan(v[s - 1]))) {
        if (s === v.length) { ws = s - 1; we = s; } else { ws = s; we = s + 1; }
      } else {
        while (ws > 0 && isWordCh(v[ws - 1])) ws--;
        while (we < v.length && isWordCh(v[we])) we++;
      }
      if (ws === we) return false;
      findTerm = v.slice(ws, we);
      pad.setSelectionRange(ws, we);
      return true;
    }
    var term = v.slice(s, e);
    findTerm = term;
    var idx = v.indexOf(term, e);
    var wrapped = false;
    if (idx === -1) { idx = v.indexOf(term, 0); wrapped = true; }
    if (idx === -1) return false;
    if (idx === s) { toast("全文只有这 1 处"); return true; }
    pad.focus();
    pad.setSelectionRange(idx, idx + term.length);
    if (wrapped) toast("已回绕到第一处");
    return true;
  }
  // Ctrl+L：选中整行（已选中行内容再按一次，连换行一起吞掉）
  function selectLine() {
    var v = pad.value, s = pad.selectionStart, e = pad.selectionEnd;
    var a = lineStartOf(v, s), b = lineEndOf(v, Math.max(e, s));
    if (s === a && e === b && b < v.length) b = b + 1;
    pad.setSelectionRange(a, b);
    return true;
  }
  // Ctrl+Shift+K：删除整行（可撤销）
  function deleteLine() {
    var v = pad.value;
    if (!v) return false;
    var s = pad.selectionStart, e = pad.selectionEnd;
    var lines = v.split("\n");
    var sl = lineNoOf(v, s), el = s === e ? sl : lineNoOf(v, Math.max(s, e - 1));
    var a = lineStartByNo(v, sl), b;
    if (el + 1 < lines.length) b = lineStartByNo(v, el + 1);
    else { b = v.length; if (sl > 0) a = a - 1; }
    replaceRange(a, b, "");
    return true;
  }
  // Alt+↑/↓：移动整行；Shift+Alt+↑/↓：复制整行
  function moveLines(dir) {
    var v0 = pad.value, s0 = pad.selectionStart, e0 = pad.selectionEnd;
    return withLines(function (lines, sl, el) {
      if (dir < 0 && sl === 0) { toast("已经在顶行"); return null; }
      if (dir > 0 && el >= lines.length - 1) { toast("已经在底行"); return null; }
      var colA = s0 - offsetOf(lines, sl, 0), colB = e0 - offsetOf(lines, el, 0);
      var block = lines.slice(sl, el + 1), nl, nsl;
      if (dir < 0) { nl = lines.slice(0, sl - 1).concat(block, [lines[sl - 1]], lines.slice(el + 1)); nsl = sl - 1; }
      else { nl = lines.slice(0, sl).concat([lines[el + 1]], block, lines.slice(el + 2)); nsl = sl + 1; }
      var nel = nsl + (el - sl);
      return { lines: nl, sel: [offsetOf(nl, nsl, 0) + Math.min(colA, nl[nsl].length), offsetOf(nl, nel, 0) + Math.min(colB, nl[nel].length)] };
    });
  }
  function duplicateLine(dir) {
    var v0 = pad.value, s0 = pad.selectionStart, e0 = pad.selectionEnd;
    return withLines(function (lines, sl, el) {
      var colA = s0 - offsetOf(lines, sl, 0), colB = e0 - offsetOf(lines, el, 0);
      var block = lines.slice(sl, el + 1), nl, nsl;
      if (dir > 0) { nl = lines.slice(0, el + 1).concat(block, lines.slice(el + 1)); nsl = el + 1; }
      else { nl = lines.slice(0, sl).concat(block, lines.slice(sl)); nsl = sl + (el - sl + 1); }
      var nel = nsl + (el - sl);
      return { lines: nl, sel: [offsetOf(nl, nsl, 0) + Math.min(colA, nl[nsl].length), offsetOf(nl, nel, 0) + Math.min(colB, nl[nel].length)] };
    });
  }
  // Ctrl+/：行注释开关（//），空行跳过
  function toggleComment() {
    return withLines(function (lines, sl, el, os, oe) {
      var all = true, i;
      for (i = sl; i <= el; i++) {
        if (lines[i].trim() !== "" && !/^\s*\/\//.test(lines[i])) { all = false; break; }
      }
      var colA = os - offsetOf(lines, sl, 0), colB = oe - offsetOf(lines, el, 0);
      for (i = sl; i <= el; i++) {
        if (lines[i].trim() === "") continue;
        if (all) lines[i] = lines[i].replace(/^(\s*)\/\/ ?/, "$1");
        else lines[i] = lines[i].replace(/^(\s*)/, "$1// ");
      }
      function d(col, no) {
        if ((lines[no] || "").trim() === "") return col;
        return all ? Math.max(0, col - 3) : col + 3;
      }
      return { lines: lines, sel: [offsetOf(lines, sl, 0) + d(colA, sl), offsetOf(lines, el, 0) + d(colB, el)] };
    });
  }
  // Tab / Shift+Tab：缩进 2 格（多行批量），Ctrl+[ / Ctrl+] 同效
  function indent(dir) {
    var v = pad.value, s = pad.selectionStart, e = pad.selectionEnd;
    if (s === e) {
      if (dir > 0) { replaceRange(s, e, "  "); return true; }
      var st = lineStartOf(v, s);
      var rm = v.slice(st, s).match(/( {1,2}|\t)$/);
      if (rm) { replaceRange(s - rm[0].length, s, ""); return true; }
      return false;
    }
    return withLines(function (lines, sl, el, os, oe) {
      var colA = os - offsetOf(lines, sl, 0), colB = oe - offsetOf(lines, el, 0);
      var i;
      for (i = sl; i <= el; i++) {
        if (dir > 0) lines[i] = "  " + lines[i];
        else lines[i] = lines[i].replace(/^( {1,2}|\t)/, "");
      }
      var dA = dir > 0 ? colA + 2 : Math.max(0, colA - 2);
      var dB = dir > 0 ? colB + 2 : Math.max(0, colB - 2);
      return { lines: lines, sel: [offsetOf(lines, sl, 0) + dA, offsetOf(lines, el, 0) + dB] };
    });
  }

  /* ---------- 击键记录（提速提准的核心） ---------- */
  pad.addEventListener("compositionstart", function () { state.composing = true; });
  pad.addEventListener("compositionend", function () { state.composing = false; });
  pad.addEventListener("keydown", function (e) {
    // 首次有效输入自动开始计时
    if (!state.started && (e.key.length === 1 || e.key === "Enter" || e.key === " ")) startTimer();
    var t = performance.now();
    state.keyCount++;
    if (state.lastKeyT) {
      var iki = t - state.lastKeyT;
      if (iki < 5000) { // 超过5秒视为思考停顿，不计入节奏
        state.ikiList.push(iki);
        if (state.ikiList.length > 800) state.ikiList.shift();
        var code = e.code || e.key;
        var o = state.perKey[code] || (state.perKey[code] = { n: 0, err: 0, ikiSum: 0 });
        o.n++; o.ikiSum += iki;
      }
    }
    state.lastKeyT = t;
    if (e.key === "Backspace") {
      state.backCount++;
      // 把最近的非退格键记一次“关联删改”，用于定位易错键
      var ks = state.keys;
      for (var i = ks.length - 1; i >= 0; i--) {
        if (ks[i].key !== "Backspace" && !ks[i].counted) {
          ks[i].counted = true;
          var pk = state.perKey[ks[i].code];
          if (pk) pk.err = (pk.err || 0) + 1;
          break;
        }
      }
    }
    state.keys.push({ key: e.key, code: e.code || e.key, t: Math.round(t) });
    if (state.keys.length > 2000) state.keys.splice(0, 500);
    // VS Code 风编辑快捷键分发（组字中不拦截）
    if (!e.isComposing && e.keyCode !== 229) {
      var mod = e.ctrlKey || e.metaKey;
      var code = e.code || "";
      if (mod && !e.shiftKey && !e.altKey && code === "Backspace") { if (killWord(-1)) e.preventDefault(); }
      else if (mod && !e.shiftKey && !e.altKey && code === "Delete") { if (killWord(1)) e.preventDefault(); }
      else if (mod && !e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); insertLine(true); }
      else if (mod && e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); insertLine(false); }
      else if (!mod && e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); insertLine(true); }
      else if (mod && !e.shiftKey && !e.altKey && code === "KeyD") { e.preventDefault(); if (!selectNext()) toast("这里没有可扩选的词"); }
      else if (mod && !e.shiftKey && !e.altKey && code === "KeyL") { e.preventDefault(); selectLine(); }
      else if (mod && e.shiftKey && !e.altKey && code === "KeyK") { e.preventDefault(); deleteLine(); }
      else if (!mod && e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); moveLines(e.key === "ArrowUp" ? -1 : 1); }
      else if (!mod && e.altKey && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); duplicateLine(e.key === "ArrowUp" ? -1 : 1); }
      else if (!mod && e.altKey && !e.shiftKey && code === "KeyR") { e.preventDefault(); resetAll(true); setMsg("已清空并重置，重新开打。", ""); toast("已重来 ↻"); pad.focus(); }
      else if (!mod && e.altKey && !e.shiftKey && code === "KeyN") { e.preventDefault(); switchSampleStep(1, false); }
      else if (mod && !e.shiftKey && !e.altKey && e.key === "/") { e.preventDefault(); toggleComment(); }
      else if (!mod && !e.altKey && e.key === "Tab") { e.preventDefault(); indent(e.shiftKey ? -1 : 1); }
      else if (mod && !e.shiftKey && !e.altKey && e.key === "[") { e.preventDefault(); indent(-1); }
      else if (mod && !e.shiftKey && !e.altKey && e.key === "]") { e.preventDefault(); indent(1); }
      else if (mod && !e.shiftKey && !e.altKey && code === "KeyS") { e.preventDefault(); updateAll(false); setMsg("已保存到本机（本来就在自动保存）。", ""); toast("已保存 ✓"); }
    }
  });

  var inputRaf = 0;
  function raf(fn) {
    if (window.requestAnimationFrame) return window.requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }
  function scheduleInputRender() {
    if (inputRaf) return;
    inputRaf = raf(function () {
      inputRaf = 0;
      var r = updateAll(true);
      renderErrors(r.result);
      // 打完对照全文（按对齐进度或长度达到）→ 自动结算（仅触发一次）
      if (state.mode === "ref" && state.refText && state.started && !state.finished) {
        if ((r.result && r.result.done) || pad.value.length >= state.refText.length) {
          finishPractice(false);
        }
      }
    });
  }
  pad.addEventListener("input", function () {
    if (!state.started && !state.finished) startTimer();
    // 重排合帧：输入法连续上屏也只画一次，手机端不跳
    scheduleInputRender();
  });

  /* ---------- 复制（保留） ---------- */
  function onCopied(text, fromAuto) {
    var preview = text.length > 18 ? text.slice(0, 18) + "…" : text;
    preview = preview.replace(/\n/g, "⏎");
    if (fromAuto) { setMsg("已自动复制 " + text.length + " 字：" + preview, ""); toast("已复制 " + text.length + " 字"); }
    else { setMsg("已复制 " + text.length + " 字：" + preview, ""); toast("已复制到剪贴板"); }
    updateAll(false);
  }
  function onCopyFail(reason) {
    if (reason === "empty") { setMsg("没有可复制的内容（请先选中文字）。", "warn"); }
    else { setMsg("浏览器阻止了剪贴板写入（需 HTTPS/localhost），请选中后按 Ctrl+C 手动复制。", "err"); toast("复制被阻止，请 Ctrl+C"); }
  }
  function doCopySel() {
    var sel = window.TypingClipboard.getSelectedText(pad);
    if (!sel) { setMsg("请先在输入框中选中一段文字再点复制。", "warn"); toast("请先选中文字"); pad.focus(); return; }
    window.TypingClipboard.copyText(pad, sel, false, onCopied, onCopyFail);
  }
  function doCopyAll() {
    if (!pad.value) { setMsg("输入框是空的，没有可复制的内容。", "warn"); return; }
    window.TypingClipboard.copyText(pad, pad.value, false, onCopied, onCopyFail);
  }

  /* ---------- 结算报告 + 历史 + 错题本 ---------- */
  function finishPractice(autoByTime) {
    if (!state.started) return;
    state.elapsed = nowSec();
    clearInterval(state.timerId);
    state.paused = true;
    state.finished = true;
    refreshTimerBtns();
    var r = updateAll(false);
    var sec = nowSec() || 1;
    var res = r.result, st = r.stats, spd = r.speed;
    // 累计 perKey 到全局
    Object.keys(state.perKey).forEach(function (code) {
      var o = state.perKey[code];
      var g = state.totalKeyStat[code] || (state.totalKeyStat[code] = { n: 0, back: 0 });
      g.n += o.n;
    });
    if (state.backCount) {
      var gb = state.totalKeyStat.__back__ || (state.totalKeyStat.__back__ = { n: 0, back: 0 });
      gb.back += state.backCount;
    }
    // 错字本累计（对照模式）：用对齐后的错位，漏打不再连带污染
    if (res && state.refText && res.errorIndexes) {
      for (var i = 0; i < res.errorIndexes.length; i++) {
        var ch = state.refText[res.errorIndexes[i]];
        if (ch) state.mistakes[ch] = (state.mistakes[ch] || 0) + 1;
      }
    }
    // 历史记录
    var rec = {
      date: new Date().toLocaleString(),
      mode: state.mode === "ref" ? "对照" : "自由",
      sample: currentSampleName(),
      chars: st.nonSpace,
      cpm: spd.cpm, wpm: spd.wpm,
      acc: res ? +res.accuracy.toFixed(1) : null,
      score: res ? Math.round(res.score) : null,
      sec: Math.round(sec),
      keys: state.keyCount, backs: state.backCount,
      auto: !!autoByTime
    };
    try {
      var hist = JSON.parse(localStorage.getItem(LS_HIST) || "[]");
      hist.unshift(rec);
      hist = hist.slice(0, 30);
      localStorage.setItem(LS_HIST, JSON.stringify(hist));
    } catch (e) {}
    saveSettings();
    renderHist(); renderMistakes(); refreshPbBadge();
    if (btnReportMistakes) btnReportMistakes.disabled = btnPracticeMistakes.disabled;
    // 报告
    var avgIki = state.ikiList.length ? Math.round(state.ikiList.reduce(function (a, b) { return a + b; }, 0) / state.ikiList.length) : 0;
    var advice = buildAdvice(res, spd, avgIki);
    $("reportBox").classList.remove("hidden");
    $("reportText").innerHTML =
      "<b>" + (autoByTime ? "⏱ 挑战时间到，已自动结算" : "✓ 本次练习已结算") + "</b><br>" +
      "用时 " + window.TypingStats.formatTime(sec) + " · 有效字 " + st.nonSpace + " · 速度 <b>" + spd.cpm + " 字/分（" + spd.wpm + " 词/分）</b>" +
      (res ? " · 准确率 <b>" + res.accuracy.toFixed(1) + "%</b> · 综合分 <b>" + Math.round(res.score) + "</b>（" + window.TypingScoring.gradeLabel(res.score) + "），对 " + res.correct + " / 错+缺 " + res.totalErrors : "") +
      " · 按键 " + state.keyCount + "（退格 " + state.backCount + "）" + (avgIki ? " · 平均键间隔 " + avgIki + "ms" : "") +
      "<br><span style='color:var(--muted)'>" + advice + "</span>";
    $("reportBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
    setMsg(autoByTime ? "挑战结束，已自动打分并存档。" : "已完成对照全文，自动打分并存档。点「再练一遍」或「下一篇」继续。", "");
    updateChart();
  }

  function buildAdvice(res, spd, avgIki) {
    var tips = [];
    if (res) {
      if (res.accuracy < 85) tips.push("准确率偏低，建议先降速 20%，眼睛紧跟原文绿字走，错了不要回头改，打完再统一复盘");
      else if (res.accuracy < 95) tips.push("准确率不错，重点盯上面的「最常打错」前 3 条，用错题本单独练 5 分钟");
      else tips.push("准确率很好，下一步可以把目标速度 +10 字/分，逼一下节奏");
      if (res.extra > 0) tips.push("多打了 " + res.extra + " 字，注意结尾别带出多余标点/空格");
      if (res.missing > 0 && res.missing < res.refLen) tips.push("还差 " + res.missing + " 字，坚持打完，完整度也计入综合分");
    } else {
      tips.push("自由练习重点看速度曲线是否平稳，退格率超过 8% 说明在盲打抢速度，适当放慢");
    }
    var br = state.keyCount ? state.backCount / state.keyCount : 0;
    if (br > 0.08) tips.push("退格率 " + (br * 100).toFixed(1) + "% 偏高，试试放慢到能连续 50 字不删的节奏");
    if (avgIki && avgIki > 600) tips.push("平均键间隔 " + avgIki + "ms，停顿较多，多练同一篇短文 3 遍，把肌肉记忆打出来");
    // 最慢键建议
    var arr = Object.keys(state.perKey).map(function (k) { return { k: k, o: state.perKey[k] }; })
      .filter(function (x) { return x.o.n >= 5; })
      .sort(function (a, b) { return (b.o.ikiSum / b.o.n) - (a.o.ikiSum / a.o.n); });
    if (arr.length) tips.push("最慢的键是 " + arr[0].k.replace("Key", "") + "（平均 " + Math.round(arr[0].o.ikiSum / arr[0].o.n) + "ms），可单独练含这个键的词 20 遍");
    return "教练建议：" + tips.join("；") + "。";
  }

  function currentSampleName() {
    var o = state.samples.filter(function (s) { return s.text === state.refText; })[0];
    if (o) return o.name;
    if (!state.refText) return "—";
    return "自定义文本";
  }

  function renderHist() {
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem(LS_HIST) || "[]"); } catch (e) {}
    var tb = $("histBody");
    var sumEl = $("histSummary");
    if (!hist.length) {
      tb.innerHTML = "<tr><td colspan='7' style='color:var(--muted)'>暂无记录，打完一段对照或点「结束打分」就会存档。</td></tr>";
      if (sumEl) sumEl.textContent = "";
      return;
    }
    var maxCpm = 0, sumCpm = 0, accCount = 0, sumAcc = 0;
    hist.forEach(function (h) {
      var c = h.cpm || 0;
      if (c > maxCpm) maxCpm = c;
      sumCpm += c;
      if (h.acc != null) { sumAcc += h.acc; accCount++; }
    });
    if (sumEl) {
      var avgCpm = Math.round(sumCpm / hist.length);
      var avgAcc = accCount ? (sumAcc / accCount).toFixed(1) + "%" : "—";
      sumEl.textContent = "共 " + hist.length + " 次 · 最高 " + maxCpm + " 字/分 · 平均 " + avgCpm + " 字/分 · 均准 " + avgAcc;
    }
    tb.innerHTML = hist.map(function (h) {
      return "<tr><td>" + escapeHtml(h.date) + "</td><td>" + escapeHtml(h.mode) + "</td><td>" +
        escapeHtml(h.sample || "") + "</td><td>" + h.cpm + " / " + h.wpm + "</td><td>" +
        (h.acc === null ? "—" : h.acc + "%") + "</td><td>" + (h.score === null ? "—" : h.score) +
        "</td><td>" + window.TypingStats.formatTime(h.sec) + "</td></tr>";
    }).join("");
  }

  function exportHistCsv() {
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem(LS_HIST) || "[]"); } catch (e) {}
    if (!hist.length) { toast("暂无历史成绩可导出"); return; }
    var rows = [["时间", "模式", "文本", "CPM(字/分)", "WPM(词/分)", "准确率(%)", "综合分", "用时(秒)", "按键数", "退格数"]];
    hist.forEach(function (h) {
      rows.push([
        h.date || "", h.mode || "", h.sample || "",
        h.cpm || 0, h.wpm || 0,
        h.acc == null ? "" : h.acc,
        h.score == null ? "" : h.score,
        h.sec || 0, h.keys || 0, h.backs || 0
      ]);
    });
    var csv = "﻿" + rows.map(function (r) {
      return r.map(function (cell) {
        var s = String(cell).replace(/"/g, '""');
        return /[",\n]/.test(s) ? '"' + s + '"' : s;
      }).join(",");
    }).join("\n");
    try {
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "typing-history-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("已导出 CSV");
    } catch (e) { toast("导出失败"); }
  }

  function switchSampleStep(step, random) {
    if (!state.samples.length) return;
    if (pad.value && !state.finished && !confirm("换范文会清空当前输入，继续吗？")) { pad.focus(); return; }
    var idx = -1;
    for (var i = 0; i < state.samples.length; i++) {
      if (state.samples[i].id === sampleSel.value) { idx = i; break; }
    }
    var nextIdx = 0;
    if (random && state.samples.length > 1) {
      do { nextIdx = Math.floor(Math.random() * state.samples.length); } while (nextIdx === idx);
    } else {
      nextIdx = (idx + (step || 1) + state.samples.length) % state.samples.length;
    }
    var s = state.samples[nextIdx];
    sampleSel.value = s.id;
    state.refText = s.text; refEdit.value = s.text;
    resetAll(true);
    setMsg("已换成：" + s.name + "，直接开打吧。", "");
    toast("已换范文：" + s.name);
    pad.focus();
  }

  function startMistakePractice() {
    var arr = Object.keys(state.mistakes).sort(function (a, b) { return state.mistakes[b] - state.mistakes[a]; }).slice(0, 40);
    if (!arr.length) { toast("错题本还是空的"); return; }
    var chunk = arr.join("");
    var txt = ("【错题强化】请跟打下面这段（来自你的错字本）：\n" + chunk.split("").join(" ") + "\n" + chunk + "\n" + chunk).slice(0, 600);
    state.refText = txt; refEdit.value = txt;
    resetAll(true);
    setMsg("已按你的错字本生成强化段，反复打 3 遍。", "");
    toast("已生成错题强化段");
    pad.focus();
  }

  function renderMistakes() {
    var arr = Object.keys(state.mistakes).map(function (ch) { return { ch: ch, n: state.mistakes[ch] }; });
    arr.sort(function (a, b) { return b.n - a.n; });
    var top = arr.slice(0, 30);
    $("mistakeChars").innerHTML = top.length ? top.map(function (x) {
      return "<code>" + escapeHtml(x.ch === " " ? "␣" : x.ch) + "×" + x.n + "</code>";
    }).join(" ") : "暂无，出现对照错字后自动收集。";
    btnPracticeMistakes.disabled = !top.length;
    if (btnReportMistakes) btnReportMistakes.disabled = !top.length;
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    tabFree.addEventListener("click", function () { setMode("free"); });
    tabRef.addEventListener("click", function () { setMode("ref"); });
    function setMode(m) {
      state.mode = m;
      tabFree.classList.toggle("active", m === "free");
      tabRef.classList.toggle("active", m === "ref");
      refCard.classList.toggle("hidden", m === "free");
      resetAll(false);
      saveSettings();
    }
    // 初始化 tab 状态
    tabFree.classList.toggle("active", state.mode === "free");
    tabRef.classList.toggle("active", state.mode === "ref");
    refCard.classList.toggle("hidden", state.mode === "free");

    btnStart.addEventListener("click", startTimer);
    btnPause.addEventListener("click", pauseTimer);
    $("btnReset").addEventListener("click", function () { resetAll(false); setMsg("已重置计时（保留文字）。", ""); });
    btnFinish.addEventListener("click", function () { finishPractice(false); });

    btnCopySel.addEventListener("click", doCopySel);
    btnCopyAll.addEventListener("click", doCopyAll);
    btnSelectAll.addEventListener("click", function () { pad.focus(); pad.select(); });
    btnClear.addEventListener("click", function () {
      if (!pad.value) return;
      if (confirm("确定清空输入框内容吗？")) { pad.value = ""; window.TypingClipboard.resetHistory(); resetAll(false); pad.focus(); }
    });

    btnUseCustom.addEventListener("click", function () {
      var t = refEdit.value.trim();
      if (!t) { setMsg("请先在自定义框里粘贴或输入对照文本。", "warn"); return; }
      state.refText = t;
      resetAll(true);
      setMsg("已设为对照文本（" + t.length + " 字），开始跟打吧。", "");
      pad.focus();
    });
    // 选即用：下拉一切换就换上新对照，不用再点载入
    sampleSel.addEventListener("change", function () {
      var s = selectedSample();
      if (!s || s.text === state.refText) return;
      if (pad.value && !confirm("换范文会清空当前输入，继续吗？")) { syncSampleSel(); pad.focus(); return; }
      state.refText = s.text; refEdit.value = s.text;
      resetAll(true);
      setMsg("已换成：" + s.name + "，直接开打吧。", "");
      toast("已换范文：" + s.name);
      pad.focus();
    });
    // 改对照走显式按钮：对照区单击只管选中复制，不再误触编辑
    var btnEditRef = $("btnEditRef");
    if (btnEditRef) btnEditRef.addEventListener("click", function () {
      var draft = refEdit.value || "";
      if (draft.trim() && draft !== state.refText &&
          !confirm("自定义框里有还没生效的草稿，要用当前对照文本覆盖吗？\n（点“取消”保留草稿直接改）")) {
        openCustomEditor();
        return;
      }
      refEdit.value = state.refText;
      openCustomEditor();
      setMsg("已展开自定义对照，改完点「设为对照文本」即生效。", "");
    });
    btnPracticeMistakes.addEventListener("click", startMistakePractice);
    if (btnNextSample) btnNextSample.addEventListener("click", function () { switchSampleStep(1, false); });
    if (btnRandomSample) btnRandomSample.addEventListener("click", function () { switchSampleStep(1, true); });
    if (btnReportRetry) btnReportRetry.addEventListener("click", function () {
      resetAll(true);
      setMsg("已清空并重置，再来一遍！", "");
      pad.focus();
    });
    if (btnReportNext) btnReportNext.addEventListener("click", function () { switchSampleStep(1, false); });
    if (btnReportMistakes) btnReportMistakes.addEventListener("click", startMistakePractice);
    if (btnExportHist) btnExportHist.addEventListener("click", exportHistCsv);
    if (loosePunctBox) loosePunctBox.addEventListener("change", function () {
      state.loosePunct = loosePunctBox.checked;
      saveSettings();
      var r = updateAll(false);
      renderErrors(r.result);
      toast(state.loosePunct ? "标点宽容：已开启（中英标点互通）" : "标点宽容：已关闭");
    });

    btnClearHist.addEventListener("click", function () {
      if (!confirm("清空全部历史成绩吗？")) return;
      try { localStorage.removeItem(LS_HIST); } catch (e) {}
      renderHist(); refreshPbBadge();
    });
    $("btnClearMistakes").addEventListener("click", function () {
      if (!confirm("清空错题本吗？")) return;
      state.mistakes = {}; saveSettings(); renderMistakes();
    });

    autoCopyBox.addEventListener("change", function () { refreshSwitchLabel(); saveSettings(); window.TypingClipboard.resetHistory(); });
    btnTheme.addEventListener("click", function () {
      state.themePref = state.themePref === "auto" ? "light" : (state.themePref === "light" ? "dark" : "auto");
      applyTheme(); saveSettings();
      if (state.chart) { state.chart.destroy(); state.chart = null; updateChart(); }
    });
    // 跟随系统：仅偏好为 auto 时响应
    try {
      var darkMq = window.matchMedia("(prefers-color-scheme: dark)");
      var onSysTheme = function () { if (state.themePref === "auto") { applyTheme(); if (state.chart) { state.chart.destroy(); state.chart = null; updateChart(); } } };
      if (darkMq.addEventListener) darkMq.addEventListener("change", onSysTheme);
      else if (darkMq.addListener) darkMq.addListener(onSysTheme);
    } catch (e) {}
    // 只用按钮进出专注：打字时 Esc 太容易误触，不绑定快捷键
    if (btnZen) btnZen.addEventListener("click", function () { setZen(document.body.dataset.zen !== "true"); });
    pad.addEventListener("scroll", function () {
      try {
        if (Math.abs(refView.scrollTop - pad.scrollTop) > 2) refView.scrollTop = pad.scrollTop;
      } catch (e) {}
    });
    fontSize.addEventListener("input", function () { applyFont(); saveSettings(); });
    [challengeDur, targetCpm, targetAcc].forEach(function (el) { el.addEventListener("change", saveSettings); });

    // 选中自动复制（保留）：输入框 + 对照区都支持
    window.TypingClipboard.bindAutoCopy(pad, function () { return autoCopyBox.checked; }, onCopied);
    // 对照区选中也复制（只读区用原生 selection）
    var docDeb = null;
    document.addEventListener("mouseup", function () {
      if (!autoCopyBox.checked) return;
      clearTimeout(docDeb);
      docDeb = setTimeout(function () {
        var sel = window.getSelection();
        if (!sel || sel.toString().trim().length < 2) return;
        // 若焦点在输入框，已由输入框逻辑处理，避免重复
        if (document.activeElement === pad) return;
        var text = sel.toString();
        if (refView.contains(sel.anchorNode) || refEdit === document.activeElement) {
          window.TypingClipboard.copyText(pad, text, true, onCopied, null);
        }
      }, 300);
    });
  }

  /* ---------- 启动 ---------- */
  var bootSavedRef = null;
  function boot() {
    try { bootSavedRef = localStorage.getItem(LS_REF); } catch (e) { bootSavedRef = null; }
    loadSettings();
    applyFont();
    bind();
    try {
      var saved = localStorage.getItem(LS_CONTENT);
      if (saved) pad.value = saved;
    } catch (e) {}
    initSamples();
    renderHist(); renderMistakes();
    // 等范文载入后再做一次对照渲染
    setTimeout(function () { updateAll(false); renderErrors(window.TypingScoring.scoreReference(state.refText, pad.value, scoreOpts())); }, 400);
    updateAll(false);
    refreshTimerBtns();
    updateChart();
    // 触屏设备不主动聚焦：避免 iPhone 上弹键盘顶起页面
    var coarse = false;
    try { coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches; } catch (e) {}
    if (!coarse) { try { pad.focus(); } catch (e) {} }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) flushSave();
    });
    window.addEventListener("pagehide", function () { flushSave(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
