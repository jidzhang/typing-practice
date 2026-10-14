# 打字练习（离线单机）

🌐 在线体验：https://jidzhang.github.io/typing-practice/

对照跟打提准，自由练习提速，带击键记录、错题本、速度曲线、挑战计时。
选中自动复制、使用说明全部保留。无 CDN，完全离线可用。

## 打开方式（任选其一）

1. **在线版（推荐）**：直接打开 https://jidzhang.github.io/typing-practice/
2. **本地服务**：

```bash
cd typing-practice
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/
```

直接双击 `index.html` 也能用（`file://`）。推荐用上面的本地服务方式，剪贴板最稳定。

## 目录

```
index.html            入口（仅引用本地文件）
css/style.css         样式（含深色主题）
js/texts.js           内置范文兜底（file:// 下 fetch 不可用时用它）
js/clipboard.js       选中自动复制（Clipboard API + execCommand 降级）
js/stats.js           计数与速度（字数/中文/英文词/行/CPM/WPM）
js/scoring.js         对照打分（准确率/综合分/评级/错字归类）
js/app.js             主逻辑（计时/击键记录/曲线/错题本/历史/挑战赛）
texts/samples.json    范文库（可自己加）
vendor/chart.umd.min.js  Chart.js 4.4.1 本地文件（画速度曲线）
vendor/NOTICE.txt     第三方库说明
```

## 编辑快捷键（VS Code 风）

| 按键 | 作用 |
|---|---|
| Ctrl+Backspace / Ctrl+Delete | 按词删除（中文一字一删） |
| Ctrl+Enter / Shift+Enter / Ctrl+Shift+Enter | 下方 / 下方 / 上方插入空行 |
| Ctrl+D | 连选下一个相同的词 |
| Ctrl+L | 选中整行 |
| Ctrl+Shift+K | 删除整行 |
| Alt+↑/↓ | 移动整行 |
| Shift+Alt+↑/↓ | 复制整行 |
| Ctrl+/ | 行注释开关 |
| Tab / Shift+Tab | 缩进 / 退格 |
| Ctrl+S | 保存到本机 |

Mac 用 ⌘ 代替 Ctrl。单行改动支持 Ctrl+Z 撤销，拼音组字时不拦截。

## 主题与专注

- 右上主题按钮在 **自动 / 浅色 / 深色** 间循环切换，默认**跟随系统**（浅/深色模式切换时自动换肤，图表颜色同步重绘）。
- 练习区右上 **🧘 专注** 进入 Zen 模式：顶栏压缩、其他面板隐藏、练习区放大（对照区不限高、输入区约 58vh、字号 +2px），只能点按钮退出（防误触），状态会记住。

## 练法建议

1. 对照跟打 1 篇 → 看复盘（最常打错 + 最慢键）→ 用错题本生成强化段打 3 遍。
2. 退格率 >8% 就降速，先保证 50 字不断删。
3. 定个目标（如 120 字/分 + 95%），达标再加量。

## 隐私

内容、成绩、错题、按键统计只存本机 `localStorage`，不联网。
