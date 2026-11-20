# 学习通视频与章节测验助手（V4 状态机 · Edge 控制台 + DeepSeek 本地服务版）

一个无需安装 Tampermonkey（油猴）的学习通课程辅助工具。通过 **Edge 浏览器控制台脚本** 与 **本地 Node.js DeepSeek 代理服务** 协同工作，实现课程视频自适应播放、普通文档节点自动推进，以及章节测验的 AI 识别与辅助作答。

> **免责声明**：本项目仅用于前端自动化技术研究、状态机架构实践与页面脚本调试，请遵守所在学校及目标平台的使用规定，切勿用于违规用途。

---

## 项目介绍

本项目在 [chaolucky18/xuexitongScript](https://github.com/chaolucky18/xuexitongScript) 的基础上进行了 **V4 状态机重构**，解决了传统刷课脚本在页面切换、异步竞态、倍速拦截与混合题型误提交等方面的稳定性问题。

### 项目文件结构

| 文件名 | 作用说明 |
| :--- | :--- |
| `start-local-service.cmd` | Windows 一键启动器，自动定位 `node.exe` 并启动本地代理服务 |
| `deepseek-local.mjs` | 本地 HTTP 服务（监听 `127.0.0.1:37841`），负责密钥内存读取、令牌生成与跨域校验 |
| `deepseek-request.mjs` | DeepSeek API 请求封装模块，负责构造防复制还原提示词与结构化 JSON 校验 |
| `xuexitong-console.js` | Edge 浏览器控制台执行脚本，内置 V4 有限状态机、视频自适应控制与测验自动化 |
| `README.md` | 项目说明与使用文档 |

### 安全与隐私设计

- **API Key 不落盘**：启动本地服务时在终端粘贴 DeepSeek API Key（输入不回显），密钥仅保存在 Node.js 进程内存中，**绝不写入任何文件或日志**。
- **动态本地令牌校验**：`deepseek-local.mjs` 每次启动都会使用 `crypto.randomBytes(24)` 生成新的 48 位十六进制随机令牌，并自动回写至 `xuexitong-console.js` 的 `LOCAL_TOKEN`，用于校验 `X-Xuexitong-Token` 请求头。
- **严格来源限制**：本地服务仅绑定 `127.0.0.1`，且仅放行来自 `https://*.chaoxing.com` 的跨域请求（CORS）。
- **无敏感日志输出**：服务端不打印 API Key、请求体或题目内容；题目与选项仅在本地浏览器 DevTools 控制台展示以便核对。

---

## 功能说明

### 1. 有限状态机驱动（FSM）

`xuexitong-console.js` 内置完整的 9 状态有限状态机（`IDLE`、`LOADING_NODE`、`PLAYING_VIDEO`、`WAITING_DOCUMENT`、`PAUSED_MANUAL`、`ADVANCING`、`COMPLETED`、`ERROR`、`DESTROYED`），结合 `_runEpoch` 与 `AbortController` 管理异步生命周期，从根源上避免节点切换时的重复触发与状态竞争。

### 2. 视频三模式自适应播放（全程静音）

脚本会自动检测当前视频节点的播放器属性与页面限制，并按以下策略自适应运行：

| 播放模式 | 触发条件 | 执行策略 |
| :--- | :--- | :--- |
| **模式 A：可拖拽视频** | 进度条未禁用且允许快进（`enableSeekableSkip: true`） | 自动跳转至视频末尾前 3 秒（`seekTailSeconds: 3`）等待完成上报 |
| **模式 B：不可拖拽但可倍速** | 禁止拖动进度条，但页面允许倍速 | 自动切换至 `nonDraggablePlaybackRate`（默认 `2x`）播放 |
| **模式 C：禁倍速视频** | 检测到 `doublespeed=0`、隐藏倍速按钮或倍速触发暂停/重置 | 自动回退至 `1x` 正常速度播放，防止触发平台拦截 |

此外，脚本还内置播放保活机制：在页面失焦、切出标签页、意外暂停或长时间无进度时自动恢复静音播放。

### 3. 普通文档 / PPT 节点自动处理

当节点不包含视频与测验（如纯文档、PPT 课件）时，状态机进入 `WAITING_DOCUMENT`，在延时 `noVideoDelayMs`（默认 `5000ms`）后自动推进至下一小节；也可通过将 `app.configs.autoAdvanceNoVideo` 设为 `false` 改为手动确认推进。

### 4. DeepSeek AI 章节测验自动作答

- **题型识别**：自动滚动题目容器并识别当前框架内的**单选题、多选题、判断题**（单次上限 30 题）。
- **防复制字符还原**：针对学习通网页常见的汉字替换或夹杂干扰字符，提示词会引导 `deepseek-flash` 模型（开启低强度思考 `reasoning_effort: 'low'`，`max_tokens: 8000`）先结合上下文还原题意再返回严格 JSON 答案。
- **分级处理机制**：
  - **情况 1（全为客观题）**：校验题量与选项字母无误后自动勾选，点击“提交”并确认二次弹窗，等待“本次成绩”或完成标记出现后自动进入下一节点。
  - **情况 2（含非客观题的混合题型或纯主观题）**：仅完成可识别客观题的勾选，**不会自动提交**，并在控制台发出警告后跳过当前节点等待人工处理。
- **人工接管开关**：如需遇到任何测验都暂停，可在控制台设置 `app.configs.pauseOnAssessment = true`。

### 5. 整页跳转自动恢复（辅助窗口）

首次启动脚本时会自动弹出一个“学习通自动任务辅助窗口”。当“下一节”触发课程页整页跳转且新页面 `#coursetree` 加载就绪后，辅助窗口会自动将脚本重新注入课程页继续运行。

---

## 安装教程

### 环境要求

- **操作系统**：Windows（支持直接双击 `.cmd` 启动脚本；macOS / Linux 用户可直接使用 Node.js 运行 `.mjs` 文件）
- **Node.js**：建议 **Node.js 18+**（需支持 ES Modules 与原生 `fetch`）
- **浏览器**：Microsoft Edge（或其他 Chromium 内核浏览器）
- **API 密钥**：有效的 [DeepSeek API Key](https://platform.deepseek.com/)

### 安装步骤

1. **停用油猴脚本**：如果此前在浏览器中安装过学习通 Tampermonkey 脚本，请先将其停用，避免多套脚本同时操作页面造成冲突。
2. **下载项目文件**：克隆本仓库或下载 ZIP 并**全部解压到同一个文件夹**（切勿直接在压缩包内运行），确保以下文件位于同一目录：
   - `start-local-service.cmd`
   - `deepseek-local.mjs`
   - `deepseek-request.mjs`
   - `xuexitong-console.js`
3. **检查 Node.js 环境**：在终端运行 `node -v` 确认已安装 Node.js。Windows 下 `start-local-service.cmd` 会自动通过 `where node.exe` 查找可用环境。

---

## 使用方法

### 第一步：启动本地 DeepSeek 服务

1. 双击运行 **`start-local-service.cmd`**（macOS / Linux 请在项目目录执行 `node deepseek-local.mjs`）。
2. 在弹出的终端窗口中粘贴你的 **DeepSeek API Key** 并按 `Enter`（输入过程不显示字符）。
3. 看到如下提示后，**保持该窗口打开**：

```text
本地服务已启动：http://127.0.0.1:37841
请复制同目录 xuexitong-console.js 的全部内容，粘贴到学习通页面的 Edge 控制台并按 Enter。
关闭本窗口即可停止服务；API Key 不会写入文件。
```

> 每次重启本地服务都会生成新的 `LOCAL_TOKEN` 并更新 `xuexitong-console.js`，因此重启服务后需要重新复制一次脚本。

### 第二步：在 Edge 控制台注入脚本

1. 用记事本或文本编辑器打开同目录的 **`xuexitong-console.js`**，按 **`Ctrl + A`** 全选并 **`Ctrl + C`** 复制完整内容（请勿只复制部分片段）。
2. 在 Edge 中打开学习通课程播放页（URL 需包含 `/mycourse/studentstudy`）。
3. 按 **`F12`** 打开开发者工具，切换到 **`Console`（控制台）** 面板，粘贴脚本内容，确认输入末尾为 `})();` 后按 `Enter` 执行。
4. 按浏览器提示允许课程页：
   - **访问本地网络**（用于连接 `127.0.0.1:37841`）；
   - **打开弹出窗口**（用于启动“学习通自动任务辅助窗口”）。
5. 启动成功后即可关闭开发者工具，**保持课程页与辅助窗口打开**。

### 常用控制台调试指令

脚本运行时会在页面挂载全局对象 `window.app`，你可以在控制台直接调用：

```javascript
// 查看当前页面识别到的测验题目与选项
app.inspectQuiz()

// 查看当前状态机状态（如 PLAYING_VIDEO、PAUSED_MANUAL 等）
app.state

// 从人工暂停或异常状态恢复，继续推进至下一小节
app.resume()

// 强制跳至下一小节
app.nextUnit()

// 遇到任何测验时直接暂停，不自动调用 DeepSeek
app.configs.pauseOnAssessment = true

// 停止脚本并清理所有定时器与事件监听（或直接刷新页面）
app.destroy()
```

### 常见问题排查

- **`Uncaught SyntaxError: missing ) after argument list`**：粘贴内容被截断或混入了多余字符。请重新用 `Ctrl + A`、`Ctrl + C` 复制完整的 `xuexitong-console.js`，确认结尾是 `})();` 再回车。
- **页面顶部提示“已在调试程序中暂停”**：请在 Edge 开发者工具中按 **`F8`** 或点击恢复执行（▶），并检查 `Sources` 面板是否误开启了“遇到异常时暂停”。
- **控制台出现 `work-css-tpl.cssx 404`、`highlight.js deprecated`、`JQMIGRATE`**：这些属于学习通页面自身资源提示，并非脚本报错；若脚本中断，请查看具体的红色错误日志（如“章节测验自动作答停止”）。
- **费用与准确率说明**：测验题目与选项会发送至 DeepSeek API 并产生相应 Token 费用，AI 答案亦可能存在误判，建议首次使用时观察一轮完整提交流程。

---

## 修改记录

### V4 状态机重构版（当前版本）

- **状态机与生命周期隔离**：引入 `STATE` 9 状态机与 `_runEpoch` / `AbortController` 机制，彻底解决页面切换、步骤页签点击与视频结束事件并发导致的重复跳转问题。
- **视频三模式自适应与反拦截**：新增进度条可拖拽检测（自动跳尾）、不可拖拽 2x 倍速尝试，以及禁倍速/播放器重置时的自动 `1x` 回退逻辑。
- **普通文档节点支持**：自动识别纯文档/PPT 节点并按设定延时安全推进。
- **测验自动化增强**：
  - 区分“全客观题（自动校验并提交）”与“含非客观题混合题型（仅勾选客观题，跳过提交防止误交）”。
  - 增加二次提交确认弹窗处理与成绩/完成状态轮询等待。
  - 新增 `app.inspectQuiz()` 诊断方法与 `pauseOnAssessment` 人工暂停开关。
- **本地服务与安全加固**：
  - API Key 改为终端交互读取（无回显），仅存内存、不写文件。
  - 启动时动态生成 48 位随机 `LOCAL_TOKEN` 回写至前端脚本，并严格限制 `*.chaoxing.com` CORS 来源与单批最大 30 题校验。
  - `deepseek-request.mjs` 升级为 `deepseek-flash` 模型配置（`reasoning_effort: 'low'`、`max_tokens: 8000`），并加入学习通防复制替换字还原提示词。
- **整页跳转恢复**：新增“学习通自动任务辅助窗口”，支持课程页整页跳转后自动重新注入脚本。

### 上游基线（V3 及 DeepSeek 控制台原型）

- 继承自上游仓库的双入口结构与核心 DOM 交互逻辑，包括 `#coursetree` 课程目录队列构建、多层级 `iframe` 视频探测、静音兜底恢复播放及 DeepSeek 本地桥接基本思路。

---

## 致谢

本项目基于 **[chaolucky18](https://github.com/chaolucky18)** 开源的 **[chaolucky18/xuexitongScript](https://github.com/chaolucky18/xuexitongScript)** 进行深度重构与功能扩展。

在此向原作者 **chaolucky18** 致以诚挚的感谢！原作者在学习通课程目录树（`#coursetree`）遍历、嵌套 `iframe` 视频元素识别、静音播放兜底策略、学习步骤页签切换以及 DeepSeek 控制台本地服务方案上的开创性实现，为本项目的 V4 状态机重构与自动化测验演进奠定了坚实基础。

如果你觉得这个项目有帮助，欢迎前往原作者仓库 [chaolucky18/xuexitongScript](https://github.com/chaolucky18/xuexitongScript) 点亮 Star 支持！
