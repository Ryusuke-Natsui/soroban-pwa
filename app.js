/* =========================
   そろばん問題ジェネレータ（PWA）
   - 足し算/引き算（混合可・途中で負を回避）
   - 掛け算/割り算（基本形）
   - Seed対応（再現性）
   ========================= */

// ------- RNG (seeded) -------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= (h >>> 16)) >>> 0;
  };
}
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  if (!seedStr) {
    // なるべく衝突しにくいseedを作る
    seedStr = String(Date.now()) + ":" + String(Math.random());
  }
  const seed = xmur3(seedStr)();
  return { rng: mulberry32(seed), seedStr };
}
function randInt(rng, min, maxInclusive) {
  const r = rng();
  const span = maxInclusive - min + 1;
  return min + Math.floor(r * span);
}

// ------- DOM -------
const $ = (id) => document.getElementById(id);

const el = {
  kind: $("problemKind"),
  count: $("count"),
  layout: $("layout"),
  showAnswers: $("showAnswers"),
  seed: $("seed"),
  columns: $("columns"),
  flashOptions: $("flashOptions"),
  flashSpeed: $("flashSpeed"),

  addsubOptions: $("addsubOptions"),
  mode: $("addsubMode"),
  digits: $("digits"),
  terms: $("terms"),
  noNegative: $("noNegative"),
  exactDigits: $("exactDigits"),
  allowZero: $("allowZero"),
  subRate: $("subRate"),

  mulOptions: $("mulOptions"),
  mulDigitsA: $("mulDigitsA"),
  mulDigitsB: $("mulDigitsB"),
  mulExact: $("mulExact"),
  mulAllowZero: $("mulAllowZero"),

  divOptions: $("divOptions"),
  divDigitsDivisor: $("divDigitsDivisor"),
  divDigitsQuot: $("divDigitsQuot"),
  divExact: $("divExact"),
  divAllowZero: $("divAllowZero"),

  output: $("output"),
  meta: $("outputMeta"),
  errorBox: $("errorBox"),
  flashBoard: $("flashBoard"),
  flashProgress: $("flashProgress"),
  flashDisplay: $("flashDisplay"),
  btnFlashStart: $("btnFlashStart"),
  btnFlashPrev: $("btnFlashPrev"),
  btnFlashNext: $("btnFlashNext"),
  btnFlashShowAnswer: $("btnFlashShowAnswer"),

  btnGenerate: $("btnGenerate"),
  btnPrint: $("btnPrint"),
  btnCopy: $("btnCopy"),
  btnDownload: $("btnDownload"),

  stopwatchDisplay: $("stopwatchDisplay"),
  btnToggleStopwatch: $("btnToggleStopwatch"),
  btnResetStopwatch: $("btnResetStopwatch"),
};

// ------- UI helpers -------
function setError(msg) {
  if (!msg) {
    el.errorBox.classList.add("hidden");
    el.errorBox.textContent = "";
    return;
  }
  el.errorBox.classList.remove("hidden");
  el.errorBox.textContent = msg;
}

function updateOptionsVisibility() {
  const kind = el.kind.value;
  el.addsubOptions.classList.toggle("hidden", kind !== "addsub");
  el.mulOptions.classList.toggle("hidden", kind !== "mul");
  el.divOptions.classList.toggle("hidden", kind !== "div");
  el.flashOptions.classList.toggle("hidden", el.layout.value !== "flash");
}

function applyColumns() {
  const cols = parseInt(el.columns.value, 10);
  el.output.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
}

el.kind.addEventListener("change", () => {
  updateOptionsVisibility();
  setError("");
});
el.layout.addEventListener("change", () => {
  updateOptionsVisibility();
  if (el.layout.value !== "flash") {
    setFlashModeVisibility(false);
    stopFlashPlayback();
  }
});
el.columns.addEventListener("change", applyColumns);
applyColumns();
updateOptionsVisibility();

