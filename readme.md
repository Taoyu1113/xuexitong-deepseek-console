# 学习通视频与章节测验助手（V4 状态机 · Edge 控制台 + DeepSeek 本地服务版）

一个基于 [chaolucky18/xuexitongScript](https://github.com/chaolucky18/xuexitongScript) 重构的免油猴（Tampermonkey）学习通课程辅助工具，由 **Edge 浏览器控制台脚本** 与 **本地 Node.js DeepSeek 代理服务** 组成。API Key 仅在终端输入并驻留内存，不写入任何文件或日志，支持视频自适应播放、文档节点推进与 AI 章节测验作答。

> **免责声明**：本项目仅用于前端自动化研究与页面脚本调试，请遵守所在学校及目标平台的使用规定。

---

## 核心功能改进（V4 相比原版）

### 1. 有限状态机驱动，消除并发与重复跳转
- 引入 9 状态有限状态机（`IDLE`、`LOADING_NODE`、`PLAYING_VIDEO`、`WAITING_DOCUMENT`、`PAUSED_MANUAL`、`ADVANCING`、`COMPLETED`、`ERROR`、`DESTROYED`），配合 `_runEpoch` 与 `AbortController` 隔离异步周期，解决页面切换、步骤页签点击与视频结束事件并发导致的重复触发问题。

### 2. 视频三模式自适应播放（全程静音 + 播放保活）
脚本自动检测播放器与页面限制并切换策略，且在失焦、切出标签页或暂停时自动恢复：

| 播放模式 | 触发条件 | 执行策略 |
| :--- | :--- | :--- |
| **模式 A：可拖拽视频** | 进度条允许拖拽且未禁用快进 | 自动跳转至视频末尾前 3 秒等待完成上报 |
| **模式 B：不可拖拽但可倍速** | 禁止拖动进度条，但允许倍速 | 自动切换至 `2x` 倍速播放（`nonDraggablePlaybackRate`） |
| **模式 C：禁倍速视频** | 检测到 `doublespeed=0`、隐藏倍速控件或倍速触发暂停/重置 | 自动回退至 `1x` 正常速度播放，避免触发平台拦截 |

### 3. 普通文档 / PPT 节点自动推进
识别到无视频、无测验的文档或 PPT 节点时，状态机自动进入 `WAITING_DOCUMENT`，延时 `5000ms` 后自动推进至下一节（可通过 `app.configs.autoAdvanceNoVideo = false` 关闭）。

### 4. DeepSeek AI 章节测验分级作答与防复制还原
- **防复制字符还原**：针对学习通网页常见的汉字替换或夹杂字符，引导 `deepseek-flash` 模型（`reasoning_effort: 'low'`）先还原题意再输出结构化 JSON 答案（单批上限 30 题）。
- **情况 1（全为客观题）**：自动识别单选、多选、判断题，校验题量与选项后自动勾选、点击“提交”并处理二次确认弹窗，待成绩或完成标记出现后自动进入下一节。
- **情况 2（含主观题/混合题型）**：仅勾选可识别的客观题，**不提交答案**，在控制台提示后跳过当前节点等待人工处理，避免误交。
- **手动接管开关**：设置 `app.configs.pauseOnAssessment = true` 可在遇到测验时直接暂停。

### 5. 整页跳转自动恢复与本地安全校验
- **辅助窗口保活**：首次运行会打开“学习通自动任务辅助窗口”，课程页整页跳转且 `#coursetree` 就绪后自动重新注入脚本。
- **本地服务安全加固**：`deepseek-local.mjs` 仅监听 `127.0.0.1:37841`，仅放行 `https://*.chaoxing.com` 来源请求，并在每次启动时随机生成 48 位十六进制 `LOCAL_TOKEN` 自动写入 `xuexitong-console.js` 进行校验。

---

## 安装与使用说明

### 1. 环境准备
- **Node.js 18+**（支持 ES Modules 与原生 `fetch`）
- **Microsoft Edge**（或其他 Chromium 内核浏览器）
- 有效的 [DeepSeek API Key](https://platform.deepseek.com/)

### 2. 下载与目录结构
1. 停用浏览器中此前安装的学习通油猴（Tampermonkey）脚本，避免冲突。
2. 克隆本仓库或下载 ZIP 并**全部解压到同一文件夹**，确保包含以下 4 个文件：
   - `start-local-service.cmd`（Windows 启动器）
   - `deepseek-local.mjs`（本地 HTTP 代理服务）
   - `deepseek-request.mjs`（DeepSeek API 请求模块）
   - `xuexitong-console.js`（Edge 控制台执行脚本）

### 3. 启动本地 DeepSeek 服务
1. 双击运行 **`start-local-service.cmd`**（macOS / Linux 在项目目录运行 `node deepseek-local.mjs`）。
2. 在终端粘贴 **DeepSeek API Key** 并按 `Enter`（输入不显示字符）。
3. 看到 `本地服务已启动：http://127.0.0.1:37841` 后**保持窗口打开**。

> 每次重启本地服务都会刷新 `xuexitong-console.js` 中的 `LOCAL_TOKEN`，重启后需重新复制一次脚本。

### 4. 在 Edge 控制台运行脚本
1. 用记事本打开同目录的 **`xuexitong-console.js`**，按 `Ctrl + A`、`Ctrl + C` 复制完整内容。
2. 在 Edge 打开学习通课程播放页（URL 含 `/mycourse/studentstudy`），按 **`F12`** → **`Console`**，粘贴后确认末尾为 `})();` 再按 `Enter`。
3. 按浏览器提示允许课程页**访问本地网络**与**打开弹出窗口**（“学习通自动任务辅助窗口”）。
4. 注意：确认脚本正常启动后，**建议按`F12`关闭开发者工具**——关闭后脚本仍会在页面后台持续运行，且可避免后续触发学习通页面的反调试 `debugger` 暂停。

### 5. 常用控制台指令与排查

```javascript
app.inspectQuiz()                     // 查看当前识别到的测验题目与选项
app.state                             // 查看当前状态机状态
app.resume()                          // 从暂停或异常状态恢复并进入下一节
app.nextUnit()                        // 强制跳至下一小节
app.configs.pauseOnAssessment = true  // 遇到测验时暂停，交由人工处理
app.destroy()                         // 停止脚本（或直接刷新页面）
```

- **`Uncaught SyntaxError: missing ) after argument list`**：复制不完整或混入多余字符，请重新全选复制 `xuexitong-console.js` 并确认结尾为 `})();`。
- **提示“已在调试程序中暂停”**：在 Edge 开发者工具按 **`F8`** 恢复执行，并检查 `Sources` 面板是否误开启“遇到异常时暂停”。
- **无关控制台提示**：`work-css-tpl.cssx 404`、`highlight.js deprecated`、`JQMIGRATE` 为页面自身提示，非脚本报错；脚本停止时会输出明确的红色错误说明。
- **费用与准确率提示**：调用 DeepSeek API 会产生少量 Token 费用，AI 作答亦可能出错，建议首次使用时观察一轮完整提交流程。

---

## 致谢

本项目基于 **[chaolucky18](https://github.com/chaolucky18)** 开源的 **[chaolucky18/xuexitongScript](https://github.com/chaolucky18/xuexitongScript)** 进行重构与功能扩展。感谢原作者在 `#coursetree` 目录遍历、嵌套 `iframe` 视频探测、静音兜底策略及 DeepSeek 本地代理方案上的开源贡献，欢迎前往原仓库点亮 Star 支持！
