(function xuexitongMain() {
const PAGE = window;
const $ = (...args) => PAGE.jQuery(...args);
const APP_KEY = '__xuexitongConsoleDeepSeek';
const BOOT_TIMER_KEY = '__xuexitongConsoleDeepSeekBootTimer';
const LOCAL_URL = 'http://127.0.0.1:37841';
const LOCAL_TOKEN = '__LOCAL_TOKEN__';
const startedByKeeper = PAGE.__xuexitongAutoInjected === true;
delete PAGE.__xuexitongAutoInjected;
if (!/^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(location.origin) ||
!location.pathname.includes('/mycourse/studentstudy')) {
console.error('请在学习通课程播放页的控制台执行本脚本');
return;
}
if (LOCAL_TOKEN === '__LOCAL_TOKEN__') {
console.error('请先启动 DeepSeek 本地服务，再复制更新后的 xuexitong-console.js');
return;
}

const previousApp = PAGE[APP_KEY];
if (previousApp && typeof previousApp.destroy === 'function') {
previousApp.destroy();
}
if (PAGE.__xuexitongPlayerV3 && typeof PAGE.__xuexitongPlayerV3.destroy === 'function') {
PAGE.__xuexitongPlayerV3.destroy();
}
if (PAGE.__xuexitongPlayerV4DeepSeek && typeof PAGE.__xuexitongPlayerV4DeepSeek.destroy === 'function') {
PAGE.__xuexitongPlayerV4DeepSeek.destroy();
}
if (PAGE[BOOT_TIMER_KEY]) {
clearInterval(PAGE[BOOT_TIMER_KEY]);
PAGE[BOOT_TIMER_KEY] = null;
}
if (!startedByKeeper) installNavigationKeeper();
fetch(`${LOCAL_URL}/health`, {
headers: { 'X-Xuexitong-Token': LOCAL_TOKEN },
signal: AbortSignal.timeout(5000),
}).then((response) => {
if (!response.ok) throw new Error(`HTTP ${response.status}`);
console.log('DeepSeek 本地服务已连接');
if (typeof PAGE.jQuery === 'undefined') {
const script = document.createElement('script');
script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
script.type = 'text/javascript';
script.onload = function () {
console.log('jQuery loaded.');
waitForCoursePage();
};
script.onerror = () => console.error('jQuery 加载失败，脚本无法启动');
document.head.appendChild(script);
} else {
waitForCoursePage();
}
}).catch((error) => console.error('DeepSeek 本地服务不可用，请先启动服务并检查 Edge 本地网络权限:', error));

function installNavigationKeeper() {
let keeper;
try {
keeper = PAGE.open('', 'xuexitongConsoleKeeper', 'width=360,height=150');
if (!keeper) throw new Error('浏览器阻止了辅助窗口');
keeper.document.title = '学习通自动任务辅助窗口';
keeper.document.body.innerHTML = '<p style="font:16px sans-serif;padding:12px">学习通自动任务正在运行。请保持此窗口打开；课程页整页跳转后，它会重新启动脚本。</p>';
keeper.__xuexitongSource = `(${xuexitongMain.toString()})();`;
keeper.__xuexitongLastUrl = location.href;
keeper.__xuexitongLastInjectionAt = Date.now();
if (!keeper.__xuexitongKeeperTimer) {
keeper.eval(`window.__xuexitongKeeperTimer = setInterval(function () {
                    try {
                        var page = window.opener;
                        if (!page || page.closed) { clearInterval(window.__xuexitongKeeperTimer); window.close(); return; }
                        if (!/^https:\\/\\/([a-z0-9-]+\\.)*chaoxing\\.com\\/mycourse\\/studentstudy/i.test(page.location.href)) return;
                        if (page.location.href !== window.__xuexitongLastUrl) {
                            window.__xuexitongLastUrl = page.location.href;
                            window.__xuexitongLastInjectionAt = Date.now() - 30000;
                        }
                        if (page.document.readyState !== 'complete' || !page.document.querySelector('#coursetree')) return;
                        if (page.__xuexitongConsoleDeepSeek || page.__xuexitongConsoleDeepSeekBootTimer) return;
                        if (Date.now() - window.__xuexitongLastInjectionAt < 30000) return;
                        window.__xuexitongLastInjectionAt = Date.now();
                        page.__xuexitongAutoInjected = true;
                        page.eval(window.__xuexitongSource);
                    } catch (error) {
                        if (Date.now() - (window.__xuexitongLastErrorAt || 0) > 30000) {
                            window.__xuexitongLastErrorAt = Date.now();
                            window.document.body.textContent = '整页跳转后的自动恢复遇到错误：' + error.message;
                            console.warn('学习通整页跳转后的自动恢复暂不可用:', error);
                        }
                    }
                }, 1000);`);
}
keeper.blur();
PAGE.focus();
console.log('整页跳转辅助窗口已启动；请保持它打开');
} catch (error) {
console.warn('整页跳转后无法自动重新启动脚本；请允许此站点打开弹出窗口，或在新页面重新粘贴脚本。', error);
}
}
function waitForCoursePage() {
let attempts = 0;
const maxAttempts = 20;
PAGE[BOOT_TIMER_KEY] = setInterval(() => {
if ($('#coursetree').length > 0) {
clearInterval(PAGE[BOOT_TIMER_KEY]);
PAGE[BOOT_TIMER_KEY] = null;
initializePlayer();
return;
}
attempts++;
if (attempts >= maxAttempts) {
clearInterval(PAGE[BOOT_TIMER_KEY]);
PAGE[BOOT_TIMER_KEY] = null;
console.error('%c脚本启动超时：未检测到课程目录（#coursetree）。请确认当前处于课程播放页。', 'color:#F44336;font-weight:bold');
}
}, 1000);
}
function attachQuizAutomation(app) {
const attemptedQuizzes = new Set();
let quizBusy = false;
let stopped = false;
const originalDestroy = app.destroy.bind(app);
app.destroy = function () {
stopped = true;
originalDestroy();
};

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (el) => Boolean(el && el.isConnected && el.getClientRects().length &&
el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden');
const kindPattern = /[\[【](单选题|多选题|判断题)[\]】]/;

function courseDocuments() {
const result = [];
const visit = (doc, depth) => {
if (!doc || depth > 3 || result.includes(doc)) return;
result.push(doc);
for (const frame of doc.querySelectorAll('iframe')) {
try { visit(frame.contentDocument, depth + 1); } catch (_) { /* cross origin */ }
}
};
visit(document, 0);
return result;
}

function quizCompleted() {
const scoreShown = courseDocuments().some((doc) => {
const text = clean(doc.body?.innerText);
const hasGrade = /本次成绩\s*\d+(?:\.\d+)?\s*分/.test(text);
return hasGrade && (/章节测验\s*已完成/.test(text) || /我的答案\s*[:：]/.test(text));
});
if (scoreShown) return true;
const cardsFrame = Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"]'))
.find((frame) => frame.getClientRects().length > 0);
const isQuizStep = cardsFrame && new URL(cardsFrame.getAttribute('src'), location.href).searchParams.get('num') === '1';
return Boolean(isQuizStep && document.querySelector('.posCatalog_active .icon_Completed'));
}

function optionElements(card) {
const labels = Array.from(card.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
.filter((el) => /^[A-H]$/.test(clean(el.textContent)) &&
!Array.from(el.children).some((child) => /^[A-H]$/.test(clean(child.textContent))));
const found = new Map();
for (const label of labels) {
const letter = clean(label.textContent);
if (found.has(letter)) continue;
let target = label;
for (let n = 0; n < 5; n++) {
const parent = target.parentElement;
if (!parent || parent === card) break;
const otherLetters = Array.from(parent.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
.filter((el) => /^[A-H]$/.test(clean(el.textContent)) && el !== label);
if (otherLetters.some((el) => !el.contains(label) && !label.contains(el))) break;
target = parent;
if (clean(target.innerText).length > 1) break;
}
const text = clean(target.innerText).replace(new RegExp(`^${letter}[.、．]?\\s*`), '');
if (text) found.set(letter, { letter, text, element: target });
}
return Array.from(found.values()).sort((a, b) => a.letter.localeCompare(b.letter));
}

function extractQuestions() {
const questions = [];
for (const doc of courseDocuments()) {
const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
const seenCards = new Set();
let node;
while ((node = walker.nextNode())) {
const kind = clean(node.textContent).match(kindPattern)?.[1];
if (!kind || !visible(node.parentElement)) continue;
let card = node.parentElement;
let options = [];
for (let depth = 0; card && depth < 9; depth++, card = card.parentElement) {
const cardText = clean(card.innerText);
const kinds = cardText.match(new RegExp(kindPattern.source, 'g')) || [];
if (kinds.length > 1) break;
options = optionElements(card);
if (options.length >= 2 && options.length <= 8) break;
}
if (!card || options.length < 2 || options.length > 8 || seenCards.has(card)) continue;
seenCards.add(card);
const full = card.innerText || '';
const firstOption = full.search(/(?:^|\n)\s*A\s*(?:[.、．]|\S)/);
const title = clean(firstOption >= 0 ? full.slice(0, firstOption) :
(node.parentElement.innerText || full))
.replace(/^\d+\s*/, '').replace(kindPattern, '').trim();
if (!title || title.length > 500 || options.some((option) => !option.text || option.text.length > 500)) continue;
questions.push({ kind, title, options, card, doc });
}
}
return questions;
}

function findButton(doc, label) {
const candidates = Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],div,span'))
.filter((el) => visible(el) && clean(el.value || el.innerText) === label);
return candidates.find((el) => /^(BUTTON|A|INPUT)$/.test(el.tagName)) ||
candidates.find((el) => !Array.from(el.children).some((child) => clean(child.innerText) === label)) || null;
}

function findNextButton() {
for (const doc of courseDocuments()) {
const known = doc.querySelector('#prevNextFocusNext, #right1, .nextChapter');
if (visible(known) && clean(known.innerText || known.title).includes('下一节')) return known;
const generic = findButton(doc, '下一节');
if (generic) return generic;
}
return null;
}

async function revealQuizQuestions() {
const docs = courseDocuments();
const submit = docs.map((doc) => findButton(doc, '提交')).find(Boolean);
if (!submit) return;
let scroller = submit.parentElement;
while (scroller && scroller !== submit.ownerDocument.body) {
const style = scroller.ownerDocument.defaultView.getComputedStyle(scroller);
if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight + 100) break;
scroller = scroller.parentElement;
}
if (!scroller || scroller === submit.ownerDocument.body) {
scroller = submit.ownerDocument.scrollingElement;
}
if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 100) return;
scroller.scrollTop = 0;
await sleep(150);
for (let step = 0; step < 50; step++) {
const bottom = scroller.scrollHeight - scroller.clientHeight;
if (scroller.scrollTop >= bottom - 2) break;
scroller.scrollTop = Math.min(bottom, scroller.scrollTop + Math.max(300, scroller.clientHeight * 0.75));
await sleep(120);
}
}

function detectUnsupportedKinds(doc) {
const text = clean(doc?.body?.innerText || '');
const matches = text.match(/[\[【]([^\]】]{2,10}题)[\]】]/g) || [];
const unsupported = [];
for (const raw of matches) {
const kind = raw.slice(1, -1);
if (!['单选题', '多选题', '判断题'].includes(kind) && !unsupported.includes(kind)) {
unsupported.push(kind);
}
}
return unsupported;
}

async function waitForQuizQuestions() {
let submitDoc = null;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
if (quizCompleted()) return null;
submitDoc = courseDocuments().find((doc) => findButton(doc, '提交'));
if (submitDoc) break;
if (attempt > 0 && attempt % 30 === 0) console.log(`测验提交按钮仍在加载，已等待 ${attempt / 2} 秒`);
await sleep(500);
}
if (!submitDoc) throw new Error('进入章节测验后等待 120 秒，仍未找到“提交”按钮。请检查题目框架是否正常加载');

await revealQuizQuestions();
let previousSignature = '';
let stableCount = 0;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
if (quizCompleted()) return null;
const questions = extractQuestions();
const unsupportedKinds = detectUnsupportedKinds(submitDoc);
const countText = clean(submitDoc.body.innerText).match(/题量\s*[:：]\s*(\d+)/);
const expected = countText ? Number(countText[1]) : null;
const signature = questions.map((q) => `${q.kind}:${q.title}:${q.options.length}`).join('|') + '||' + unsupportedKinds.join(',');

if (unsupportedKinds.length > 0) {
stableCount = signature === previousSignature ? stableCount + 1 : 0;
previousSignature = signature;
if (stableCount >= 3) {
return { mode: 'partial', questions, unsupportedKinds };
}
} else if (questions.length && (!expected || questions.length === expected)) {
stableCount = signature === previousSignature ? stableCount + 1 : 0;
previousSignature = signature;
if (stableCount >= 3) {
return { mode: 'full', questions, unsupportedKinds: [] };
}
} else {
stableCount = 0;
previousSignature = '';
}
if (attempt > 0 && attempt % 30 === 0) console.log(`测验题目仍在加载，已等待 ${attempt / 2} 秒；当前识别 ${questions.length} 道客观题`);
await sleep(500);
}
throw new Error('测验框架已打开，但等待 120 秒仍未识别完整题目。可运行 app.inspectQuiz() 查看当前识别结果');
}