// ------- number bounds -------
function calcBounds(digits, exactDigits, allowZero) {
  const d = Math.max(1, Math.min(12, digits));
  const maxVal = Math.pow(10, d) - 1;

  let minVal;
  if (exactDigits) {
    // 指定桁ぴったり
    minVal = Math.pow(10, d - 1);
    if (allowZero && d === 1) minVal = 0; // 1桁なら0を含めても自然
  } else {
    // 1〜指定桁（または0許可なら0〜指定桁）
    minVal = allowZero ? 0 : 1;
  }
  return { minVal, maxVal };
}

// ------- generators -------
function generateAddSubProblem(rng, opts) {
  const {
    mode, digits, terms, noNegative, exactDigits, allowZero, subRate
  } = opts;

  const { minVal, maxVal } = calcBounds(digits, exactDigits, allowZero);

  if (terms < 2) throw new Error("項数（行数）は2以上にしてください。");

  // 生成結果
  const nums = [];
  const ops = []; // ops[i] is operator for nums[i] (i>=1), "+" or "-"

  // ヘルパ：指定範囲で数を作る
  const pickNum = (lo, hi) => {
    if (hi < lo) return null;
    return randInt(rng, lo, hi);
  };

  const forbidNeg = (noNegative === "yes");

  if (mode === "add") {
    // 足し算のみ：最初の数 + (terms-1個)
    const first = pickNum(minVal, maxVal);
    if (first === null) throw new Error("指定条件で最初の数が作れません。");
    nums.push(first);
    for (let i = 1; i < terms; i++) {
      ops.push("+");
      const n = pickNum(minVal, maxVal);
      if (n === null) throw new Error("指定条件で項が作れません。");
      nums.push(n);
    }
    return { kind: "addsub", nums, ops, answer: nums.reduce((a,b)=>a+b,0) };
  }

  if (mode === "sub") {
    // 引き算のみ：最初の数 - (terms-1個)
    // forbidNeg かつ exactDigits の場合、各引く数がminVal以上なので初期値の下限が必要
    let lower = minVal;
    if (forbidNeg && exactDigits) {
      lower = Math.max(lower, (terms - 1) * minVal);
    }
    if (lower > maxVal) {
      throw new Error(
        "条件が厳しすぎて生成できません。\n" +
        "例：項数を減らす / 桁数を増やす / 『桁数を厳密に固定』をOFF / 『途中で負を禁止』をOFF などを試してください。"
      );
    }
    const first = pickNum(lower, maxVal);
    nums.push(first);

    let total = first;

    for (let i = 1; i < terms; i++) {
      ops.push("-");
      if (!forbidNeg) {
        // 負を許すなら普通に引く
        const n = pickNum(minVal, maxVal);
        if (n === null) throw new Error("指定条件で項が作れません。");
        nums.push(n);
        total -= n;
        continue;
      }

      // forbidNeg: totalを下回らない範囲で引く
      // さらに exactDigits なら、残りの引く数に minVal を確保するため上限を絞る
      const remaining = terms - i; // この後に残る引き算の個数
      let hi = Math.min(maxVal, total);
      if (exactDigits) {
        const mustLeave = (remaining - 1) * minVal; // 残りの引く数の最低合計
        hi = Math.min(hi, total - mustLeave);
      }
      const n = pickNum(minVal, hi);
      if (n === null) {
        throw new Error("途中で負にならない条件のもと、この設定では生成が難しいです。項数/桁数/厳密固定の設定を調整してください。");
      }
      nums.push(n);
      total -= n;
    }
    const answer = nums.slice(1).reduce((a,b)=>a-b, nums[0]);
    return { kind: "addsub", nums, ops, answer };
  }

  // mixed
  // 方針：最初にある程度の初期値を持たせ、以降は状況に応じてマイナスを回避しながら進める
  const subP = Math.max(0, Math.min(100, subRate)) / 100;

  // 初期値：負回避 & 厳密固定 & 引き算多めでも破綻しにくいように下限を少し上げる
  let firstLo = minVal;
  if (forbidNeg) {
    firstLo = Math.max(firstLo, exactDigits ? minVal : 1);
    // “引き算割合が高いほど”初期値を少し大きめに（雑にバッファ）
    const buffer = Math.floor((terms - 1) * subP * (exactDigits ? minVal * 0.35 : (maxVal * 0.05)));
    firstLo = Math.min(maxVal, Math.max(firstLo, buffer));
  }

  const first = pickNum(firstLo, maxVal);
  if (first === null) throw new Error("指定条件で最初の数が作れません。");
  nums.push(first);

  let total = first;

  for (let i = 1; i < terms; i++) {
    let op = (rng() < subP) ? "-" : "+";

    if (forbidNeg && op === "-") {
      // 引ける状況でなければ強制的に足す
      if (total < minVal) op = "+";
    }

    if (op === "+") {
      const n = pickNum(minVal, maxVal);
      if (n === null) throw new Error("指定条件で項が作れません。");
      ops.push("+");
      nums.push(n);
      total += n;
    } else {
      // "-"
      let hi = Math.min(maxVal, total);
      // 厳密固定でも、ここでは “将来の最低確保” までは縛らない（混合なので回復可能）。
      // ただし total が小さい時は自然に引けなくなる。
      const n = pickNum(minVal, hi);
      if (n === null) {
        // 仕方ないので足し算に切り替える
        const m = pickNum(minVal, maxVal);
        if (m === null) throw new Error("指定条件で項が作れません。");
        ops.push("+");
        nums.push(m);
        total += m;
      } else {
        ops.push("-");
        nums.push(n);
        total -= n;
      }
    }
  }

  const answer = nums.slice(1).reduce((acc, n, idx) => {
    const op = ops[idx];
    return op === "+" ? acc + n : acc - n;
  }, nums[0]);

  return { kind: "addsub", nums, ops, answer };
}

