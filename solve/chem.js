/* ===================== Solve it: chemistry data & helpers ===================== */
const CH = (function () {
  const RAW = "H,Hydrogen,1.008;He,Helium,4.003;Li,Lithium,6.94;Be,Beryllium,9.012;B,Boron,10.81;C,Carbon,12.01;N,Nitrogen,14.01;O,Oxygen,16.00;F,Fluorine,19.00;Ne,Neon,20.18;Na,Sodium,22.99;Mg,Magnesium,24.31;Al,Aluminium,26.98;Si,Silicon,28.09;P,Phosphorus,30.97;S,Sulfur,32.06;Cl,Chlorine,35.45;Ar,Argon,39.95;K,Potassium,39.10;Ca,Calcium,40.08;Sc,Scandium,44.96;Ti,Titanium,47.87;V,Vanadium,50.94;Cr,Chromium,52.00;Mn,Manganese,54.94;Fe,Iron,55.85;Co,Cobalt,58.93;Ni,Nickel,58.69;Cu,Copper,63.55;Zn,Zinc,65.38;Ga,Gallium,69.72;Ge,Germanium,72.63;As,Arsenic,74.92;Se,Selenium,78.97;Br,Bromine,79.90;Kr,Krypton,83.80;Rb,Rubidium,85.47;Sr,Strontium,87.62;Y,Yttrium,88.91;Zr,Zirconium,91.22;Nb,Niobium,92.91;Mo,Molybdenum,95.95;Tc,Technetium,98;Ru,Ruthenium,101.07;Rh,Rhodium,102.91;Pd,Palladium,106.42;Ag,Silver,107.87;Cd,Cadmium,112.41;In,Indium,114.82;Sn,Tin,118.71;Sb,Antimony,121.76;Te,Tellurium,127.60;I,Iodine,126.90;Xe,Xenon,131.29;Cs,Caesium,132.91;Ba,Barium,137.33;La,Lanthanum,138.91;Ce,Cerium,140.12;Pr,Praseodymium,140.91;Nd,Neodymium,144.24;Pm,Promethium,145;Sm,Samarium,150.36;Eu,Europium,151.96;Gd,Gadolinium,157.25;Tb,Terbium,158.93;Dy,Dysprosium,162.50;Ho,Holmium,164.93;Er,Erbium,167.26;Tm,Thulium,168.93;Yb,Ytterbium,173.05;Lu,Lutetium,174.97;Hf,Hafnium,178.49;Ta,Tantalum,180.95;W,Tungsten,183.84;Re,Rhenium,186.21;Os,Osmium,190.23;Ir,Iridium,192.22;Pt,Platinum,195.08;Au,Gold,196.97;Hg,Mercury,200.59;Tl,Thallium,204.38;Pb,Lead,207.2;Bi,Bismuth,208.98;Po,Polonium,209;At,Astatine,210;Rn,Radon,222;Fr,Francium,223;Ra,Radium,226;Ac,Actinium,227;Th,Thorium,232.04;Pa,Protactinium,231.04;U,Uranium,238.03";
  const EL = {}, BYNAME = {}, BYZ = [];
  RAW.split(";").forEach((r, i) => { const [s, n, m] = r.split(","); EL[s] = { s, name: n, mass: +m, Z: i + 1 }; BYNAME[n.toLowerCase()] = s; BYZ[i + 1] = EL[s]; });
  BYNAME.aluminum = "Al"; BYNAME.sulphur = "S"; BYNAME.cesium = "Cs";
  const NAMES = { "water": "H2O", "carbon dioxide": "CO2", "carbon monoxide": "CO", "oxygen gas": "O2", "oxygen": "O2", "hydrogen gas": "H2", "hydrogen": "H2", "nitrogen gas": "N2", "nitrogen": "N2", "chlorine gas": "Cl2", "glucose": "C6H12O6", "sucrose": "C12H22O11", "ammonia": "NH3", "methane": "CH4", "ethane": "C2H6", "propane": "C3H8", "butane": "C4H10", "ethanol": "C2H5OH", "sodium chloride": "NaCl", "salt": "NaCl", "sodium hydroxide": "NaOH", "potassium hydroxide": "KOH", "calcium carbonate": "CaCO3", "calcium oxide": "CaO", "calcium hydroxide": "Ca(OH)2", "hydrochloric acid": "HCl", "sulfuric acid": "H2SO4", "sulphuric acid": "H2SO4", "nitric acid": "HNO3", "magnesium oxide": "MgO", "iron oxide": "Fe2O3", "copper sulfate": "CuSO4", "copper sulphate": "CuSO4", "sodium carbonate": "Na2CO3", "sodium bicarbonate": "NaHCO3", "baking soda": "NaHCO3", "hydrogen peroxide": "H2O2", "sulfur dioxide": "SO2", "potassium chloride": "KCl", "silver nitrate": "AgNO3", "magnesium": "Mg", "sodium": "Na", "iron": "Fe", "zinc": "Zn", "copper": "Cu", "aluminium": "Al", "aluminum": "Al", "calcium": "Ca", "carbon": "C", "sulfur": "S" };

  /* "Ca(OH)2·5H2O" -> {Ca:1,O:7,H:12} */
  function parse(f) {
    f = String(f).replace(/[₀-₉]/g, d => "₀₁₂₃₄₅₆₇₈₉".indexOf(d)).replace(/\s/g, "").replace(/[\^]?\d*[+-]$/, "").replace(/\[/g, "(").replace(/\]/g, ")");
    const parts = f.split(/[·.*•]/); const tot = {};
    for (let p of parts) { let mult = 1; const mm = p.match(/^(\d+)(.*)$/); if (mm) { mult = +mm[1]; p = mm[2]; } const c = group(p); if (!c) return null; for (const k in c) tot[k] = (tot[k] || 0) + c[k] * mult; }
    return Object.keys(tot).length ? tot : null;
    function group(s) { const st = [{}]; let i = 0;
      while (i < s.length) { const ch = s[i];
        if (ch === "(") { st.push({}); i++; }
        else if (ch === ")") { i++; let n = ""; while (/\d/.test(s[i] || "")) n += s[i++]; const top = st.pop(); if (!st.length) return null; const k = n ? +n : 1; for (const e in top) st[st.length - 1][e] = (st[st.length - 1][e] || 0) + top[e] * k; }
        else if (/[A-Z]/.test(ch)) { let sym = ch; i++; if (/[a-z]/.test(s[i] || "") && EL[sym + s[i]]) { sym += s[i]; i++; } if (!EL[sym]) return null; let n = ""; while (/\d/.test(s[i] || "")) n += s[i++]; st[st.length - 1][sym] = (st[st.length - 1][sym] || 0) + (n ? +n : 1); }
        else return null; }
      return st.length === 1 ? st[0] : null; } }
  const molar = c => Object.entries(c).reduce((s, [e, n]) => s + EL[e].mass * n, 0);
  const pretty = f => String(f).replace(/(\d+)/g, (m, d, off, str) => off > 0 && /[A-Za-z)\]]/.test(str[off - 1]) ? d.split("").map(x => "₀₁₂₃₄₅₆₇₈₉"[x]).join("") : d);
  /* find chemical formulas in text: tokens that parse and contain a capital letter */
  function formulas(text) { const out = []; const re = /(?<![A-Za-z])((?:\d?\(?[A-Z][a-z]?\d*\)?\d*)+(?:[·.][\d]*(?:[A-Z][a-z]?\d*)+)?)(?![a-z])/g; let m;
    while ((m = re.exec(text))) { const t = m[1]; if (!/[A-Z]/.test(t)) continue; if (/^[A-Z]$/.test(t) && !/^(C|H|O|N|S|P|K|I|F|B|U|V|W|Y)$/.test(t)) continue; const c = parse(t.replace(/^\d+/, "")); if (c) out.push({ f: t.replace(/^\d+(?=[A-Z(])/, ""), coef: (t.match(/^(\d+)(?=[A-Z(])/) || [])[1], index: m.index, c }); }
    return out; }
  function nameToFormula(text) { let t = text; Object.keys(NAMES).sort((a, b) => b.length - a.length).forEach(n => { t = t.replace(new RegExp("\\b" + n + "\\b", "gi"), NAMES[n]); }); return t; }

  /* ---------- exact fractions for balancing ---------- */
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  const lcm = (a, b) => a / gcd(a, b) * b;
  const F = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return [n / g, d / g]; };
  const fadd = (a, b) => F(a[0] * b[1] + b[0] * a[1], a[1] * b[1]), fsub = (a, b) => F(a[0] * b[1] - b[0] * a[1], a[1] * b[1]), fmul = (a, b) => F(a[0] * b[0], a[1] * b[1]), fdiv = (a, b) => F(a[0] * b[1], a[1] * b[0]);
  function balance(eqText) {
    const t = eqText.replace(/⟶|→|-+>|=+>|⇌|<->|=/g, "→"); if (!t.includes("→")) return null;
    const [l, r] = t.split("→"); const side = s => s.split(/\s\+\s|\s\+|\+\s|(?<=[\da-z)])\+(?=\s*\d*[A-Z(])/).map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(\d*)\s*(.+?)(\((s|l|g|aq)\))?$/); return { raw: m[2], c: parse(m[2]) }; });
    const L = side(l), R = side(r); if (!L.length || !R.length || [...L, ...R].some(x => !x.c)) return null;
    const sp = [...L, ...R], els = [...new Set(sp.flatMap(x => Object.keys(x.c)))];
    const A = els.map(e => sp.map((x, j) => F((x.c[e] || 0) * (j < L.length ? 1 : -1))));
    /* RREF */
    const rows = A.length, cols = sp.length; let piv = [], r0 = 0;
    for (let c = 0; c < cols && r0 < rows; c++) { let p = -1; for (let i = r0; i < rows; i++) if (A[i][c][0] !== 0) { p = i; break; } if (p < 0) continue; [A[r0], A[p]] = [A[p], A[r0]]; const pv = A[r0][c]; A[r0] = A[r0].map(x => fdiv(x, pv));
      for (let i = 0; i < rows; i++) if (i !== r0 && A[i][c][0] !== 0) { const f = A[i][c]; A[i] = A[i].map((x, k) => fsub(x, fmul(f, A[r0][k]))); } piv.push(c); r0++; }
    const free = [...Array(cols).keys()].filter(c => !piv.includes(c)); if (!free.length) return null;
    const x = new Array(cols).fill(null); free.forEach(c => x[c] = F(1)); piv.forEach((c, i) => { let s = F(0); free.forEach(fc => s = fsub(s, A[i][fc])); x[c] = s; });
    if (x.some(v => v[0] <= 0)) return null;
    const den = x.reduce((a, v) => lcm(a, v[1]), 1); let ints = x.map(v => v[0] * den / v[1]); const g = ints.reduce((a, b) => gcd(a, b)); ints = ints.map(v => v / g);
    return { L, R, coef: ints, els, multi: free.length > 1, text: L.map((s, i) => (ints[i] > 1 ? ints[i] : "") + pretty(s.raw)).join(" + ") + " → " + R.map((s, i) => (ints[L.length + i] > 1 ? ints[L.length + i] : "") + pretty(s.raw)).join(" + ") };
  }
  /* electron configuration */
  const ORB = ["1s", "2s", "2p", "3s", "3p", "4s", "3d", "4p", "5s", "4d", "5p", "6s", "4f", "5d", "6p", "7s", "5f", "6d", "7p"], CAP = { s: 2, p: 6, d: 10, f: 14 };
  const EXC = { 24: { "4s": 1, "3d": 5 }, 29: { "4s": 1, "3d": 10 }, 42: { "5s": 1, "4d": 5 }, 47: { "5s": 1, "4d": 10 }, 46: { "5s": 0, "4d": 10 }, 79: { "6s": 1, "5d": 10 } };
  function config(Z, electrons) { let e = electrons == null ? Z : electrons; const fill = {}; let left = Z; for (const o of ORB) { if (left <= 0) break; const k = Math.min(CAP[o[1]], left); fill[o] = k; left -= k; } if (EXC[Z]) Object.assign(fill, EXC[Z]);
    let diff = Z - e; if (diff > 0) { const order = Object.keys(fill).filter(o => fill[o] > 0).sort((a, b) => (+b[0] - +a[0]) || ("spdf".indexOf(b[1]) - "spdf".indexOf(a[1]))); for (const o of order) { while (diff > 0 && fill[o] > 0) { fill[o]--; diff--; } } }
    else if (diff < 0) { let add = -diff; for (const o of ORB) { const room = CAP[o[1]] - (fill[o] || 0); if (room > 0) { const k = Math.min(room, add); fill[o] = (fill[o] || 0) + k; add -= k; } if (!add) break; } }
    const list = ORB.filter(o => fill[o] > 0).map(o => [o, fill[o]]); const shells = []; list.forEach(([o, n]) => shells[+o[0] - 1] = (shells[+o[0] - 1] || 0) + n);
    return { list, text: list.map(([o, n]) => o + String(n).split("").map(x => "⁰¹²³⁴⁵⁶⁷⁸⁹"[x]).join("")).join(" "), shells: Array.from(shells, x => x || 0) }; }
  return { EL, BYNAME, BYZ, NAMES, parse, molar, pretty, formulas, nameToFormula, balance, config, gcd, lcm };
})();
if (typeof module !== "undefined") module.exports = CH;