async function askDeepSeek(questions) {
const payload = questions.map((q, i) => ({
id: i + 1,
type: q.kind,
question: q.title,
options: q.options.map((o) => ({ letter: o.letter, text: o.text })),
}));
console.log('以下是本次发送给 DeepSeek 的题干和选项：', payload);
let response;
try {
response = await fetch(`${LOCAL_URL}/answer`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'X-Xuexitong-Token': LOCAL_TOKEN },
body: JSON.stringify({ questions: payload }),
signal: AbortSignal.timeout(900000),
});
} catch (error) {
throw new Error(`无法连接本地 DeepSeek 服务。请确认启动窗口仍在运行，且 Edge 允许本地网络访问。详情：${error.message}`);
}
const data = await response.json().catch(() => null);
if (!response.ok) throw new Error(data?.error || `本地 DeepSeek 服务返回 HTTP ${response.status}`);
return data.answers;
}

function validateAnswers(questions, answers) {
if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('AI 返回的题目数量不匹配');
const result = new Map();
for (const item of answers) {
if (!Number.isInteger(item.id) || result.has(item.id) || !Array.isArray(item.letters))
throw new Error('AI 答案格式错误');
const q = questions[item.id - 1];
if (!q) throw new Error('AI 返回未知题号');
const letters = item.letters.map((letter) => clean(letter).toUpperCase());
if (!letters.length) throw new Error(`第 ${item.id} 题 AI 未给出选项，已停止提交`);
if (new Set(letters).size !== letters.length) throw new Error(`第 ${item.id} 题答案包含重复选项，已停止提交`);
if (q.kind !== '多选题' && letters.length !== 1)
throw new Error(`第 ${item.id} 题是${q.kind}，但 AI 返回了 ${letters.length} 个选项，已停止提交`);
const invalidLetters = letters.filter((letter) => !q.options.some((option) => option.letter === letter));
if (invalidLetters.length)
throw new Error(`第 ${item.id} 题 AI 返回了页面中不存在的选项：${invalidLetters.join('、')}，已停止提交`);
result.set(item.id, letters);
}
return result;
}