function generateMulProblem(rng, opts) {
  const { digitsA, digitsB, exactDigits, allowZero } = opts;
  const A = calcBounds(digitsA, exactDigits, allowZero);
  const B = calcBounds(digitsB, exactDigits, allowZero);

  const a = randInt(rng, A.minVal, A.maxVal);
  const b = randInt(rng, B.minVal, B.maxVal);
  return { kind: "mul", a, b, answer: a * b };
}

function generateDivProblem(rng, opts) {
  const { digitsDivisor, digitsQuot, exact, allowZero } = opts;

  const D = calcBounds(digitsDivisor, true, false); // 除数は基本「桁ぴったり」を推奨
  const Q = calcBounds(digitsQuot, true, allowZero);

  let divisor = randInt(rng, D.minVal, D.maxVal);
  if (divisor === 0) divisor = 1;

  const quotient = randInt(rng, Q.minVal, Q.maxVal);

  if (exact === "yes") {
    const dividend = divisor * quotient;
    return { kind: "div", dividend, divisor, quotient, remainder: 0 };
  } else {
    const remainder = randInt(rng, 0, Math.max(0, divisor - 1));
    const dividend = divisor * quotient + remainder;
    return { kind: "div", dividend, divisor, quotient, remainder };
  }
}

// ------- formatting -------
function padLeft(s, width) {
  const str = String(s);
  if (str.length >= width) return str;
  return " ".repeat(width - str.length) + str;
}

function formatNumber(n) {
  return Number(n).toLocaleString("ja-JP");
}

function formatVerticalAddSub(p, showAnswer) {
  // 右寄せ：符号列(2) + 数字列(width)
  const formattedNums = p.nums.map(formatNumber);
  const formattedAnswer = formatNumber(p.answer);
  const width = Math.max(
    ...formattedNums.map(v => v.length),
    showAnswer ? formattedAnswer.length : 0
  );
  const lines = [];

  // 1行目（符号なし）
  lines.push("  " + padLeft(formattedNums[0], width));

  for (let i = 1; i < p.nums.length; i++) {
    const op = p.ops[i - 1];
    lines.push(op + " " + padLeft(formattedNums[i], width));
  }
  lines.push("—".repeat(width + 2));

  if (showAnswer) lines.push("  " + padLeft(formattedAnswer, width));
  return lines.join("\n");
}

