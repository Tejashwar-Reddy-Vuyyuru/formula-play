/* ===================== Solve it: engine (units, reading the question, solving, explaining) ===================== */
const SV = (function () {
  const G = 9.81, NA = 6.022e23, R_L = 0.08206;
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const sind = d => Math.sin(rad(d)), cosd = d => Math.cos(rad(d)), tand = d => Math.tan(rad(d));
  const asind = x => deg(Math.asin(Math.max(-1, Math.min(1, x)))), acosd = x => deg(Math.acos(Math.max(-1, Math.min(1, x)))), atand = x => deg(Math.atan(x));

  /* ---------- units: token -> [dimension, factor to the dimension's base, offset] ---------- */
  const U = {};
  const add = (dim, list) => list.forEach(([toks, f, off]) => toks.split("|").forEach(t => U[t] = [dim, f, off || 0]));
  add("length", [["m|metre|metres|meter|meters", 1], ["cm|centimetre|centimetres|centimeter|centimeters", .01], ["mm|millimetre|millimetres|millimeter|millimeters", .001], ["km|kilometre|kilometres|kilometer|kilometers", 1000], ["µm|um|micrometre|micrometres|micron|microns", 1e-6], ["nm|nanometre|nanometres|nanometer|nanometers", 1e-9], ["inch|inches|in.", .0254], ["ft|foot|feet", .3048], ["yd|yard|yards", .9144], ["mile|miles|mi", 1609.34]]);
  add("time", [["s|sec|secs|second|seconds", 1], ["ms|millisecond|milliseconds", .001], ["min|mins|minute|minutes", 60], ["h|hr|hrs|hour|hours", 3600], ["day|days", 86400], ["week|weeks|wk|wks", 604800], ["month|months", 2.63e6], ["year|years|yr|yrs", 3.156e7]]);
  add("mass", [["kg|kilogram|kilograms|kgs", 1], ["g|gram|grams|gm", .001], ["mg|milligram|milligrams", 1e-6], ["tonne|tonnes|ton|tons", 1000], ["lb|lbs|pound|pounds", .4536]]);
  add("speed", [["m/s|mps|ms-1|m s-1|metres per second|meters per second|m per s", 1], ["km/h|kmh|kph|km/hr|kmph|kilometres per hour|kilometers per hour", 1 / 3.6], ["mph|miles per hour", .44704], ["cm/s", .01], ["knot|knots", .5144]]);
  add("accel", [["m/s2|m/s^2|m/s²|ms-2|m s-2", 1]]);
  add("force", [["n|newton|newtons", 1], ["kn|kilonewton|kilonewtons", 1000]]);
  add("energy", [["j|joule|joules", 1], ["kj|kilojoule|kilojoules", 1000], ["mj|megajoule|megajoules", 1e6], ["cal|calorie|calories", 4.184], ["kcal|kilocalorie|kilocalories", 4184], ["kwh", 3.6e6], ["wh", 3600]]);
  add("power", [["w|watt|watts", 1], ["kw|kilowatt|kilowatts", 1000], ["mw|megawatt|megawatts", 1e6]]);
  add("pressure", [["pa|pascal|pascals", 1], ["kpa", 1000], ["mpa", 1e6], ["atm|atmosphere|atmospheres", 101325], ["bar", 1e5], ["mmhg|torr", 133.322]]);
  add("volume", [["l|litre|litres|liter|liters", 1], ["ml|millilitre|millilitres|milliliter|milliliters|cc", .001], ["cm3|cm³|cubic cm", .001], ["m3|m³|cubic metre|cubic metres|cubic meter|cubic meters", 1000], ["dm3|dm³", 1], ["in³|in3|cubic inches", .016387064], ["ft³|ft3|cubic feet", 28.316846592], ["yd³|yd3|cubic yards", 764.554857984]]);
  add("area", [["m2|m²|square metre|square metres|square meter|square meters|sq m", 1], ["cm2|cm²|square centimetres|square centimeters|sq cm", 1e-4], ["mm2|mm²", 1e-6], ["km2|km²", 1e6], ["ha|hectare|hectares", 1e4], ["in²|in2|sq in|square inches|square inch", .00064516], ["ft²|ft2|sq ft|square feet|square foot", .09290304], ["yd²|yd2|sq yd|square yards", .83612736]]);
  add("angle", [["°|deg|degree|degrees", 1]]);
  add("temp", [["k|kelvin", 1], ["°c|celsius|degrees c|deg c|degc", 1, 273.15]]);
  add("voltage", [["v|volt|volts", 1], ["mv|millivolt|millivolts", .001], ["kv|kilovolt|kilovolts", 1000]]);
  add("current", [["a|amp|amps|ampere|amperes", 1], ["ma|milliamp|milliamps", .001]]);
  add("resistance", [["ω|ohm|ohms|Ω", 1], ["kω|kohm|kohms|kilohm|kilohms", 1000]]);
  add("frequency", [["hz|hertz", 1], ["khz", 1000], ["mhz", 1e6]]);
  add("amount", [["mol|mole|moles", 1], ["mmol", .001]]);
  add("molarmass", [["g/mol|g mol-1|g per mol", 1]]);
  add("conc", [["mol/l|mol/dm3|mol dm-3|molar|mol per litre|mol per liter", 1], ["mmol/l", .001]]);
  add("density", [["kg/m3|kg/m³|kg m-3", 1], ["g/cm3|g/cm³|g/ml|g per cm3", 1000]]);
  add("percent", [["%|percent|per cent", 1]]);
  add("shc", [["j/kg°c|j/(kg°c)|j/kg/°c|j/(kg·°c)|j/kg·°c|j/kgk|j/(kg·k)|j/kg·k|j/kg/k|j/(kg k)|j/kg k", 1]]);
  add("springk", [["n/m|newtons per metre|newtons per meter", 1], ["n/cm", 100]]);
  add("enthalpy", [["kj/mol|kj mol-1|kj per mol|kj/mole", 1]]);
  add("rate", [["times a minute|times per minute|times each minute|beats a minute|breaths a minute|beats each minute|bpm|beats per minute|beats/min|per minute|/min|breaths per minute|breaths/min", 1]]);
  add("flow", [["l/min|litres per minute|liters per minute", 1], ["ml/min", .001]]);
  add("money", [["$|dollars|dollar|usd|rs|rupees|₹|€|£|euros|pounds sterling", 1]]);
  Object.keys(U).forEach(k => { if (/[²³]/.test(k)) { U[k.replace(/²/g, "^2").replace(/³/g, "^3")] = U[k]; U[k.replace(/²/g, "2").replace(/³/g, "3")] = U[k]; } });
  ["cm^3", "m^3", "dm^3", "mm^3"].forEach(k => { const b = k.replace("^3", "3"); if (U[b]) U[k] = U[b]; }); ["cm^2", "m^2", "mm^2", "km^2", "m/s^2", "ms^-2", "m s^-2"].forEach(k => { const b = k.replace("^2", "2").replace("^-2", "-2"); if (U[b]) U[k] = U[b]; });
  /* tokens that are also ordinary words or clash: only accept with a number right before them */
  const DIM_BASE = { enthalpy: "kJ/mol", springk: "N/m", momentum: "kg·m/s", shc: "J/(kg·°C)", length: "m", time: "s", mass: "kg", speed: "m/s", accel: "m/s²", force: "N", energy: "J", power: "W", pressure: "Pa", volume: "L", area: "m²", angle: "°", temp: "K", voltage: "V", current: "A", resistance: "Ω", frequency: "Hz", amount: "mol", molarmass: "g/mol", conc: "mol/L", density: "kg/m³", percent: "%", rate: "/min", flow: "L/min", money: "", none: "" };
  const DIM_NAME = { enthalpy: "an energy per mole", springk: "a spring stiffness", momentum: "a momentum", shc: "a specific heat capacity", length: "a length", time: "a time", mass: "a mass", speed: "a speed", accel: "an acceleration", force: "a force", energy: "an energy", power: "a power", pressure: "a pressure", volume: "a volume", area: "an area", angle: "an angle", temp: "a temperature", voltage: "a voltage", current: "a current", resistance: "a resistance", frequency: "a frequency", amount: "an amount of substance", molarmass: "a molar mass", conc: "a concentration", density: "a density", percent: "a percentage", rate: "a rate per minute", flow: "a flow rate", money: "an amount of money", none: "a plain number" };
  function unitOf(tok) { if (!tok) return null; if (tok === "M") return ["conc", 1, 0]; const t = tok.toLowerCase().replace(/\s+/g, " ").trim(); if (U[t]) return U[t]; if (U[tok]) return U[tok]; return null; }
  /* convert value v from unit token to the target unit token (same dimension) */
  function conv(v, from, to) { const a = unitOf(from), b = unitOf(to); if (!a || !b || a[0] !== b[0]) return v; const base = (v + 0) * a[1] + a[2]; return (base - b[2]) / b[1]; }

  /* ---------- formatting ---------- */
  function fmt(x) { const sig = 4; if (x == null || !isFinite(x)) return "—"; if (x === 0) return "0"; const a = Math.abs(x);
    if (a >= 1e6 || a < 1e-3) { const e = Math.floor(Math.log10(a)), m = x / Math.pow(10, e); return (+m.toPrecision(3)) + " × 10^" + e; }
    let s = (+x.toPrecision(sig)).toString(); if (a >= 1000) s = (+x.toPrecision(sig)).toLocaleString("en-US", { maximumFractionDigits: 2 }); return s; }
  const sup = s => s.replace(/\^(-?\d+)/g, (m, d) => d.split("").map(c => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]).join(""));
  const fmtU = (x, u) => sup(fmt(x)) + (u ? (u === "%" || u === "°" ? "" : " ") + u : "");

  /* ---------- reading numbers + units from text ---------- */
  const NUMRE = /(-?\d[\d,]*\.?\d*|-?\.\d+)(\s*(?:[x×*]\s*10\s*\^?\s*\(?(-?\d+)\)?|e(-?\d+)))?/gi;
  const UNIT_KEYS = Object.keys(U).sort((a, b) => b.length - a.length);
  function quantities(text) {
    const out = [], t = text.replace(/[’']/g, "'").replace(/−/g, "-");
    let m; NUMRE.lastIndex = 0;
    while ((m = NUMRE.exec(t))) {
      const start = m.index; if (start > 0 && /[A-Za-z_]/.test(t[start - 1]) && !/[\s(]/.test(t[start - 1])) continue; /* part of a word like H2O or x2 */
      let v = parseFloat(m[1].replace(/,/g, "")); const ex = m[3] || m[4]; if (ex) v *= Math.pow(10, +ex);
      let rest = t.slice(m.index + m[0].length), unit = null, dim = "none", ulen = 0;
      const lead = t.slice(Math.max(0, start - 3), start); if (/[$₹€£]\s*$/.test(lead)) { unit = lead.trim().slice(-1); dim = "money"; }
      if (dim === "none") { const r = rest.replace(/^(\s+|-(?=[a-zA-Z]))/, ""), sp = rest.length - r.length, rl = r.toLowerCase();
        if (/^M(?![a-zA-Z])/.test(r) && sp <= 1) { unit = "M"; dim = "conc"; ulen = sp + 1; }
        else
        for (const k of UNIT_KEYS) { if (rl.startsWith(k.toLowerCase())) { const nx = r[k.length]; if (nx && /[a-z0-9]/i.test(nx) && !/[°%$/]/.test(k.slice(-1))) continue; if (k === "%" && sp > 1) continue;
            const ct = U[k] ? k : k; /* case-sensitive pick for ambiguous M / m */
            let use = U[k];
            if (k === "a" && !/\d\s*a\b/i.test(t.slice(start, start + m[0].length + 3))) continue; if ((k === "in" || k === "h" || k === "s" || k === "g" || k === "l" || k === "v" || k === "k" || k === "n" || k === "j" || k === "w" || k === "c") && sp > 1) continue;
            unit = r.slice(0, k.length); dim = use[0]; ulen = sp + k.length; break; } } }
      /* degrees written as "30 degrees C" etc. */
      const before = t.slice(Math.max(0, start - 60), start).toLowerCase(), after = t.slice(m.index + m[0].length + ulen, m.index + m[0].length + ulen + 40).toLowerCase();
      out.push({ v, unit, dim, raw: m[0] + (ulen ? rest.slice(0, ulen) : ""), index: start, before, after });
      NUMRE.lastIndex = m.index + m[0].length + ulen; }
    return out; }
  const words = s => s.toLowerCase().replace(/[^a-z0-9°%\s-]/g, " ").split(/\s+/).filter(Boolean);
  const hasKw = (text, kw) => kw.some(k => (" " + text + " ").includes(" " + k + " ") || (k.length > 4 && text.includes(k)));

  /* ---------- the generic solver: equations with ready-made forms for each variable ---------- */
  /* eq: { f: v => residual, forms: { varId: [templateWithIds, v => value] }, vars:[ids] } */
  function solveGeneric(T, known, find) {
    const v = Object.assign({}, T.consts || {}, known), steps = [], used = new Set();
    const ids = T.vars.map(x => x.id);
    let guard = 0;
    while (!(find in v) && guard++ < 30) {
      let progressed = false;
      for (let i = 0; i < T.eqs.length; i++) { const e = T.eqs[i]; const unknown = e.vars.filter(id => !(id in v)); if (unknown.length !== 1) continue; const u = unknown[0]; const fm = e.forms[u]; if (!fm) continue;
        let val; try { val = fm[1](v, T); } catch (er) { val = NaN; } if (!isFinite(val)) continue;
        v[u] = val; steps.push({ eq: e, target: u, tpl: fm[0], val }); progressed = true; if (u === find) break; }
      if (!progressed) break; }
    if (!(find in v)) { /* solve the rest together, numerically */
      const eqs = T.eqs.filter(e => e.vars.some(id => !(id in v))), unk = [...new Set(eqs.flatMap(e => e.vars.filter(id => !(id in v))))];
      if (unk.includes(find) && eqs.length >= unk.length) { const x0 = unk.map(id => (T.vars.find(q => q.id === id) || {}).guess || 1); const sol = newton(eqs, unk, v, x0);
        if (sol) { unk.forEach((id, i) => v[id] = sol[i]); steps.push({ together: true, eqs, unk }); } } }
    return { v, steps, ok: find in v && isFinite(v[find]) }; }
  function newton(eqs, unk, base, x0) {
    const tries = [x0, x0.map(x => x * 3), x0.map(x => x / 3), x0.map(() => 10), x0.map(() => .5)];
    for (const st of tries) { let x = st.slice();
      for (let it = 0; it < 80; it++) { const F = res(x); const nrm = Math.hypot(...F); if (nrm < 1e-10) return rankOk(x) ? x : null;
        const J = F.map(() => new Array(x.length).fill(0)); for (let j = 0; j < x.length; j++) { const h = Math.max(1e-7, Math.abs(x[j]) * 1e-6), xp = x.slice(); xp[j] += h; const Fp = res(xp); for (let i = 0; i < F.length; i++) J[i][j] = (Fp[i] - F[i]) / h; }
        const JT = transpose(J), A = mul(JT, J), b = JT.map(r => -r.reduce((s, a, i) => s + a * F[i], 0)); for (let k = 0; k < A.length; k++) A[k][k] += 1e-12; const dx = gauss(A, b); if (!dx) break;
        let lam = 1; for (let k = 0; k < 20; k++) { const xn = x.map((a, i) => a + lam * dx[i]); if (Math.hypot(...res(xn)) < nrm) { x = xn; break; } lam /= 2; } }
      if (Math.hypot(...res(x)) < 1e-6 * (1 + Math.hypot(...x))) return rankOk(x) ? x : null; }
    return null;
    function rankOk(x) { const F = res(x); const J = F.map(() => new Array(x.length).fill(0)); for (let j = 0; j < x.length; j++) { const h = Math.max(1e-6, Math.abs(x[j]) * 1e-5), xp = x.slice(); xp[j] += h; const Fp = res(xp); for (let i = 0; i < F.length; i++) J[i][j] = (Fp[i] - F[i]) / h; }
      const M = J.map(r => r.map(v => v)); let rank = 0; const used = new Array(M.length).fill(false); for (let col = 0; col < x.length; col++) { let p = -1, best = 0; for (let i = 0; i < M.length; i++) if (!used[i] && Math.abs(M[i][col]) > best) { best = Math.abs(M[i][col]); p = i; } const scale = Math.max(1e-12, ...M.map(r => Math.abs(r[col]))); if (p < 0 || best < 1e-4 * scale) continue; used[p] = true; rank++; for (let i = 0; i < M.length; i++) if (i !== p) { const f = M[i][col] / M[p][col]; for (let k = col; k < x.length; k++) M[i][k] -= f * M[p][k]; } } return rank >= x.length; }
    function res(x) { const v = Object.assign({}, base); unk.forEach((id, i) => v[id] = x[i]); return eqs.map(e => { try { return e.f(v); } catch (er) { return 1e9; } }); } }
  const transpose = A => A[0].map((_, j) => A.map(r => r[j])), mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, a, k) => s + a * B[k][j], 0)));
  function gauss(A, b) { const n = A.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-14) return null; [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } return M.map((r, i) => r[n] / r[i]); }

  /* ---------- turning a form template into readable lines ---------- */
  function symOf(T, id) { const q = T.vars.find(x => x.id === id); return q ? (q.sym || id) : id; }
  function swapIds(T, tpl, fn) { const ids = T.vars.map(x => x.id).concat(Object.keys(T.consts || {})).sort((a, b) => b.length - a.length); return tpl.replace(new RegExp("(?<![A-Za-z0-9_])(" + ids.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![A-Za-z0-9_])", "g"), m => fn(m)); }
  function valStr(T, v, id) { const q = T.vars.find(x => x.id === id); if (!q) return fmt(v[id]); return fmtU(v[id], q.unit); }
  const pretty = s => s.replace(/mx\(0,((?:[^()]|\([^()]*\))*)\)/g, "$1").replace(/\*\*/g, "^").replace(/\s*\*\s*/g, " × ").replace(/sqrt/g, "√").replace(/\^2(?![0-9.])/g, "²").replace(/\^3(?![0-9.])/g, "³").replace(/\b(PI|pi)\b/g, "π").replace(/\s*\/\s*/g, " ÷ ").replace(/\s*([+])\s*/g, " + ").replace(/(\w|\))-(\w|\()/g, "$1 − $2");
  function stepLines(T, sol) { return sol.steps.map(s => { if (s.together) return { title: "Solve them together", lines: ["The remaining unknowns (" + s.unk.map(id => symOf(T, id)).join(", ") + ") appear in more than one equation, so they're found together:", ...s.unk.map(id => symOf(T, id) + " = " + valStr(T, sol.v, id))] };
      const q = T.vars.find(x => x.id === s.target), lhs = symOf(T, s.target);
      return { title: "Find " + (q ? q.label.toLowerCase() : lhs), lines: [lhs + " = " + pretty(swapIds(T, s.tpl, id => symOf(T, id))), lhs + " = " + pretty(swapIds(T, s.tpl, id => "(" + (T.vars.find(x => x.id === id) ? fmt(sol.v[id]) : fmt((T.consts || {})[id])) + ")").replace(/\((-?[\d.,]+)\)/g, "$1").replace(/\(-/g, "(−")), lhs + " = " + valStr(T, sol.v, s.target)] }; }); }

  /* ---------- deciding which variable gets which number ---------- */
  const SV_dimOk = (q, V) => q.dim === V.dim;
  function assign(T, text) {
    const qs = quantities(text), vals = {}, units = {}, usedQ = new Set(), lt = text.toLowerCase();
    (T.phrases || []).forEach(p => { if (p.re.test(lt)) Object.entries(p.set).forEach(([k, x]) => { vals[k] = x; units[k] = (T.vars.find(q => q.id === k) || {}).unit; }); });
    for (const m of text.matchAll(/(?<![A-Za-z])([A-Za-zα-ωθλμρη][₀-₉0-9]?)\s*=\s*(-?[\d.,]+(?:\s*[x×*]\s*10\^?-?\d+)?\s*[^\s,;]*)/g)) { const V = T.vars.find(V => !(V.id in vals) && (V.sym === m[1] || V.id === m[1] || V.sym === m[1].replace(/0/, "₀"))); if (!V) continue; const q = quantities(m[2])[0]; if (!q) continue; const qi = qs.findIndex(x => Math.abs(x.v - q.v) < 1e-12 * Math.max(1, Math.abs(q.v)) && !usedQ.has(x === x ? qs.indexOf(x) : -1)); vals[V.id] = q.unit && V.unit && SV_dimOk(q, V) ? conv(q.v, q.unit, V.unit) : q.v; units[V.id] = q.unit || V.unit; if (qi >= 0) usedQ.add(qi); }
    const asked = detectFind(T, text, Object.assign({}, vals), true);
    const cands = [];
    qs.forEach((q, qi) => T.vars.forEach(V => { if (V.id in vals) return; const okDim = V.dim === q.dim || (V.dim === "none" && q.dim === "none") || (V.alt || []).includes(q.dim); if (!okDim) return;
      const ctx = q.before.split(/[.;!?]/).pop().slice(-60) + " | " + q.after.slice(0, 20); let s = 1, hit = 0; (V.kw || []).forEach(k => { if (ctx.includes(k)) { s += 3 + (q.before.slice(-25).includes(k) ? 2 : 0); hit++; } }); if (q.dim !== "none") s += 2; if ((V.notkw || []).some(k => ctx.includes(k))) s -= 4; if (V.id === asked) s -= 6;
      cands.push({ qi, id: V.id, s, hit, ord: !!V.ord }); }));
    cands.sort((a, b) => b.s - a.s);
    const take = c => { const q = qs[c.qi], V = T.vars.find(x => x.id === c.id); let x = q.v; if (q.unit && V.unit && q.dim === V.dim) x = conv(q.v, q.unit, V.unit); vals[c.id] = x; units[c.id] = q.unit || V.unit; usedQ.add(c.qi); };
    /* 1: numbers whose wording clearly names a non-numbered quantity */
    cands.forEach(c => { if (usedQ.has(c.qi) || c.id in vals || !c.hit || c.s < 4) return; if (c.ord) { const V = T.vars.find(x => x.id === c.id), q = qs[c.qi]; if (!(V.kw || []).some(k => q.before.slice(-22).includes(k))) return; } const best = cands.filter(o => o.qi === c.qi && !(o.id in vals)).sort((a, b) => b.s - a.s)[0]; if (best && best.id !== c.id && best.s > c.s) return; take(c); });
    /* 2: numbered pairs (P1/P2, m1/m2 …): same-type numbers are taken in reading order */
    const ordDims = [...new Set(T.vars.filter(V => V.ord).map(V => V.dim))];
    ordDims.forEach(d => { const slots = T.vars.filter(V => V.ord && V.dim === d && !(V.id in vals)).sort((a, b) => a.ord - b.ord); const qd = qs.map((q, i) => [q, i]).filter(([q, i]) => (q.dim === d || slots.some(V => (V.alt || []).includes(q.dim))) && !usedQ.has(i));
      if (!slots.length || !qd.length) return;
      let si = 0; qd.forEach(([q, i]) => { while (si < slots.length && (slots[si].id === asked && qd.length < slots.length)) si++; if (si >= slots.length) return; const V = slots[si++]; vals[V.id] = q.unit && V.unit && q.dim === V.dim ? conv(q.v, q.unit, V.unit) : q.v; units[V.id] = q.unit || V.unit; usedQ.add(i); }); });
    /* 3: everything else by best score */
    cands.forEach(c => { if (usedQ.has(c.qi) || c.id in vals || c.s < 1 || c.ord) return; take(c); });
    const leftovers = qs.filter((_, i) => !usedQ.has(i));
    return { vals, units, qs, leftovers }; }
  function detectFind(T, text, vals, strict) {
    const lt = text.toLowerCase(), sents = lt.split(/(?<=[.?!])\s+/); const asks = sents.filter(s => /\?|find|calculate|work out|determine|what is|what's|how (far|long|fast|high|much|many|big|tall|deep|heavy)|show that|estimate/.test(s)); if (!asks.length) asks.push(sents[sents.length - 1] || "");
    let best = null, bs = 0; if (!best) { const sm = text.match(/\b(?:find|calculate|determine|work out|what is|solve for)\s+(?:the\s+)?(?:value of\s+)?([A-Za-zα-ωθλμρη])\s*(?:[.?!,]|$)/i); if (sm) { const V = T.vars.find(V => !(V.id in vals) && (V.sym === sm[1] || V.id === sm[1])); if (V) best = V.id; } } if (!best) for (const ask of asks) { const hits = []; T.vars.forEach(V => { if (V.id in vals || V.input) return; let bestHit = null; (V.ask || (strict ? [] : V.kw) || []).forEach(k => { if (k.length <= 3 && !new RegExp("(^|[^a-z])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)").test(ask)) return; let i = ask.indexOf(k); while (i >= 0) { const after = ask.slice(i + k.length).match(/^\s*(?:of|is|=|:|at|about|by|was)?\s*[$£€₹]?(-?\d[\d.,]*)\s*([^\s,.?;]*)/); const u = after && after[2] ? unitOf(after[2]) : null; const describes = after && (u ? u[0] === V.dim : V.dim === "none"); if (!describes) { if (!bestHit || i < bestHit.pos || (i === bestHit.pos && k.length > bestHit.len)) bestHit = { pos: i, len: k.length, end: i + k.length }; break; } i = ask.indexOf(k, i + 1); } }); if (bestHit) hits.push({ id: V.id, ...bestHit }); });
      if (hits.length) { hits.sort((a, b) => a.pos - b.pos); let pick = hits[0]; hits.forEach(h => { if (h !== pick && h.pos < pick.end && h.end > pick.pos && h.len > pick.len) pick = h; }); best = pick.id; } if (best) break; }
    detectFind.matched = !!best; if (!best) best = (T.finds || []).find(id => !(id in vals)) || T.vars.find(V => !(V.id in vals) && !V.input)?.id; return best; }

  return { pretty, G, NA, R_L, sind, cosd, tand, asind, acosd, atand, rad, deg, U, unitOf, conv, fmt, fmtU, sup, quantities, words, hasKw, solveGeneric, stepLines, assign, detectFind, symOf, swapIds, valStr, DIM_BASE, DIM_NAME, gauss };
})();
if (typeof module !== "undefined") module.exports = SV;