async function selectAnswers(questions, answers) {
for (let i = 0; i < questions.length; i++) {
const q = questions[i];
for (const letter of answers.get(i + 1)) {
if (stopped) throw new Error('脚本已停止');
const option = q.options.find((item) => item.letter === letter);
if (!option?.element?.isConnected) throw new Error(`第 ${i + 1} 题选项已变化`);
option.element.scrollIntoView({ block: 'center' });
const before = q.card.outerHTML;
option.element.click();
await sleep(150);
const after = q.card.outerHTML;
const input = option.element.matches('input') ? option.element : option.element.querySelector('input');
const checked = input?.checked || option.element.getAttribute('aria-checked') === 'true';
if (before === after && !checked) throw new Error(`第 ${i + 1} 题 ${letter} 选项未确认选中，已停止提交`);
}
}
}

async function confirmSubmitDialog() {
for (let i = 0; i < 20; i++) {
if (stopped) throw new Error('脚本已停止');
const dialogs = courseDocuments().flatMap((doc) =>
Array.from(doc.querySelectorAll('#popok,[role="dialog"],[role="alertdialog"],.layui-layer-dialog,.el-message-box,.modal')));
const platformButton = dialogs.find((el) => el.id === 'popok' && visible(el));
if (platformButton) {
const message = clean(platformButton.ownerDocument.querySelector('#popcontent')?.innerText);
if (/未作答|请选择|请作答|答完/.test(message) && !/确定提交|确认提交/.test(message))
throw new Error(`平台拒绝提交：${message}`);
console.log(`确认平台提交窗口：${message || '提交'}`);
platformButton.click();
return;
}
const dialog = dialogs.find((el) => el.id !== 'popok' && visible(el) && /提交|交卷/.test(clean(el.innerText)));
if (dialog) {
const confirm = findButton(dialog, '确定') || findButton(dialog, '确认') || findButton(dialog, '提交');
if (!confirm) throw new Error('提交确认窗口未找到确认按钮');
confirm.click();
return;
}
await sleep(250);
}
}

async function submitQuiz(doc) {
if (stopped) throw new Error('脚本已停止');
const submit = findButton(doc, '提交');
if (!submit) throw new Error('未找到测验提交按钮');
submit.scrollIntoView({ block: 'center' });
console.log('选项已选择，点击章节测验的提交按钮');
submit.click();
await confirmSubmitDialog();
console.log('提交已确认，等待学习通生成成绩或任务完成标记；确认后再点击“下一节”');
let elapsedHalfSeconds = 0;
while (!stopped) {
await sleep(500);
elapsedHalfSeconds++;
if (quizCompleted()) return;
if (elapsedHalfSeconds % 30 === 0) console.log(`成绩页仍在加载，已等待 ${elapsedHalfSeconds / 2} 秒`);
}
throw new Error('脚本已停止');
}

async function goToNextStep() {
if (stopped) throw new Error('脚本已停止');
const next = findNextButton();
if (!next) throw new Error('未找到页面下方的“下一节”按钮');
const previousStep = app._currentStepTitle();
app._clearCheckInterval();
app._videoEl = null;
app._isPlaying = false;
next.scrollIntoView({ block: 'center' });
console.log(`${previousStep || '当前学习步骤'}完成，点击页面“下一节”，等待新内容加载`);
next.click();
let currentStep = '';
let stepReady = false;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
await sleep(500);
currentStep = app._currentStepTitle();
if (currentStep !== previousStep && currentStep === '章节测验') {
stepReady = true;
break;
}
if (currentStep !== previousStep && currentStep === '视频') {
app._videoEl = null;
if (app._getVideoEl()) {
stepReady = true;
break;
}
}
if (attempt > 0 && attempt % 30 === 0) console.log(`下一学习步骤仍在加载，已等待 ${attempt / 2} 秒；当前页签：${currentStep || '未显示'}`);
}
if (!stepReady) {
throw new Error(`点击“下一节”后等待 120 秒，新学习步骤仍未加载完成；当前页签：${currentStep || '未显示'}`);
}
app._videoEl = null;
app._initCellData();
app.play();
}

app.goToNextStep = goToNextStep;
app.inspectQuiz = function () {
return extractQuestions().map((q, i) => ({
id: i + 1, type: q.kind, question: q.title,
options: q.options.map((o) => `${o.letter}. ${o.text}`),
}));
};

