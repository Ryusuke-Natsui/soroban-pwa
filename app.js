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

  btnGenerate: $("btnGenerate"),
  btnPrint: $("btnPrint"),
  btnCopy: $("btnCopy"),
  btnDownload: $("btnDownload"),
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
}

function applyColumns() {
  const cols = parseInt(el.columns.value, 10);
  el.output.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
}

el.kind.addEventListener("change", () => {
  updateOptionsVisibility();
  setError("");
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

function formatVerticalAddSub(p, showAnswer) {
  // 右寄せ：符号列(2) + 数字列(width)
  const width = Math.max(...p.nums.map(n => String(Math.abs(n)).length));
  const lines = [];

  // 1行目（符号なし）
  lines.push("  " + padLeft(p.nums[0], width));

  for (let i = 1; i < p.nums.length; i++) {
    const op = p.ops[i - 1];
    lines.push(op + " " + padLeft(p.nums[i], width));
  }
  lines.push("—".repeat(width + 2));

  if (showAnswer) lines.push("  " + padLeft(p.answer, width));
  return lines.join("\n");
}

function formatHorizontalAddSub(p, showAnswer) {
  let expr = String(p.nums[0]);
  for (let i = 1; i < p.nums.length; i++) {
    expr += " " + p.ops[i - 1] + " " + String(p.nums[i]);
  }
  if (showAnswer) expr += " = " + p.answer;
  return expr;
}

function formatVerticalMul(p, showAnswer) {
  const a = String(p.a), b = String(p.b);
  const width = Math.max(a.length, b.length);
  const lines = [];
  lines.push("  " + padLeft(a, width));
  lines.push("× " + padLeft(b, width));
  lines.push("—".repeat(width + 2));
  if (showAnswer) lines.push("  " + padLeft(p.answer, width));
  return lines.join("\n");
}

function formatHorizontalMul(p, showAnswer) {
  let s = `${p.a} × ${p.b}`;
  if (showAnswer) s += ` = ${p.answer}`;
  return s;
}

function formatVerticalDiv(p, showAnswer) {
  // ひっ算“風”：上に割られる数、下に ÷ 除数
  const a = String(p.dividend), b = String(p.divisor);
  const width = Math.max(a.length, b.length);
  const lines = [];
  lines.push("  " + padLeft(a, width));
  lines.push("÷ " + padLeft(b, width));
  lines.push("—".repeat(width + 2));
  if (showAnswer) {
    if (p.remainder === 0) {
      lines.push("  " + padLeft(p.quotient, width));
    } else {
      const ans = `${p.quotient} あまり ${p.remainder}`;
      lines.push("  " + ans);
    }
  }
  return lines.join("\n");
}

function formatHorizontalDiv(p, showAnswer) {
  let s = `${p.dividend} ÷ ${p.divisor}`;
  if (showAnswer) {
    if (p.remainder === 0) s += ` = ${p.quotient}`;
    else s += ` = ${p.quotient} あまり ${p.remainder}`;
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

      problems.push({ text });
    }

    const meta = [
      `種類: ${kind === "addsub" ? "足し算/引き算" : kind === "mul" ? "掛け算" : "割り算"}`,
      `問題数: ${count}`,
      `表示: ${layout === "vertical" ? "縦書き（ひっ算風）" : "横書き（式）"}`,
      `解答: ${showAnswers ? "表示" : "非表示"}`,
      `seed: ${seedInput ? seedStr : "(未指定: 自動)"}`,
      `生成時刻: ${startedAt.toLocaleString()}`,
    ].join(" / ");

    renderProblems(problems, meta);
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

// 初回生成
generate();

// ------- PWA: service worker -------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