function formatHorizontalAddSub(p, showAnswer) {
  let expr = formatNumber(p.nums[0]);
  for (let i = 1; i < p.nums.length; i++) {
    expr += " " + p.ops[i - 1] + " " + formatNumber(p.nums[i]);
  }
  if (showAnswer) expr += " = " + formatNumber(p.answer);
  return expr;
}

function formatVerticalMul(p, showAnswer) {
  const a = formatNumber(p.a), b = formatNumber(p.b);
  const answer = formatNumber(p.answer);
  const width = Math.max(a.length, b.length, showAnswer ? answer.length : 0);
  const lines = [];
  lines.push("  " + padLeft(a, width));
  lines.push("× " + padLeft(b, width));
  lines.push("—".repeat(width + 2));
  if (showAnswer) lines.push("  " + padLeft(answer, width));
  return lines.join("\n");
}

function formatHorizontalMul(p, showAnswer) {
  let s = `${formatNumber(p.a)} × ${formatNumber(p.b)}`;
  if (showAnswer) s += ` = ${formatNumber(p.answer)}`;
  return s;
}

function formatVerticalDiv(p, showAnswer) {
  // ひっ算“風”：上に割られる数、下に ÷ 除数
  const a = formatNumber(p.dividend), b = formatNumber(p.divisor);
  const quotient = formatNumber(p.quotient);
  const remainder = formatNumber(p.remainder);
  const answer = p.remainder === 0 ? quotient : `${quotient} あまり ${remainder}`;
  const width = Math.max(a.length, b.length, showAnswer ? answer.length : 0);
  const lines = [];
  lines.push("  " + padLeft(a, width));
  lines.push("÷ " + padLeft(b, width));
  lines.push("—".repeat(width + 2));
  if (showAnswer) {
    lines.push("  " + padLeft(answer, width));
  }
  return lines.join("\n");
}

function formatHorizontalDiv(p, showAnswer) {
  let s = `${formatNumber(p.dividend)} ÷ ${formatNumber(p.divisor)}`;
  if (showAnswer) {
    if (p.remainder === 0) s += ` = ${formatNumber(p.quotient)}`;
    else s += ` = ${formatNumber(p.quotient)} あまり ${formatNumber(p.remainder)}`;
  }
  return s;
}

function renderProblems(problems, meta) {
  el.meta.textContent = meta;

  el.output.innerHTML = "";
  for (const pr of problems) {
    const div = document.createElement("div");
    div.className = "problem";
    const pre = document.createElement("pre");
    pre.textContent = pr.text;
    div.appendChild(pre);
    el.output.appendChild(div);
  }
}

function collectAllText() {
  const blocks = [...el.output.querySelectorAll("pre")].map(p => p.textContent);
  return blocks.join("\n\n");
}




// ------- flash mode -------
let flashProblems = [];
let flashIndex = 0;
let flashTimerId = null;

function stopFlashPlayback() {
  if (flashTimerId !== null) {
    window.clearTimeout(flashTimerId);
    flashTimerId = null;
  }
}

function getFlashPrompt(problem) {
  if (!problem || problem.kind !== "addsub") return "この表示では足し算 / 引き算のみ対応です";
  return `第${flashIndex + 1}問を開始`;
}

function getFlashAnswerText(problem) {
  if (!problem || problem.kind !== "addsub") return "";
  return `答え: ${formatNumber(problem.answer)}`;
}

function updateFlashBoard() {
  const total = flashProblems.length;
  if (!total) {
    el.flashProgress.textContent = "問題がありません";
    el.flashDisplay.textContent = "生成してください";
    return;
  }
  el.flashProgress.textContent = `第${flashIndex + 1}問 / ${total}問`;
  el.flashDisplay.textContent = getFlashPrompt(flashProblems[flashIndex]);
}

