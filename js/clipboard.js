/* clipboard.js - 选中自动复制模块（保留自单文件版，零依赖） */
(function (global) {
  var lastCopied = "";
  var toastFn = null;

  function setToastFn(fn) { toastFn = fn; }
  function resetHistory() { lastCopied = ""; }

  function getSelectedText(ta) {
    try {
      var s = ta.selectionStart, e = ta.selectionEnd;
      if (typeof s === "number" && typeof e === "number" && e > s) {
        return ta.value.slice(s, e);
      }
    } catch (err) {}
    return "";
  }

  function copyText(ta, text, fromAuto, onOk, onFail) {
    if (!text) {
      if (!fromAuto && onFail) onFail("empty");
      return Promise.resolve(false);
    }
    if (fromAuto && text === lastCopied) return Promise.resolve(true);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        var p = navigator.clipboard.writeText(text);
        if (p && p.then) {
          return p.then(function () {
            lastCopied = text;
            if (onOk) onOk(text, fromAuto);
            return true;
          }).catch(function () {
            return fallbackCopy(ta, text, fromAuto, onOk, onFail);
          });
        }
      } catch (e) {
        return fallbackCopy(ta, text, fromAuto, onOk, onFail);
      }
    }
    return fallbackCopy(ta, text, fromAuto, onOk, onFail);
  }

  function fallbackCopy(ta, text, fromAuto, onOk, onFail) {
    try {
      ta.focus();
      if (!getSelectedText(ta)) {
        if (ta.value === text) {
          ta.select();
        } else {
          if (!fromAuto && onFail) onFail("blocked");
          return Promise.resolve(false);
        }
      }
      var ok = document.execCommand("copy");
      if (ok) {
        lastCopied = text;
        if (onOk) onOk(text, fromAuto);
        return Promise.resolve(true);
      }
    } catch (e) {}
    if (!fromAuto && onFail) onFail("blocked");
    return Promise.resolve(false);
  }

  // 给 textarea 绑定选中即复制（含鼠标/键盘/移动端），返回解绑函数
  function bindAutoCopy(ta, isEnabled, onCopy) {
    var debounceTimer = null;
    function debounce() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(maybeCopy, 280);
    }
    function maybeCopy() {
      if (!isEnabled()) return;
      var sel = getSelectedText(ta);
      if (!sel) return;
      copyText(ta, sel, true,
        function (t) { if (onCopy) onCopy(t, true); },
        null);
    }
    function onKey(e) {
      if (e.shiftKey || (e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) debounce();
    }
    ta.addEventListener("select", debounce);
    ta.addEventListener("mouseup", debounce);
    ta.addEventListener("keyup", onKey);
    function onDocSel() { if (document.activeElement === ta) debounce(); }
    document.addEventListener("selectionchange", onDocSel);
    return function unbind() {
      clearTimeout(debounceTimer);
      ta.removeEventListener("select", debounce);
      ta.removeEventListener("mouseup", debounce);
      ta.removeEventListener("keyup", onKey);
      document.removeEventListener("selectionchange", onDocSel);
    };
  }

  global.TypingClipboard = {
    getSelectedText: getSelectedText,
    copyText: copyText,
    bindAutoCopy: bindAutoCopy,
    resetHistory: resetHistory,
    setToastFn: setToastFn
  };
})(window);