app.runAutoQuiz = function () {
if (stopped || quizBusy) return Promise.resolve();
quizBusy = true;
return (async () => {
if (quizCompleted()) {
console.log('检测到当前章节测验已完成，推进至下一节点');
await app.nextUnit();
return;
}
console.log('已进入章节测验，等待题目和提交按钮加载');
const quizResult = await waitForQuizQuestions();
if (quizResult === null) {
console.log('检测到当前章节测验已完成，推进至下一节点');
await app.nextUnit();
return;
}
const { mode, questions, unsupportedKinds } = quizResult;

if (mode === 'partial') {
if (questions.length > 0) {
if (questions.length > 30) throw new Error('客观题数量超过 30，已停止自动作答');
const docs = new Set(questions.map((q) => q.doc));
if (docs.size !== 1) throw new Error('题目跨多个框架，已停止自动作答');
const signature = questions.map((q) => `${q.kind}:${q.title}`).join('|');
if (!attemptedQuizzes.has(signature)) {
console.log(`[情况2] 检测到混合题型（含 ${unsupportedKinds.join('、')}），先调用 DeepSeek 完成 ${questions.length} 道客观题（不提交）`);
const answers = validateAnswers(questions, await askDeepSeek(questions));
console.table(questions.map((q, i) => ({ 题号: i + 1, 题型: q.kind, 选择: answers.get(i + 1).join('') })));
await selectAnswers(questions, answers);
attemptedQuizzes.add(signature);
}
console.warn(`%c[情况2] 已完成 ${questions.length} 道客观题勾选，跳过 ${unsupportedKinds.join('、')} 且未提交答案，继续跳转到下一节等待人工处理`, 'color:#FF9800;font-weight:bold');
} else {
console.warn(`%c[情况2] 当前测验仅含非客观题（${unsupportedKinds.join('、')}），跳过不提交，继续跳转到下一节等待人工处理`, 'color:#FF9800;font-weight:bold');
}
quizBusy = false;
await app.nextUnit();
return;
}

if (questions.length > 30) throw new Error('题目数量超过 30，已停止自动提交');
const docs = new Set(questions.map((q) => q.doc));
if (docs.size !== 1) throw new Error('题目跨多个框架，已停止自动提交');
const countText = clean(questions[0].doc.body.innerText).match(/题量\s*[:：]\s*(\d+)/);
if (countText && Number(countText[1]) !== questions.length)
throw new Error(`页面显示 ${countText[1]} 道题，脚本只识别 ${questions.length} 道，已停止提交`);
const signature = questions.map((q) => `${q.kind}:${q.title}`).join('|');
if (attemptedQuizzes.has(signature)) throw new Error('本次测验已尝试过，已停止重复提交');
console.log(`[情况1] 全为客观题（共 ${questions.length} 道），正在调用 DeepSeek 完成并提交`);
const answers = validateAnswers(questions, await askDeepSeek(questions));
console.table(questions.map((q, i) => ({ 题号: i + 1, 题型: q.kind, 选择: answers.get(i + 1).join('') })));
await selectAnswers(questions, answers);
attemptedQuizzes.add(signature);
await submitQuiz(questions[0].doc);
console.log('章节测验提交已确认，推进至下一节点');
quizBusy = false;
await app.nextUnit();
})().catch((error) => {
console.error('章节测验自动作答停止:', error);
})
.finally(() => { quizBusy = false; });
};

}
function initializePlayer() {
const STATE = Object.freeze({
IDLE: 'IDLE',
LOADING_NODE: 'LOADING_NODE',
PLAYING_VIDEO: 'PLAYING_VIDEO',
WAITING_DOCUMENT: 'WAITING_DOCUMENT',
PAUSED_MANUAL: 'PAUSED_MANUAL',
ADVANCING: 'ADVANCING',
COMPLETED: 'COMPLETED',
ERROR: 'ERROR',
DESTROYED: 'DESTROYED',
});

const app = {
STATES: STATE,
configs: {
autoplay: true,
playbackRate: 1,
nonDraggablePlaybackRate: 2,
enableSeekableSkip: true,
seekTailSeconds: 3,
retryInterval: 2000,
maxRetries: 10,
videoCheckInterval: 1000,
guardNoProgressMs: 7000,
guardResumeCooldownMs: 1500,
noVideoDelayMs: 5000,
nodeLoadTimeoutMs: 10000,
nodeSettleMs: 1500,
autoAdvanceNoVideo: true,
pauseOnAssessment: false, // 设为 true 则遇到任何测验直接暂停，不自动调用 DeepSeek
},
_state: STATE.IDLE,
_runEpoch: 0,
_abortController: null,
_activeTimers: new Set(),
_activePlayPromise: null,
_transitionPromise: null,
_unitQueue: [],
_currentQueueIndex: -1,
_videoEl: null,
_activeTargetRate: null,
_speedFallbackApplied: false,
_highRatePauseCount: 0,
_treeContainerEl: null,
_isPlaying: false,
_currentRetryCount: 0,
_checkInterval: null,
_eventVideoEl: null,
_boundVideoHandlers: null,
_nextUnitPending: false,
_chapterAdvanceTimes: 0,
_cellData: {
cells: 0,
nCells: 0,
currentCellIndex: 0,
currentNCellIndex: 0,
currentGlobalIndex: -1,
currentVideoTitle: "",
},
get state() {
return this._state;
},
get cellData() {
return this._cellData;
},

_setState(nextState, reason = '') {
if (this._state === STATE.DESTROYED && nextState !== STATE.DESTROYED) {
return false;
}
const prevState = this._state;
if (prevState === nextState) return true;
this._state = nextState;
const suffix = reason ? ` (${reason})` : '';
console.log(`%c[FSM] ${prevState} -> ${nextState}${suffix}`, 'color:#607D8B');
return true;
},

_beginNewEpoch(reason = '') {
this._runEpoch += 1;
if (this._abortController) {
try { this._abortController.abort(reason || 'epoch_superseded'); } catch (_) {}
}
this._abortController = new AbortController();
this._clearAllTimers();
this._clearCheckInterval();
this._detachVideoEvents();
this._isPlaying = false;
this._videoEl = null;
this._activeTargetRate = null;
this._speedFallbackApplied = false;
this._highRatePauseCount = 0;
return {
epoch: this._runEpoch,
signal: this._abortController.signal,
};
},

_isEpochActive(epoch, signal) {
return (
this._state !== STATE.DESTROYED &&
epoch === this._runEpoch &&
(!signal || !signal.aborted)
);
},

_clearAllTimers() {
for (const timerId of this._activeTimers) {
clearTimeout(timerId);
}
this._activeTimers.clear();
if (this._delayedNextUnitTimer) {
clearTimeout(this._delayedNextUnitTimer);
this._delayedNextUnitTimer = null;
}
},

_sleep(ms, signal) {
return new Promise((resolve, reject) => {
if (signal?.aborted) {
reject(new DOMException('Aborted', 'AbortError'));
return;
}
const timerId = setTimeout(() => {
this._activeTimers.delete(timerId);
if (signal) signal.removeEventListener('abort', onAbort);
resolve();
}, ms);
this._activeTimers.add(timerId);
const onAbort = () => {
clearTimeout(timerId);
this._activeTimers.delete(timerId);
reject(new DOMException('Aborted', 'AbortError'));
};
if (signal) signal.addEventListener('abort', onAbort, { once: true });
});
},

_isAbortError(error) {
return Boolean(error && (error.name === 'AbortError' || error.message === 'Aborted'));
},

run() {
console.log("%c=== 学习通视频与章节测验助手 V4 (状态机版) 启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
this._nextUnitPending = false;
this._chapterAdvanceTimes = 0;
this._tryTimes = 0;
this._getTreeContainer();
this._buildUnitQueue();
this._initCellData();
console.log(`当前学习步骤：${this._currentStepTitle() || '等待页面加载'}`);
this._bindStepNavigation();
return this.play();
},

resume() {
if (this._state === STATE.DESTROYED) {
console.warn('实例已销毁，请重新执行 app.run()');
return Promise.resolve();
}
if (this._state !== STATE.PAUSED_MANUAL && this._state !== STATE.ERROR) {
console.log(`当前状态为 ${this._state}，无需恢复`);
return Promise.resolve();
}
console.log('%c[FSM] 人工确认恢复自动化巡检，推进至下一节点...', 'color:#2196F3;font-weight:bold');
return this.nextUnit();
},

async nextUnit() {
if (this._state === STATE.DESTROYED) return;
if (this._transitionPromise) {
console.warn('%c已有节点切换正在进行，复用当前切换 Promise 防止重复触发', 'color:#FF9800');
return this._transitionPromise;
}

this._nextUnitPending = true;
const { epoch, signal } = this._beginNewEpoch('nextUnit');
this._setState(STATE.ADVANCING, '准备切换下一节点');
console.log("%c=== 准备切换到下一小节 ===", "color:#2196F3;font-size:14px");

this._transitionPromise = (async () => {
try {
const queue = this._buildUnitQueue();
if (!queue.length) {
throw new Error('课程目录队列为空');
}
this._syncCurrentQueueIndex(queue);
const nextGlobalIndex = this._currentQueueIndex + 1;
if (nextGlobalIndex >= queue.length) {
this._setState(STATE.COMPLETED, '所有目录节点遍历完成');
console.log("%c=====================================", "color:#4CAF50;font-size:16px");
console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
console.log("%c=====================================", "color:#4CAF50;font-size:16px");
return;
}

const targetNode = queue[nextGlobalIndex];
this._currentQueueIndex = nextGlobalIndex;
this._cellData.currentCellIndex = targetNode.chapterIndex;
this._cellData.currentNCellIndex = targetNode.unitIndex;
this._cellData.currentGlobalIndex = targetNode.globalIndex;
this._cellData.currentVideoTitle = targetNode.title;

console.log(
`%c顺序推进节点 [${nextGlobalIndex + 1}/${queue.length}] (第${targetNode.chapterIndex + 1}章第${targetNode.unitIndex + 1}节): ${targetNode.title}`,
"color:#FF9800"
);

await this.playCurrentIndex(targetNode.element, epoch, signal);
} catch (error) {
if (!this._isAbortError(error)) {
this._setState(STATE.ERROR, error.message);
console.error('切换下一小节失败:', error);
}
} finally {
this._nextUnitPending = false;
this._transitionPromise = null;
}
})();

return this._transitionPromise;
},

_clearCheckInterval() {
if (this._checkInterval) {
clearInterval(this._checkInterval);
this._checkInterval = null;
}
},

_startVideoMonitoring(epoch, signal) {
this._clearCheckInterval();
this._guardLastTime = 0;
this._guardLastWallTs = 0;
this._guardLastResumeTs = 0;
this._checkInterval = setInterval(() => {
if (!this._isEpochActive(epoch, signal) || this._state !== STATE.PLAYING_VIDEO) {
this._clearCheckInterval();
return;
}
this._checkVideoStatus(epoch, signal);
}, this.configs.videoCheckInterval);
},

_applyPlaybackRate(video, overrideRate) {
if (!video) return;
const raw = Number(overrideRate ?? this._activeTargetRate ?? this.configs.playbackRate);
if (!Number.isFinite(raw) || raw <= 0) return;
const clamped = Math.min(16, Math.max(0.25, raw));
if (clamped !== raw) {
console.warn(`[倍速限制] 配置的倍速 ${raw}x 超出浏览器支持范围 (0.25x-16x)，已自动限制为 ${clamped}x`);
}
try {
video.playbackRate = clamped;
} catch (err) {
console.warn('设置视频倍速失败，保持默认倍速:', err);
}
},

_isDoubleSpeedAllowed(video) {
try {
const doc = video?.ownerDocument;
const frameEl = doc?.defaultView?.frameElement;
const frameData = frameEl?.getAttribute('data') || '';
if (/"doublespeed"\s*:\s*(0|false|"0"|"false")/i.test(frameData)) {
return false;
}
if (frameEl?.getAttribute('doublespeed') === '0' || frameEl?.getAttribute('doublespeed') === 'false') {
return false;
}
const rateBtn = doc?.querySelector('.vjs-playback-rate');
if (rateBtn) {
const style = doc.defaultView?.getComputedStyle(rateBtn);
if (style?.display === 'none' || style?.visibility === 'hidden' || rateBtn.classList.contains('vjs-hidden')) {
return false;
}
}
} catch (_) {}
return true;
},

_fallbackToNormalSpeed(video, reason = '') {
if (!video) return;
this._speedFallbackApplied = true;
this._activeTargetRate = 1;
this._highRatePauseCount = 0;
try {
video.playbackRate = 1;
} catch (_) {}
const suffix = reason ? ` (${reason})` : '';
console.warn(`%c[模式C: 不可倍速视频] 检测到当前视频禁止倍速${suffix}，已自动恢复为 1x 正常播放`, 'color:#FF9800;font-weight:bold');
},

async _detectVideoSeekable(video, epoch, signal) {
const waitDeadline = Date.now() + 5000;
while (this._isEpochActive(epoch, signal) && (!Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < 1)) {
if (Date.now() >= waitDeadline) break;
await this._sleep(250, signal);
}
if (!this._isEpochActive(epoch, signal)) return false;

try {
const doc = video.ownerDocument;
const progressCtrl = doc?.querySelector('.vjs-progress-control');
if (progressCtrl) {
const style = doc.defaultView?.getComputedStyle(progressCtrl);
if (style?.pointerEvents === 'none' || progressCtrl.classList.contains('vjs-disabled')) {
return false;
}
}
const frameEl = doc?.defaultView?.frameElement;
const frameData = frameEl?.getAttribute('data') || '';
if (/"fastforward"\s*:\s*false/i.test(frameData) || frameEl?.getAttribute('fastforward') === 'false') {
return false;
}
} catch (_) {}

if (!Number.isFinite(video.duration) || video.duration <= 8) {
return false;
}

const t0 = Number(video.currentTime || 0);
if (t0 >= video.duration - 5) {
return true;
}

try {
video.currentTime = t0 + 3;
await this._sleep(700, signal);
if (!this._isEpochActive(epoch, signal)) return false;
const t1 = Number(video.currentTime || 0);
return t1 >= t0 + 2;
} catch (_) {
return false;
}
},
_tryResumePlayback(reason) {
const now = Date.now();
if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
return;
}
this._guardLastResumeTs = now;
const video = this._getVideoEl();
if (!video || !this._isPlaying || this._state !== STATE.PLAYING_VIDEO) return;
if ((reason === 'paused' || reason === 'no-progress') && Number(this._activeTargetRate) > 1 && !this._speedFallbackApplied) {
this._highRatePauseCount += 1;
if (this._highRatePauseCount >= 2 || Number(video.playbackRate) === 1) {
this._fallbackToNormalSpeed(video, '倍速触发播放器拦截');
}
}
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
this._applyPlaybackRate(video);
console.log(`%c触发视频保活恢复(${reason})`, "color:#607D8B");
video.play().catch((e) => {
console.warn("直接恢复播放失败，尝试静音恢复:", e);
video.muted = true;
if (Number(this._activeTargetRate) > 1 && !this._speedFallbackApplied) {
this._fallbackToNormalSpeed(video, '倍速恢复失败');
}
video.play().catch((err) => {
console.error("静音恢复播放失败:", err);
});
});
},

_checkVideoStatus(epoch, signal) {
try {
if (!this._isEpochActive(epoch, signal) || this._state !== STATE.PLAYING_VIDEO) return;
const video = this._getVideoEl();
if (!video) return;
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
if (video.ended) {
// 由 _waitForVideoEnded 统一监听 ended 事件并驱动 nextUnit()，此处不再重复调用 nextUnit()
return;
}
if (video.paused && this._isPlaying) {
console.log("%c检测到视频暂停，尝试恢复播放...", "color:#FF5722");
this._tryResumePlayback("paused");
} else if (this._isPlaying) {
const now = Date.now();
const current = Number(video.currentTime || 0);
if (this._guardLastWallTs === 0) {
this._guardLastWallTs = now;
this._guardLastTime = current;
} else {
const stalled = Math.abs(current - this._guardLastTime) < 0.01;
const stalledMs = now - this._guardLastWallTs;
if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
this._tryResumePlayback("no-progress");
this._guardLastWallTs = now;
this._guardLastTime = Number(video.currentTime || 0);
} else if (!stalled) {
this._guardLastWallTs = now;
this._guardLastTime = current;
}
}
}
} catch (e) {
console.error("视频状态检查失败:", e);
}
},

_tryTimes: 0,
_stepAdvanceTimes: 0,
_stepSwitchAt: 0,
_stepSwitchPending: false,
_delayedNextUnitTimer: null,
_guardLastTime: 0,
_guardLastWallTs: 0,
_guardLastResumeTs: 0,

_collectCourseDocuments() {
const docs = [];
const visit = (doc, depth) => {
if (!doc || depth > 3 || docs.includes(doc)) return;
docs.push(doc);
for (const frame of doc.querySelectorAll('iframe')) {
try {
if (frame.contentDocument) visit(frame.contentDocument, depth + 1);
} catch (_) { /* cross-origin */ }
}
};
visit(document, 0);
return docs;
},

_isAssessmentNode() {
if (this._isChapterTest()) return true;
const docs = this._collectCourseDocuments();
for (const doc of docs) {
const bodyText = (doc.body?.innerText || '').replace(/\s+/g, ' ').trim();
if (/[\[【](单选题|多选题|判断题)[\]】]/.test(bodyText)) return true;
if (/题量\s*[:：]\s*\d+/.test(bodyText) && /提交|交卷/.test(bodyText)) return true;
if (/本次成绩\s*\d+(?:\.\d+)?\s*分/.test(bodyText) && /章节测验/.test(bodyText)) return true;
}
return false;
},

_hasLoadedDocumentContent() {
const cardsFrame = Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"]'))
.find((frame) => frame.getClientRects().length > 0);
if (cardsFrame) {
try {
const doc = cardsFrame.contentDocument;
if (doc && doc.readyState === 'complete' && doc.body) {
const hasContent = Boolean(
doc.querySelector('.ans-attach-ct, .ans-cc, iframe, object, embed, img, p') ||
(doc.body.innerText || '').trim().length > 0
);
if (hasContent) return true;
}
} catch (_) { /* cross-origin */ }
}
return this._collectCourseDocuments().some((doc) => {
if (doc === document || doc.readyState !== 'complete' || !doc.body) return false;
return Boolean(doc.querySelector('.ans-attach-ct, .ans-cc, canvas, embed, object') || (doc.body.innerText || '').trim().length > 20);
});
},

async _detectNodeContentType(epoch, signal) {
const deadline = Date.now() + this.configs.nodeLoadTimeoutMs;
let docStableSince = 0;

while (this._isEpochActive(epoch, signal)) {
if (this._isAssessmentNode()) {
return { type: 'assessment' };
}
this._videoEl = null;
const video = this._getVideoEl();
if (video) {
return { type: 'video', video };
}
if (this._currentStepTitle() !== '视频' && this._advanceLearningStep()) {
console.log("%c当前不在视频页签，已尝试切到“视频”页签等待加载", "color:#607D8B");
await this._sleep(1500, signal);
docStableSince = 0;
continue;
}
if (this._hasLoadedDocumentContent()) {
if (!docStableSince) docStableSince = Date.now();
if (Date.now() - docStableSince >= this.configs.nodeSettleMs) {
return { type: 'document' };
}
} else {
docStableSince = 0;
}
if (Date.now() >= deadline) {
return { type: 'document' };
}
await this._sleep(400, signal);
}
throw new DOMException('Aborted', 'AbortError');
},

_waitForVideoEnded(video, epoch, signal) {
return new Promise((resolve, reject) => {
if (!this._isEpochActive(epoch, signal)) {
reject(new DOMException('Aborted', 'AbortError'));
return;
}
if (video.ended) {
resolve();
return;
}

let settled = false;
const cleanup = () => {
video.removeEventListener('ended', onEnded);
video.removeEventListener('error', onError);
if (signal) signal.removeEventListener('abort', onAbort);
};
const onEnded = () => {
if (settled) return;
settled = true;
cleanup();
resolve();
};
const onError = (err) => {
if (settled) return;
settled = true;
cleanup();
reject(err instanceof Error ? err : new Error('媒体播放过程中发生错误'));
};
const onAbort = () => {
if (settled) return;
settled = true;
cleanup();
reject(new DOMException('Aborted', 'AbortError'));
};

video.addEventListener('ended', onEnded, { once: true });
video.addEventListener('error', onError, { once: true });
if (signal) signal.addEventListener('abort', onAbort, { once: true });
});
},

async play() {
if (this._state === STATE.DESTROYED) return;
if (this._state === STATE.ADVANCING && this._transitionPromise) {
return this._transitionPromise;
}
if (this._activePlayPromise && (this._state === STATE.LOADING_NODE || this._state === STATE.PLAYING_VIDEO || this._state === STATE.WAITING_DOCUMENT)) {
console.warn(`%c当前节点正在执行中 (${this._state})，忽略重复 play() 调用`, 'color:#FF9800');
return this._activePlayPromise;
}

const { epoch, signal } = this._beginNewEpoch('play');
this._setState(STATE.LOADING_NODE, '检测当前节点内容类型');

this._activePlayPromise = (async () => {
try {
const detected = await this._detectNodeContentType(epoch, signal);
if (!this._isEpochActive(epoch, signal)) return;

if (detected.type === 'assessment') {
this._setState(STATE.PAUSED_MANUAL, '遇到考核/测验节点');
this._clearCheckInterval();
this._isPlaying = false;
if (this.configs.pauseOnAssessment) {
console.warn(
'%c[暂停] 检测到考核/测验类型节点，已暂停自动化流转并交由人工处理。完成作答后可执行 app.resume() 或 app.nextUnit() 继续遍历。',
'color:#FF9800;font-weight:bold'
);
return;
}
if (typeof this.runAutoQuiz === 'function') {
await this.runAutoQuiz();
}
return;
}

if (detected.type === 'video') {
const el = detected.video;
this._videoEl = el;
this._videoEventHandle();
el.muted = true;
el.defaultMuted = true;
el.volume = 0;
this._applyPlaybackRate(el);

this._setState(STATE.PLAYING_VIDEO, this._cellData.currentVideoTitle || '视频节点');
this._isPlaying = true;
const endedPromise = this._waitForVideoEnded(el, epoch, signal);

try {
await el.play();
} catch (playError) {
console.warn('首次播放触发受限，尝试静音兜底播放:', playError);
el.muted = true;
el.defaultMuted = true;
el.volume = 0;
await el.play();
}

if (!this._isEpochActive(epoch, signal)) return;
this._tryTimes = 0;
this._startVideoMonitoring(epoch, signal);

const isSeekable = await this._detectVideoSeekable(el, epoch, signal);
if (!this._isEpochActive(epoch, signal)) return;

if (isSeekable && this.configs.enableSeekableSkip) {
const tailSec = Math.max(1, Number(this.configs.seekTailSeconds) || 3);
const targetTime = el.duration > tailSec + 1 ? Math.max(0, el.duration - tailSec) : el.duration * 0.95;
console.log(`%c[模式A: 可拖拽视频] 检测到允许拖动进度条，跳转至 ${targetTime.toFixed(1)}s / ${el.duration.toFixed(1)}s 等待完成上报`, 'color:#4CAF50;font-weight:bold');
try {
el.currentTime = targetTime;
} catch (seekErr) {
console.warn('跳转进度失败，回退为正常播放:', seekErr);
}
} else if (!this._isDoubleSpeedAllowed(el)) {
this._fallbackToNormalSpeed(el, '页面禁用倍速选项');
if (el.paused) {
await el.play().catch(() => {});
}
} else {
const targetRate = Number(this.configs.nonDraggablePlaybackRate) || 2;
this._activeTargetRate = targetRate;
this._applyPlaybackRate(el, targetRate);
console.log(`%c[模式B: 不可拖拽视频] 检测到禁止拖动进度条，尝试切换为 ${el.playbackRate}x 倍速播放...`, 'color:#2196F3;font-weight:bold');
await this._sleep(1500, signal);
if (!this._isEpochActive(epoch, signal)) return;
if (!el.ended && (el.paused || Math.abs(Number(el.playbackRate) - 1) < 0.05)) {
this._fallbackToNormalSpeed(el, el.paused ? '倍速导致视频暂停' : '播放器重置为1x');
await el.play().catch(() => {});
}
}

await endedPromise;
if (!this._isEpochActive(epoch, signal)) return;

this._isPlaying = false;
this._clearCheckInterval();
console.warn(`%c============'${this._cellData.currentVideoTitle}' 播放完成，准备推进下一节点=============`, "color:#4CAF50;font-weight:bold");
await this._sleep(1000, signal);
if (!this._isEpochActive(epoch, signal)) return;
this._activePlayPromise = null;
await this.nextUnit();
return;
}

// 普通文档 / PPT 内容（无视频元素）
this._isPlaying = false;
this._clearCheckInterval();
if (!this.configs.autoAdvanceNoVideo) {
this._setState(STATE.PAUSED_MANUAL, '非视频节点且未开启自动推进');
console.warn('%c当前小节未发现视频，已安全停止。确认无需完成课件后，可执行 app.nextUnit()。', 'color:#FF9800');
return;
}

const delayMs = Math.max(0, Number(this.configs.noVideoDelayMs) || 5000);
this._setState(STATE.WAITING_DOCUMENT, `文档/PPT节点延时 ${delayMs}ms`);
console.log(`%c当前节点为普通文档/PPT内容（无视频），启动 ${delayMs}ms 延时器...`, 'color:#2196F3');
await this._sleep(delayMs, signal);
if (!this._isEpochActive(epoch, signal)) return;

console.log('%c文档/PPT延时结束，自动执行 nextUnit()', 'color:#4CAF50');
this._activePlayPromise = null;
await this.nextUnit();
} catch (e) {
if (this._isAbortError(e)) return;
this._isPlaying = false;
this._clearCheckInterval();
if (this._tryTimes >= this.configs.maxRetries) {
this._setState(STATE.ERROR, '达到最大重试次数');
console.error("%c节点执行失败，已达到最大重试次数", "color:#F44336;font-weight:bold", e);
return;
}
this._tryTimes++;
console.log(`%c节点执行失败，${this.configs.retryInterval / 1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, "color:#FF9800", e);
try {
await this._sleep(this.configs.retryInterval, signal);
if (this._isEpochActive(epoch, signal)) {
this._activePlayPromise = null;
await this.play();
}
} catch (abortErr) {
if (!this._isAbortError(abortErr)) throw abortErr;
}
} finally {
if (this._isEpochActive(epoch, signal)) {
this._activePlayPromise = null;
}
}
})();

return this._activePlayPromise;
},

_advanceLearningStep() {
if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) {
return false;
}
const currentStepTitle = this._currentStepTitle();

if (currentStepTitle === "章节测验" || currentStepTitle === "视频") {
return false;
}
const clickElement = (el, label) => {
if (!el) return false;
this._stepSwitchPending = true;
this._stepSwitchAt = Date.now();
console.log(`%c尝试点击${label}`, "color:#2196F3");
el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
return true;
};
const videoTab = $(".prev_white:visible").filter((_, el) => {
const text = ($(el).text() || "").replace(/\s+/g, "");
return text === "2视频" || text === "视频";
}).get(0);
if (clickElement(videoTab, "“视频”页签")) {
return true;
}
return false;
},

_currentStepTitle() {
const cardsFrame = Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"]'))
.find((frame) => frame.getClientRects().length > 0);
if (cardsFrame) {
const num = new URL(cardsFrame.getAttribute('src'), location.href).searchParams.get('num');
if (num === '0') return '视频';
if (num === '1') return '章节测验';
}
const prevTitle = document.getElementsByClassName('prev_title')[0];
const text = prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
return text === '视频' || text === '章节测验' ? text : '';
},

_isChapterTest() {
return this._currentStepTitle() === '章节测验';
},

_advanceChapterTest() {
this._setState(STATE.PAUSED_MANUAL, '章节测验暂停');
console.warn('%c检测到章节测验节点，已暂停自动化流转，交由人工处理。', 'color:#FF9800;font-weight:bold');
},

_bindStepNavigation() {
if (this._stepNavigationBound) {
return;
}
this._stepNavigationBound = true;
const reenterVideoMode = () => {
this._stepSwitchPending = true;
this._stepSwitchAt = Date.now();
setTimeout(() => {
if (this._state === STATE.DESTROYED || this._state === STATE.ADVANCING) return;
try {
this._buildUnitQueue();
this._initCellData();
} catch (e) {}
this.play();
}, 1800);
};
$(document).off('click.xuexitongPlayerV4', '.prev_white').on('click.xuexitongPlayerV4', '.prev_white', (e) => {
const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
if (text.includes("视频") || text.includes("章节测验")) {
console.log(`%c检测到步骤切换点击：${text}，准备重新识别页面`, "color:#607D8B");
reenterVideoMode();
}
});
},

_handlePlayError(error) {
console.error("播放错误详情:", error);
},

async playCurrentIndex(nCell, parentEpoch, parentSignal) {
if (!nCell) {
const queue = this._buildUnitQueue();
const target = queue[this._currentQueueIndex] || queue[0];
nCell = target?.element;
}
const $nCell = $(nCell);
const clickableSpan = $nCell.find(".posCatalog_name")[0];
if (!clickableSpan) {
throw new Error("找不到可点击的课程节点，切换下一节点失败");
}
const targetTitle = $(clickableSpan).attr('title') || $(clickableSpan).text().trim() || '未知标题';
console.log(`%c点击切换到: ${targetTitle}`, "color:#2196F3");
$(clickableSpan).click();
this._videoEl = null;
this._isPlaying = false;
console.log("%c等待新节点页面加载...", "color:#FF9800");

const waitSignal = parentSignal || this._abortController?.signal;
await this._sleep(2500, waitSignal);
if (parentEpoch !== undefined && !this._isEpochActive(parentEpoch, waitSignal)) {
return;
}
this._buildUnitQueue();
this._initCellData();
this._transitionPromise = null;
this._nextUnitPending = false;
if (this.configs.autoplay) {
await this.play();
}
},

_buildUnitQueue() {
const el = this._getTreeContainer();
const cells = el.children("ul").children("li");
const queue = [];
cells.each((i, v) => {
const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
nCells.each((j, e) => {
const $node = $(e);
const titleSpan = $node.find('.posCatalog_name')[0];
const title = titleSpan ? ($(titleSpan).attr('title') || $(titleSpan).text() || '').trim() : '';
queue.push({
chapterIndex: i,
unitIndex: j,
globalIndex: queue.length,
element: e,
title,
});
});
});
this._unitQueue = queue;
return queue;
},

_syncCurrentQueueIndex(queue = this._unitQueue) {
const activeIndex = queue.findIndex((item) => $(item.element).hasClass('posCatalog_active'));
if (activeIndex >= 0) {
this._currentQueueIndex = activeIndex;
return activeIndex;
}
return this._currentQueueIndex;
},

_initCellData() {
const el = this._getTreeContainer();
const cells = el.children("ul").children("li");
const queue = this._buildUnitQueue();
this._cellData.cells = cells.length;
this._cellData.nCells = queue.length;

let foundCurrent = false;
const activeIndex = this._syncCurrentQueueIndex(queue);
if (activeIndex >= 0) {
const activeItem = queue[activeIndex];
this._cellData.currentCellIndex = activeItem.chapterIndex;
this._cellData.currentNCellIndex = activeItem.unitIndex;
this._cellData.currentGlobalIndex = activeItem.globalIndex;
this._cellData.currentVideoTitle = activeItem.title;
foundCurrent = true;
}

if (!foundCurrent && queue.length > 0) {
if (this._currentQueueIndex < 0) {
this._currentQueueIndex = 0;
}
console.warn("%c未找到当前激活的视频节点，可能需要手动选择", "color:#FF9800");
}
console.log(`%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`, "color:#607D8B");
},

_getTreeContainer() {
if (!this._treeContainerEl || !this._treeContainerEl[0]?.isConnected) {
const el = $('#coursetree');
if (el.length <= 0) {
throw new Error("找不到视频列表");
}
this._treeContainerEl = el;
}
return this._treeContainerEl;
},

_getVideoEl() {
if (!this._videoEl || !this._videoEl.isConnected) {
this._videoEl = null;
try {
const findVideo = (frame, depth) => {
if (depth > 2) return null;
const frameDocument = frame.contentDocument || frame.contentWindow?.document;
if (!frameDocument) return null;
const $frameDocument = $(frameDocument);
const directVideo = $frameDocument.find('video#video_html5_api, video[id*="video_html5"], video').get(0);
if (directVideo) return directVideo;
const nestedFrames = $frameDocument.find('iframe.ans-insertvideo-online, iframe[src*="video"]');
for (const nestedFrame of nestedFrames.toArray()) {
const nestedVideo = findVideo(nestedFrame, depth + 1);
if (nestedVideo) return nestedVideo;
}
return null;
};
for (const frame of $('iframe').toArray()) {
const video = findVideo(frame, 0);
if (video) {
this._videoEl = video;
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
break;
}
}
} catch (e) {
console.error("获取视频元素失败:", e);
return null;
}
}
if (!this._videoEl) return null;
return this._videoEl;
},

_videoEventHandle() {
const el = this._videoEl;
if (!el) {
console.log("videoEl未加载");
return;
}
if (this._eventVideoEl === el) return;
this._detachVideoEvents();
this._eventVideoEl = el;
this._boundVideoHandlers = {
ended: this._handleVideoEnded.bind(this),
loadedmetadata: this._handleVideoLoaded.bind(this),
play: this._handleVideoPlay.bind(this),
pause: this._handleVideoPause.bind(this),
};
el.addEventListener('ended', this._boundVideoHandlers.ended);
el.addEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
el.addEventListener('play', this._boundVideoHandlers.play);
el.addEventListener('pause', this._boundVideoHandlers.pause);
},

_detachVideoEvents() {
if (!this._eventVideoEl || !this._boundVideoHandlers) return;
this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
this._eventVideoEl = null;
this._boundVideoHandlers = null;
},

_handleVideoEnded() {
const title = this._cellData.currentVideoTitle;
console.warn(`%c============'${title}' 播放完成 (ended)=============`, "color:#4CAF50;font-weight:bold");
this._isPlaying = false;
this._clearCheckInterval();
// 推进逻辑由 _waitForVideoEnded Promise 统一承接，避免重复触发 nextUnit()
},

_handleVideoLoaded() {
console.log(`%c============视频元数据加载完成=============`, "color:#2196F3");
// 不在此处重复触发 play()，避免与主状态机异步时序竞争
},

_handleVideoPlay() {
const title = this._cellData.currentVideoTitle;
console.info(`%c============'${title}' 开始播放=============`, "color:#4CAF50");
this._isPlaying = true;
this._stepSwitchPending = false;
const video = this._getVideoEl();
this._guardLastTime = Number(video?.currentTime || 0);
this._guardLastWallTs = Date.now();
},

_handleVideoPause() {
console.log(`%c============视频暂停=============`, "color:#FF9800");
},

_bindPageGuards() {
const preventPause = (e) => {
e.stopPropagation();
e.preventDefault();
};
const resumePlaybackNow = () => this._tryResumePlayback('page-event');
this._pageGuards = { preventPause, resumePlaybackNow };
document.addEventListener('mouseleave', preventPause);
window.addEventListener('mouseleave', preventPause);
document.addEventListener('mouseout', preventPause);
window.addEventListener('mouseout', preventPause);
window.addEventListener('blur', resumePlaybackNow);
document.addEventListener('visibilitychange', resumePlaybackNow);
},

destroy() {
this._state = STATE.DESTROYED;
this._beginNewEpoch('destroy');
$(document).off('.xuexitongPlayerV4');
if (this._pageGuards) {
const { preventPause, resumePlaybackNow } = this._pageGuards;
document.removeEventListener('mouseleave', preventPause);
window.removeEventListener('mouseleave', preventPause);
document.removeEventListener('mouseout', preventPause);
window.removeEventListener('mouseout', preventPause);
window.removeEventListener('blur', resumePlaybackNow);
document.removeEventListener('visibilitychange', resumePlaybackNow);
this._pageGuards = null;
}
},
};
attachQuizAutomation(app);
PAGE.app = app;
PAGE[APP_KEY] = app;

try {
app.run();
app._bindPageGuards();
} catch (error) {
console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
}
}
})();