function setFlashModeVisibility(isFlash) {
  el.flashBoard.classList.toggle("hidden", !isFlash);
  el.output.classList.toggle("hidden", isFlash);
}

function playFlashCurrentProblem() {
  const problem = flashProblems[flashIndex];
  if (!problem || problem.kind !== "addsub") {
    updateFlashBoard();
    return;
  }

  stopFlashPlayback();
  const speed = Math.max(200, parseInt(el.flashSpeed.value, 10) || 800);
  const blankDuration = Math.min(180, Math.max(60, Math.floor(speed * 0.2)));
  const numberDuration = Math.max(80, speed - blankDuration);
  const sequence = [problem.nums[0], ...problem.nums.slice(1).map((n, i) => `${problem.ops[i]}${n}`)];
  let step = 0;

  const showStep = () => {
    if (step >= sequence.length) {
      el.flashDisplay.textContent = "終了（答えを表示で確認）";
      flashTimerId = null;
      return;
    }
    el.flashDisplay.textContent = String(sequence[step]);
    step += 1;

    const hasNext = step < sequence.length;
    if (!hasNext) {
      flashTimerId = window.setTimeout(showStep, numberDuration);
      return;
    }

    flashTimerId = window.setTimeout(() => {
      el.flashDisplay.textContent = "";
      flashTimerId = window.setTimeout(showStep, blankDuration);
    }, numberDuration);
  };

  showStep();
}


// ------- stopwatch -------
let stopwatchTimerId = null;
let stopwatchStartAt = 0;
let stopwatchElapsedMs = 0;

function formatStopwatch(ms) {
  const totalTenths = Math.floor(ms / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function updateStopwatchDisplay(ms) {
  el.stopwatchDisplay.textContent = formatStopwatch(ms);
}

function updateStopwatchToggleLabel() {
  el.btnToggleStopwatch.textContent = (stopwatchTimerId === null) ? "スタート" : "ストップ";
}

function startStopwatch() {
  if (stopwatchTimerId !== null) return;
  stopwatchStartAt = Date.now() - stopwatchElapsedMs;
  stopwatchTimerId = window.setInterval(() => {
    stopwatchElapsedMs = Date.now() - stopwatchStartAt;
    updateStopwatchDisplay(stopwatchElapsedMs);
  }, 100);
  updateStopwatchToggleLabel();
}

function stopStopwatch() {
  if (stopwatchTimerId === null) return;
  window.clearInterval(stopwatchTimerId);
  stopwatchTimerId = null;
  stopwatchElapsedMs = Date.now() - stopwatchStartAt;
  updateStopwatchDisplay(stopwatchElapsedMs);
  updateStopwatchToggleLabel();
}

function toggleStopwatch() {
  if (stopwatchTimerId === null) {
    startStopwatch();
  } else {
    stopStopwatch();
  }
}

function resetStopwatch() {
  if (stopwatchTimerId !== null) {
    window.clearInterval(stopwatchTimerId);
    stopwatchTimerId = null;
  }
  stopwatchStartAt = 0;
  stopwatchElapsedMs = 0;
  updateStopwatchDisplay(0);
  updateStopwatchToggleLabel();
}

updateStopwatchDisplay(0);
updateStopwatchToggleLabel();

// ------- main generate -------
function generate() {
  setError("");

  const kind = el.kind.value;
  const count = parseInt(el.count.value, 10) || 1;
  const layout = el.layout.value;
  const showAnswers = (el.showAnswers.value === "yes");
  const seedInput = el.seed.value.trim();

  const { rng, seedStr } = makeRng(seedInput);

  const problems = [];
  const startedAt = new Date();

  if (layout === "flash" && kind !== "addsub") {
    setError("フラッシュ暗算モードは『足し算 / 引き算』で利用してください。");
    return;
  }

  try {
    for (let i = 0; i < count; i++) {
      let p, text;

      if (kind === "addsub") {
        const opts = {
          mode: el.mode.value,
          digits: parseInt(el.digits.value, 10),
          terms: parseInt(el.terms.value, 10),
          noNegative: el.noNegative.value,
          exactDigits: el.exactDigits.value === "yes",
          allowZero: el.allowZero.value === "yes",
          subRate: parseInt(el.subRate.value, 10) || 0,
        };
        p = generateAddSubProblem(rng, opts);
        text = (layout === "vertical")
          ? formatVerticalAddSub(p, showAnswers)
          : formatHorizontalAddSub(p, showAnswers);
      }

      if (kind === "mul") {
        const opts = {
          digitsA: parseInt(el.mulDigitsA.value, 10),
          digitsB: parseInt(el.mulDigitsB.value, 10),
          exactDigits: el.mulExact.value === "yes",
          allowZero: el.mulAllowZero.value === "yes",
        };
        p = generateMulProblem(rng, opts);
        text = (layout === "vertical")
          ? formatVerticalMul(p, showAnswers)
          : formatHorizontalMul(p, showAnswers);
      }

      if (kind === "div") {
        const opts = {
          digitsDivisor: parseInt(el.divDigitsDivisor.value, 10),
          digitsQuot: parseInt(el.divDigitsQuot.value, 10),
          exact: el.divExact.value,
          allowZero: el.divAllowZero.value === "yes",
        };
        p = generateDivProblem(rng, opts);
        text = (layout === "vertical")
          ? formatVerticalDiv(p, showAnswers)
          : formatHorizontalDiv(p, showAnswers);
      }

      const numberedText = `第${i + 1}問\n${text}`;
      problems.push({ text: numberedText, raw: p });
    }

    const meta = [
      `種類: ${kind === "addsub" ? "足し算/引き算" : kind === "mul" ? "掛け算" : "割り算"}`,
      `問題数: ${count}`,
      `表示: ${layout === "vertical" ? "縦書き（ひっ算風）" : layout === "horizontal" ? "横書き（式）" : "フラッシュ暗算"}`,
      `解答: ${showAnswers ? "表示" : "非表示"}`,
      `seed: ${seedInput ? seedStr : "(未指定: 自動)"}`,
      `生成時刻: ${startedAt.toLocaleString()}`,
    ].join(" / ");

    renderProblems(problems, meta);

    const isFlash = (layout === "flash");
    setFlashModeVisibility(isFlash);
    stopFlashPlayback();
    if (isFlash) {
      flashProblems = problems.map((v) => v.raw).filter(Boolean);
      flashIndex = 0;
      updateFlashBoard();
    } else {
      flashProblems = [];
    }
  } catch (e) {
    setError(String(e.message || e));
  }
}

// ------- buttons -------
el.btnGenerate.addEventListener("click", generate);
el.btnPrint.addEventListener("click", () => window.print());
el.btnCopy.addEventListener("click", async () => {
  const txt = collectAllText();
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    // iOS等の制限対策：一応fallback
    const ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
});
el.btnDownload.addEventListener("click", () => {
  const txt = collectAllText();
  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "soroban_problems.txt";
  a.click();
  URL.revokeObjectURL(url);
});
el.btnFlashStart.addEventListener("click", playFlashCurrentProblem);
el.btnFlashShowAnswer.addEventListener("click", () => {
  stopFlashPlayback();
  el.flashDisplay.textContent = getFlashAnswerText(flashProblems[flashIndex]);
});
el.btnFlashPrev.addEventListener("click", () => {
  if (!flashProblems.length) return;
  stopFlashPlayback();
  flashIndex = (flashIndex - 1 + flashProblems.length) % flashProblems.length;
  updateFlashBoard();
});
el.btnFlashNext.addEventListener("click", () => {
  if (!flashProblems.length) return;
  stopFlashPlayback();
  flashIndex = (flashIndex + 1) % flashProblems.length;
  updateFlashBoard();
});
el.btnToggleStopwatch.addEventListener("click", toggleStopwatch);
el.btnResetStopwatch.addEventListener("click", resetStopwatch);

// 初回生成
generate();

// ------- PWA: service worker -------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
