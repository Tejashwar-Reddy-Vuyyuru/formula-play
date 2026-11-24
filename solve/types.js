/* ===================== Solve it: formula-based problem types ===================== */
const ST = (function (SV) {
  const SC = { sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow, log10: Math.log10, ln: Math.log, exp: Math.exp, PI: Math.PI, pi: Math.PI,
    sin: SV.sind, cos: SV.cosd, tan: SV.tand, asin: SV.asind, acos: SV.acosd, atan: SV.atand, mx: Math.max, mn: Math.min, floor: Math.floor, round: Math.round };
  const cache = {};
  function cmp(expr) { if (cache[expr]) return cache[expr]; const js = expr.replace(/\^/g, "**"); const f = new Function("S", "V", "with(S){with(V){return (" + js + ");}}"); cache[expr] = (v) => f(SC, v); return cache[expr]; }
  /* E(lhs, rhs, {other: rearranged}) — one equation, with the forms already rearranged for each unknown */
  function E(lhs, rhs, forms) { return { lhs, rhs, forms: Object.assign({ [lhs]: rhs }, forms || {}) }; }
  function build(T) {
    const ids = T.vars.map(v => v.id).concat(Object.keys(T.consts || {}));
    const idsIn = s => ids.filter(id => new RegExp("(?<![A-Za-z0-9_])" + id + "(?![A-Za-z0-9_])").test(s));
    T.eqs = T.eqs.map(e => { const vars = [...new Set([e.lhs, ...idsIn(e.rhs)])].filter(id => T.vars.some(v => v.id === id)); const fr = cmp(e.rhs), fl = v => v[e.lhs];
      const forms = {}; Object.entries(e.forms).forEach(([k, ex]) => { const fn = cmp(ex); forms[k] = [ex, v => fn(Object.assign({}, T.consts || {}, v))]; });
      return { vars, forms, cond: e.cond, text: e.lhs + " = " + e.rhs, f: v => { const V = Object.assign({}, T.consts || {}, v); return fl(V) - fr(V); } }; });
    T.vars.forEach(v => { v.sym = v.sym || v.id; v.kw = v.kw || []; });
    T.generic = true; return T; }
  const V = (id, sym, label, unit, dim, kw, extra) => Object.assign({ id, sym, label, unit, dim, kw: kw || [] }, extra || {});

  const L = [];
  /* ============================ PHYSICS ============================ */
  L.push(build({ id: "speed", subj: "physics", name: "Speed, distance & time", icon: "🚗", draw: "road",
    kw: ["speed", "distance", "travels", "travel", "average speed", "how far", "how long", "km/h", "mph", "journey", "walks", "runs", "drives", "covers"],
    vars: [V("d", "d", "Distance", "m", "length", ["distance", "travels", "covers", "far", "goes", "walks", "runs"], { ask: ["how far", "distance", "displacement", "where is it"] }), V("t", "t", "Time", "s", "time", ["in", "takes", "for", "time"], { ask: ["how long", "time"] }), V("v", "v", "Speed", "m/s", "speed", ["speed", "at", "velocity"], { ask: ["speed", "how fast", "velocity"], also: [["km/h"]] })],
    detect(t) { const q = SV.quantities(t); return q.filter(x => x.dim === "speed").length >= 2 || q.some(x => x.dim === "accel") ? -8 : 0; },
    eqs: [E("d", "v*t", { v: "d/t", t: "d/v" })], finds: ["v", "d", "t"],
    idea: "Speed tells you how much distance is covered each second, so distance = speed × time.",
    alt: "Use a ratio: if the car covers the distance in that time, scale it to 1 second (or 1 hour) to read off the speed.",
    mistakes: ["Mixing km with metres or hours with seconds: convert first.", "Average speed is total distance ÷ total time, not the average of two speeds."],
    ex: "A car travels 150 km in 2.5 hours. Find its average speed." }));

  L.push(build({ id: "suvat", subj: "physics", name: "Constant acceleration (suvat)", icon: "🏁", draw: "road",
    kw: ["accelerat", "decelerat", "from rest", "initial velocity", "final velocity", "uniform", "brakes", "comes to rest", "stops", "dropped", "falls", "free fall", "thrown up", "thrown upward", "m/s2", "m/s²", "speeds up", "slows"],
    vars: [V("u", "u", "Start speed", "m/s", "speed", ["initial", "starts", "from", "at first", "moving at", "travelling at", "traveling at", "thrown", "launched", "projected", "fired", "kicked", "up at", "leaves", "hits the ground at", "going"], { ask: ["initial speed", "initial velocity", "starting speed", "launch speed", "takeoff speed", "take-off speed", "launch velocity", "what speed is needed", "speed needed"] }), V("v", "v", "Final speed", "m/s", "speed", ["final", "reaches", "to", "until", "hits"], { ask: ["final speed", "final velocity", "how fast", "speed at", "speed when", "velocity when", "reaches", "hits the ground", "hits the water", "muzzle velocity", "muzzle speed", "its velocity", "its speed"] }),
      V("a", "a", "Acceleration", "m/s²", "accel", ["accelerat", "decelerat", "rate"], { ask: ["acceleration", "deceleration"] }), V("t", "t", "Time", "s", "time", ["for", "in", "after", "takes"], { ask: ["how long", "time", "when"] }), V("s", "s", "Distance", "m", "length", ["distance", "travels", "covers", "height", "high", "metres", "drop", "over", "stopped over", "in"], { ask: ["how far", "distance", "how high", "height", "stopping distance", "displacement", "where is it", "position"] })],
    eqs: [E("v", "u+a*t", { u: "v-a*t", a: "(v-u)/t", t: "(v-u)/a" }), E("s", "(u+v)/2*t", { t: "2*s/(u+v)", u: "2*s/t-v", v: "2*s/t-u" }), E("v", "sqrt(mx(0,u^2+2*a*s))", { u: "sqrt(mx(0,v^2-2*a*s))", a: "(v^2-u^2)/(2*s)", s: "(v^2-u^2)/(2*a)" }), E("s", "u*t+0.5*a*t^2", { a: "2*(s-u*t)/t^2", u: "(s-0.5*a*t^2)/t" })],
    phrases: [{ re: /from rest|starts at rest|starting from rest|in the barrel|muzzle|released|is dropped|dropped from|falls from|drops from|\bdrops?\b|falls? off|let go of|after falling|falling from|falls \d|falls from/, set: { u: 0 } }, { re: /\bto rest\b|comes to (a )?(rest|stop|halt)|to a (halt|stop)|\bstops\b|\bstopped\b|brakes to|brought to rest|stopping distance/, set: { v: 0 } }, { re: /dropped|\bdrops?\b|falls|falling|free fall|freely|thrown (straight )?up|vertically|falls? off|\bjumps?\b|\bleaps?\b|straight up|leaves the (water|ground|floor)|from a [\d.]+ ?m (bridge|cliff|building|roof|tower|balcony)|from the top of/, set: { a: 9.81 } }],
    detect(t) { if (/slope|incline|ramp\b|hill/i.test(t) && SV.quantities(t).some(q => q.dim === "angle")) return -10; return /thrown (straight |vertically )?up|straight up|vertically|is dropped|dropped from|\bdrops?\b|falls? (from|off)|free.?fall|from rest|comes to rest|brakes|decelerat|hits the (floor|ground|water)|\bjumps?\b|\bleaps?\b|muzzle|barrel|takeoff speed|take-off speed/i.test(t) ? 12 : 0; },
    post(vals, text) { if (/decelerat|slows|brak/.test(text) && vals.a > 0) vals.a = -vals.a; if (/thrown (straight |vertically )?up|vertically up|upward|projected up|launched up|\bjumps?\b|\bleaps?\b|straight up|leaves the (water|ground|floor)/.test(text) && vals.a > 0) { vals.a = -vals.a; if ("v" in vals && !("u" in vals)) { vals.u = vals.v; delete vals.v; } if (!("v" in vals) && /how high|maximum height|highest|top|launch speed|takeoff speed|take-off speed|jump [\d.]+ ?m|jumps? [\d.]+ ?m|[\d.]+ ?m high/.test(text)) vals.v = 0; } },
    finds: ["v", "s", "t", "a"],
    idea: "With steady acceleration, speed changes by the same amount every second, so a handful of equations link start speed, end speed, acceleration, time and distance.",
    alt: "Draw a speed–time graph: the slope is the acceleration and the area under the line is the distance.",
    mistakes: ["Deceleration means a is negative.", "'From rest' means u = 0; 'comes to rest' means v = 0.", "Pick the equation that leaves out the quantity you don't know and weren't asked for."],
    ex: "A car accelerates from rest at 3 m/s² for 6 s. How far does it travel?" }));

  L.push(build({ id: "projectile", subj: "physics", name: "Projectiles", icon: "🏀", draw: "projectile",
    kw: ["projectile", "thrown", "launched", "kicked", "fired", "angle", "horizontally", "range", "lands", "maximum height", "cliff", "trajectory", "cannon", "target", "firing", "launch speed"],
    vars: [V("v0", "v₀", "Launch speed", "m/s", "speed", ["at", "speed", "velocity", "launched", "thrown", "kicked"], { guess: 15, ask: ["launch speed", "initial speed", "what speed", "how fast must", "speed is needed", "velocity is needed", "initial velocity"] }), V("th", "θ", "Launch angle", "°", "angle", ["angle", "at"], { guess: 40 }), V("h0", "h₀", "Launch height", "m", "length", ["high", "height", "cliff", "table", "tall", "above", "from"], { def: 0 }),
      V("T", "T", "Flight time", "s", "time", ["time"], { ask: ["how long", "time", "flight time", "in the air"] }), V("R", "R", "Range", "m", "length", ["range", "lands", "away"], { ask: ["how far", "range", "distance", "lands", "horizontal"] }), V("H", "H", "Highest point", "m", "length", ["max"], { ask: ["maximum height", "how high", "highest", "max height", "peak"] })],
    consts: { g: 9.81 },
    post(vals) { if (vals.th > 90 || vals.th < -90) vals.v0 = NaN; },
    eqs: [E("T", "(v0*sin(th)+sqrt((v0*sin(th))^2+2*g*h0))/g"), E("R", "v0*cos(th)*T", { v0: "R/(cos(th)*T)" }), E("H", "h0+(v0*sin(th))^2/(2*g)")],
    phrases: [{ re: /horizontally|rolls? off|slides? off|runs? off/, set: { th: 0 } }],
    detect(t) { return /horizontally|at an angle|° (above|to) the (horizontal|ground)|rolls? off|off (a|the) (table|cliff|edge|roof|building|ledge)|projectile/i.test(t) ? 16 : (!SV.quantities(t).some(q => q.dim === "angle") && /straight up|vertical|jumps?\b|leaps?\b/i.test(t) ? -12 : 0); },
    finds: ["R", "T", "H"],
    idea: "Sideways and up-down motion are independent: sideways speed stays the same, while gravity slows the rise and speeds the fall.",
    alt: "Split v₀ into v₀cosθ (sideways) and v₀sinθ (up). Find the time in the air from the vertical motion, then range = sideways speed × time.",
    mistakes: ["Using the full speed instead of its sideways or upward part.", "Forgetting the launch height: from a cliff the ball is in the air longer.", "Calculator in radians when the angle is in degrees."],
    ex: "A ball is kicked at 20 m/s at 35° above the ground. How far does it travel before landing?" }));

  L.push(build({ id: "force", subj: "physics", name: "Force, mass & acceleration", icon: "📦", draw: "block",
    kw: ["force", "newton", "net force", "push", "pull", "f=ma", "weight", "resultant", "mass of"],
    vars: [V("F", "F", "Net force", "N", "force", ["net", "resultant"], { ask: ["net force", "resultant force", "force", "push", "pull"] }), V("m", "m", "Mass", "kg", "mass", ["mass", "block", "car", "box", "a"], { ask: ["mass"] }), V("a", "a", "Acceleration", "m/s²", "accel", ["accelerat", "decelerat"], { ask: ["acceleration", "accelerate", "deceleration"] }), V("W", "W", "Weight", "N", "force", ["weight", "weighs"], { ask: ["weight"] }),
      V("Ff", "F_f", "Friction / resisting force", "N", "force", ["friction", "resist", "drag", "air resistance"]), V("Fa", "F_app", "Applied force", "N", "force", ["applies", "applied", "pushes with", "pulls with", "thrust", "engine"], { ask: ["force exerted by the person", "force does the person", "applied force", "force applied", "force must", "force of the engine", "push force", "pushing force", "magnitude of the force exerted", "force by the person", "force the person"] }),
      V("u", "u", "Start speed", "m/s", "speed", ["from", "at first", "initially", "moving at"], { ord: 1 }), V("v", "v", "End speed", "m/s", "speed", ["to", "reaches"], { ord: 2 }), V("t", "t", "Time", "s", "time", ["in", "for", "over"])],
    consts: { g: 9.81 },
    phrases: [{ re: /from rest|at rest/, set: { u: 0 } }, { re: /\bstops?\b|\bstopped\b|to rest|to a stop/, set: { v: 0 } }],
    detect(t) { const q = SV.quantities(t), lt = t.toLowerCase(), ask = lt.slice(Math.max(0, lt.search(/what|find|calculate|how (much|big)/))); return q.some(x => x.dim === "mass") && /\bforce\b|weight|newtons?\b/.test(ask) ? 14 : 0; },
    eqs: [E("F", "m*a", { m: "F/a", a: "F/m" }), E("W", "m*g", { m: "W/g" }), Object.assign(E("Fa", "F+Ff", { F: "Fa-Ff", Ff: "Fa-F" }), { cond: /friction|resist|drag/ }), E("a", "(v-u)/t", { v: "u+a*t", u: "v-a*t", t: "(v-u)/a" })],
    finds: ["a", "F", "m", "W"],
    idea: "Newton's second law: the bigger the net force, the bigger the acceleration; the heavier the object, the smaller it.",
    alt: "Think per kilogram: a force of F newtons shared over m kilograms gives each kilogram F/m of push, which is its acceleration.",
    mistakes: ["Use the net (resultant) force, after subtracting friction or opposing forces.", "Weight is a force in newtons (m × g); mass is in kilograms."],
    ex: "A 1200 kg car is pushed with a net force of 3000 N. What is its acceleration?" }));

  L.push(build({ id: "ramp", subj: "physics", name: "Slopes & friction", icon: "⛰️", draw: "ramp",
    kw: ["slope", "incline", "ramp", "inclined plane", "slides down", "friction", "coefficient", "μ"],
    detect(t) { return /slope|incline|ramp\b|hill/i.test(t) && SV.quantities(t).some(q => q.dim === "angle") && /slide|friction|speed|accelerat|how fast|bottom|rolls|sled|block|box|coin/i.test(t) ? 14 : 0; },
    phrases: [{ re: /constant (speed|velocity)|steady speed|uniform (speed|velocity)/, set: { a: 0 } }],
    vars: [V("th", "θ", "Slope angle", "°", "angle", ["angle", "inclined", "at"]), V("mu", "μ", "Friction coefficient", "", "none", ["friction", "coefficient", "μ", "mu"], { def: 0, ask: ["coefficient of friction", "coefficient of kinetic friction", "friction coefficient", "μ"] }), V("Ls", "L", "Slope length", "m", "length", ["long", "length", "down", "slides"], { ask: ["how far"] }),
      V("a", "a", "Acceleration", "m/s²", "accel", ["accelerat"], { ask: ["acceleration"] }), V("v", "v", "Speed at the bottom", "m/s", "speed", ["speed"], { ask: ["speed", "how fast", "velocity"] }), V("t", "t", "Time to the bottom", "s", "time", ["time"], { ask: ["how long", "time"] })],
    consts: { g: 9.81 },
    eqs: [E("a", "g*(sin(th)-mu*cos(th))", { mu: "(sin(th)-a/g)/cos(th)", th: "asin(a/g)" }), E("v", "sqrt(mx(0,2*a*Ls))", { Ls: "v^2/(2*a)", a: "v^2/(2*Ls)" }), E("Ls", "0.5*a*t^2", { t: "sqrt(2*Ls/a)", a: "2*Ls/t^2" })],
    finds: ["v", "a", "t"],
    idea: "On a slope only part of gravity pulls along the surface (g sin θ), and friction takes away μ g cos θ.",
    alt: "Use energy: height lost = L sin θ; speed at the bottom from ½v² = g·L·(sin θ − μ cos θ).",
    mistakes: ["Using g instead of g sin θ.", "Friction depends on cos θ, not sin θ.", "If μ is bigger than tan θ the block doesn't slide at all."],
    ex: "A box slides 5 m down a 30° slope with friction coefficient 0.2. How fast is it going at the bottom?" }));

  L.push(build({ id: "workpower", subj: "physics", name: "Work & power", icon: "🏋️", draw: "work",
    kw: ["work done", "work", "power", "watt", "joule", "lifts", "pushes", "efficiency", "rate of doing work"],
    vars: [V("F", "F", "Force", "N", "force", ["force", "with", "of"]), V("d", "d", "Distance moved", "m", "length", ["distance", "through", "moves", "lifts", "height", "over", "gaining", "raises", "climbs"]), V("W", "W", "Work done (energy)", "J", "energy", ["work", "energy", "uses"], { ask: ["work done", "work", "energy"] }), V("m", "m", "Mass", "kg", "mass", ["mass", "a"]), V("v", "v", "Final speed", "m/s", "speed", ["to", "reaches"]),
      V("t", "t", "Time", "s", "time", ["in", "takes", "time"], { ask: ["how long", "time"] }), V("P", "P", "Power", "W", "power", ["power", "motor", "rated"], { ask: ["power"] })],
    eqs: [E("W", "F*d", { F: "W/d", d: "W/F" }), E("P", "W/t", { W: "P*t", t: "W/P" }), Object.assign(E("F", "m*g", { m: "F/g" }), { cond: /lift|climb|raise|gravity|hoist|stairs|up to|upward/ }), Object.assign(E("W", "0.5*m*v^2", { v: "sqrt(2*W/m)", m: "2*W/v^2" }), { cond: /from rest|accelerat|speeds? up|reach/ })],
    consts: { g: 9.81 },
    phrases: [{ re: /\b(yearly|per year|a year|each year|annual|in a year|in one year)\b/, set: { t: 31536000 } }],
    finds: ["W", "P", "t"],
    idea: "Work is force × distance moved in the direction of the force; power is how fast that work is done.",
    alt: "Power can also be found directly as P = F × v, force times speed.",
    mistakes: ["Only the distance along the force counts.", "Power in watts needs time in seconds.", "1 kW = 1000 W, 1 kJ = 1000 J."],
    ex: "A crane lifts a load with a force of 5000 N through 12 m in 20 s. What is its power?" }));

  L.push(build({ id: "energy", subj: "physics", name: "Kinetic & potential energy", icon: "🎢", draw: "energy",
    kw: ["kinetic energy", "potential energy", "gravitational potential", "gpe", "ke", "dropped", "height", "falls", "energy", "swing", "pendulum"],
    vars: [V("m", "m", "Mass", "kg", "mass", ["mass", "a", "of"]), V("h", "h", "Height", "m", "length", ["height", "high", "from", "drop", "falls", "raised", "lifted"], { ask: ["how high", "height"] }), V("v", "v", "Speed", "m/s", "speed", ["speed", "at", "moving", "velocity"], { ask: ["speed", "how fast", "velocity"] }),
      V("PE", "Eₚ", "Potential energy", "J", "energy", ["potential", "gpe", "stored"], { ask: ["potential energy", "gpe", "gravitational"] }), V("KE", "Eₖ", "Kinetic energy", "J", "energy", ["kinetic", "ke"], { ask: ["kinetic energy", "ke", "kinetic"] })],
    consts: { g: 9.81 },
    eqs: [E("PE", "m*g*h", { m: "PE/(g*h)", h: "PE/(m*g)" }), E("KE", "0.5*m*v^2", { m: "2*KE/v^2", v: "sqrt(2*KE/m)" }), Object.assign(E("v", "sqrt(2*g*h)", { h: "v^2/(2*g)" }), { cond: /dropped|\bdrops?\b|falls|fall from|released|slides down|swings down|reaches the (bottom|ground|floor)|hits the (ground|floor|water)|roller|from rest/ })],
    finds: ["KE", "PE", "v"],
    idea: "Height stores energy (m g h); speed carries energy (½ m v²). When something falls, height energy turns into speed energy.",
    alt: "For a fall with no air resistance the mass cancels: v = √(2 g h).",
    mistakes: ["Forgetting to square the speed.", "Using grams instead of kilograms.", "Kinetic energy depends on v², so doubling speed gives 4× the energy."],
    ex: "A 2 kg ball is dropped from 10 m. How fast is it moving just before it hits the ground?" }));

  L.push(build({ id: "momentum", subj: "physics", name: "Momentum & collisions", icon: "🎱", draw: "collide",
    kw: ["momentum", "collide", "collision", "collides", "stick together", "sticks to", "crash", "recoil", "trolley", "coupled", "couple together", "joined", "catches", "is caught by", "stays on", "cling together", "move off together"],
    vars: [V("m1", "m₁", "Mass 1", "kg", "mass", [], { ord: 1 }), V("u1", "u₁", "Speed 1 before", "m/s", "speed", [], { ord: 1 }), V("m2", "m₂", "Mass 2", "kg", "mass", [], { ord: 2 }), V("u2", "u₂", "Speed 2 before", "m/s", "speed", ["stationary", "at rest"], { ord: 2, def: 0 }),
      V("vf", "v", "Speed after (together)", "m/s", "speed", ["together", "after"], { ask: ["final velocity", "velocity after", "their velocity", "speed after", "velocity after", "together", "common", "final", "their speed", "their velocity", "move off", "moves off", "new speed", "speed of the"] }), V("p", "p", "Total momentum", "kg·m/s", "momentum", ["momentum"], { ask: ["momentum"] })],
    post(vals, text) { if (!("m2" in vals) && "m1" in vals && !/collide|collision|hits|sticks?|together|crash|joined|coupl|catch|caught|stays on|cling/.test(text)) { vals.m2 = 0; vals.u2 = 0; } },
    eqs: [E("vf", "(m1*u1+m2*u2)/(m1+m2)", { u1: "((m1+m2)*vf-m2*u2)/m1", u2: "((m1+m2)*vf-m1*u1)/m2", m2: "m1*(u1-vf)/(vf-u2)" }), E("p", "m1*u1+m2*u2")],
    finds: ["vf", "p"],
    idea: "In a collision the total momentum (mass × velocity) before equals the total after.",
    alt: "Use the centre-of-mass speed: when objects stick together they move at (total momentum) ÷ (total mass).",
    mistakes: ["Velocity has a direction: a trolley moving left gets a negative sign.", "Kinetic energy is NOT conserved when objects stick together."],
    ex: "A 2 kg trolley moving at 3 m/s hits a stationary 1 kg trolley and they stick together. Find their speed after." }));

  L.push(build({ id: "ohm", subj: "physics", name: "Ohm's law & electrical power", icon: "💡", draw: "circuit",
    kw: ["current", "voltage", "resistance", "ohm", "volts", "amps", "potential difference", "resistor", "bulb", "circuit", "electrical power", "charge", "kwh"],
    vars: [V("Vv", "V", "Voltage", "V", "voltage", ["voltage", "potential", "battery", "supply", "across"], { ask: ["voltage", "potential difference", "p.d"] }), V("I", "I", "Current", "A", "current", ["current", "draws", "flows"], { ask: ["current"] }), V("R", "R", "Resistance", "Ω", "resistance", ["resistance", "resistor"], { ask: ["resistance"] }),
      V("P", "P", "Power", "W", "power", ["power", "rated", "heater", "bulb"], { ask: ["power"] }), V("t", "t", "Time", "s", "time", ["for", "in"]), V("En", "E", "Energy used", "J", "energy", ["energy"], { ask: ["energy"], also: [["kWh"]] })],
    eqs: [E("Vv", "I*R", { I: "Vv/R", R: "Vv/I" }), E("P", "Vv*I", { Vv: "P/I", I: "P/Vv" }), E("En", "P*t", { P: "En/t", t: "En/P" })],
    finds: ["I", "R", "Vv", "P", "En"],
    idea: "Voltage pushes, resistance resists, current is what flows: V = I × R. Power is voltage × current.",
    alt: "Shortcuts: P = I²R and P = V²/R give power without finding the third quantity first.",
    mistakes: ["mA → A (÷1000) and kΩ → Ω (×1000) before using the formula.", "Energy in kWh = kW × hours; in joules = W × seconds."],
    ex: "A 12 V battery drives a current of 0.5 A through a bulb. Find its resistance and power." }));

  L.push(build({ id: "density", subj: "physics", name: "Density", icon: "🧊", draw: "float",
    kw: ["density", "dense", "float", "sink", "volume of", "kg/m3", "g/cm3", "displaces"],
    vars: [V("m", "m", "Mass", "kg", "mass", ["mass", "weighs", "has a mass"]), V("Vm", "V", "Volume", "m³", "volume", ["volume", "occupies", "displaces"], { ask: ["volume"] }), V("rho", "ρ", "Density", "kg/m³", "density", ["density"], { ask: ["density"], also: [["g/cm³"]] })],
    eqs: [E("rho", "m/Vm", { m: "rho*Vm", Vm: "m/rho" })],
    finds: ["rho", "m", "Vm"],
    idea: "Density is how much mass is packed into each unit of volume. Less dense than water (1000 kg/m³) floats.",
    alt: "Compare with water: 1 cm³ of water has a mass of 1 g, so g/cm³ tells you directly how many times heavier than water it is.",
    mistakes: ["1 m³ = 1,000,000 cm³ = 1000 L.", "1 g/cm³ = 1000 kg/m³."],
    ex: "A block has a mass of 540 g and a volume of 200 cm³. What is its density? Will it float in water?" }));

  L.push(build({ id: "pressure", subj: "physics", name: "Pressure (force ÷ area)", icon: "📌", draw: "piston",
    kw: ["pressure", "area", "pascal", "pa", "stands on", "drawing pin", "heel", "piston", "hydraulic", "snowshoe"],
    vars: [V("F", "F", "Force", "N", "force", ["force", "weight", "weighs", "pushes"]), V("A", "A", "Area", "m²", "area", ["area", "contact", "surface"], { ask: ["area"] }), V("P", "P", "Pressure", "Pa", "pressure", ["pressure"], { ask: ["pressure"] })],
    pre(lt, vals) { this._each = 0; this._w = 0; if (!("F" in vals)) { const m = SV.quantities(lt).find(q => q.dim === "mass"); if (m) { const kg = SV.conv(m.v, m.unit, "kg"); vals.F = kg * 9.81; this._w = kg; } } const m = lt.match(/\b(two|three|four|six|eight|2|3|4|6|8)\s+(feet|legs|tyres|tires|wheels|hooves|paws|stilettos|heels|shoes|skis)\b[^.]{0,30}\beach\b/); if (m && vals.A) { const k = { two: 2, three: 3, four: 4, six: 6, eight: 8 }[m[1]] || +m[1]; vals.A *= k; this._each = k; } },
    eqs: [E("P", "F/A", { F: "P*A", A: "F/P" })], finds: ["P", "F", "A"],
    idea: "Pressure spreads a force over an area: same force on a smaller area gives a bigger pressure.",
    alt: "Pascals are newtons per square metre, so imagine how many newtons press on each 1 m × 1 m square.",
    mistakes: ["cm² → m²: divide by 10,000, not 100.", "Weight in newtons = mass × 9.81."],
    ex: "A 600 N person stands on one foot with an area of 150 cm². What pressure do they put on the floor?" }));

  L.push(build({ id: "fluidp", subj: "physics", name: "Pressure in liquids", icon: "🌊", draw: "fluid",
    kw: ["depth", "deep", "under water", "underwater", "liquid pressure", "fluid pressure", "below the surface", "dam", "diver", "column", "water tower", "trench", "ocean", "seawater", "gauge pressure"],
    vars: [V("h", "h", "Depth", "m", "length", ["depth", "deep", "below", "down"], { ask: ["depth", "how deep", "how high", "what height", "height of water"] }), V("rho", "ρ", "Liquid density", "kg/m³", "density", ["density"], { def: 1000 }), V("P", "P", "Pressure from the liquid", "Pa", "pressure", ["pressure"], { ask: ["pressure"], also: [["kPa"], ["atm"]] })],
    consts: { g: 9.81 },
    eqs: [E("P", "rho*g*h", { h: "P/(rho*g)", rho: "P/(g*h)" })],
    phrases: [{ re: /sea ?water|ocean|sea\b/, set: { rho: 1025 } }, { re: /mercury/, set: { rho: 13600 } }, { re: /\boil\b/, set: { rho: 900 } }],
    finds: ["P", "h"],
    idea: "The deeper you go, the more liquid sits above you: pressure grows with depth × density × g.",
    alt: "Rule of thumb: every 10 m of water adds about 1 atmosphere (100 kPa).",
    mistakes: ["Add air pressure (≈101 kPa) if the question asks for total pressure.", "Density of water is 1000 kg/m³, not 1."],
    ex: "What is the water pressure on a diver 25 m below the surface of the sea?" }));

  L.push(build({ id: "waves", subj: "physics", name: "Waves (speed, frequency, wavelength)", icon: "〰️", draw: "wave",
    kw: ["wave", "wavelength", "frequency", "hz", "period", "sound", "light", "radio", "oscillat", "crest", "vibrat"],
    vars: [V("v", "v", "Wave speed", "m/s", "speed", ["speed", "travels"], { ask: ["speed", "how fast"] }), V("f", "f", "Frequency", "Hz", "frequency", ["frequency"], { ask: ["frequency"] }), V("lam", "λ", "Wavelength", "m", "length", ["wavelength", "apart", "crests"], { ask: ["wavelength"] }), V("T", "T", "Period", "s", "time", ["period", "each"], { ask: ["period"] })],
    eqs: [E("v", "f*lam", { f: "v/lam", lam: "v/f" }), E("T", "1/f", { f: "1/T" })],
    phrases: [{ re: /\blight\b|electromagnetic|radio|microwave|x-ray|gamma|infrared|ultraviolet/, set: { v: 3e8 } }, { re: /sound/, set: { v: 343 } }],
    finds: ["lam", "f", "v", "T"],
    idea: "Each second, f waves pass by and each is λ long, so the wave moves f × λ metres per second.",
    alt: "Use the period: a wave moves one wavelength in one period, so v = λ ÷ T.",
    mistakes: ["kHz → ×1000, MHz → ×1,000,000.", "nm → ×10⁻⁹ m for light."],
    ex: "A radio station broadcasts at 100 MHz. What is the wavelength of its waves?" }));

  L.push(build({ id: "heat", subj: "physics", name: "Heating (specific heat)", icon: "🔥", draw: "beaker",
    kw: ["specific heat", "heat capacity", "heated", "temperature rise", "warm", "energy needed", "kettle", "j/kg", "raise the temperature", "cools"],
    vars: [V("m", "m", "Mass", "kg", "mass", ["mass", "of"]), V("c", "c", "Specific heat capacity", "J/(kg·°C)", "shc", ["specific", "capacity", "c ="], { def: 4186, ask: ["specific heat", "heat capacity", "what is c"] }), V("dT", "ΔT", "Temperature change", "°C", "temp", ["by", "rise", "change"], { ask: ["temperature change", "rise", "how much"] }),
      V("T1", "T₁", "Start temperature", "°C", "temp", ["from", "initially", "at"], { ord: 1 }), V("T2", "T₂", "End temperature", "°C", "temp", ["to"], { ord: 2, ask: ["final temperature", "new temperature"] }), V("Q", "Q", "Heat energy", "J", "energy", ["energy", "heat", "supplied", "absorbs", "gains", "loses"], { ask: ["how much heat", "heat is needed", "heat needed", "heat required", "energy needed", "energy is needed", "how much energy", "heat transfer", "energy", "heat"] })],
    eqs: [E("Q", "m*c*dT", { m: "Q/(c*dT)", c: "Q/(m*dT)", dT: "Q/(m*c)" }), E("dT", "T2-T1", { T2: "T1+dT", T1: "T2-dT" })],
    pre(lt, vals, text) { const qs = SV.quantities(lt).filter(q => q.dim === "temp"); const by = qs.find(q => /\bby\s*$|(rise|increase|change|drop|fall) of\s*$/.test(q.before)); if (by) { delete vals.T1; delete vals.T2; delete vals.dT; vals.dT = SV.conv(by.v, by.unit, "°C") - (/k\b|kelvin/i.test(by.unit || "") ? 0 : 0); if (/k$/i.test(by.unit || "")) vals.dT = by.v; const o = qs.find(q => q !== by); if (o) vals.T1 = SV.conv(o.v, o.unit, "°C"); } },
    phrases: [{ re: /aluminium|aluminum/, set: { c: 900 } }, { re: /copper/, set: { c: 385 } }, { re: /\biron\b|steel/, set: { c: 450 } }],
    finds: ["Q", "dT", "T2"],
    idea: "Heat needed = mass × how hard the material is to heat (c) × the temperature rise.",
    alt: "Per kilogram per degree: water needs 4186 J for each kg and each °C, so multiply by kg and by °C.",
    mistakes: ["Use the change in temperature, not the final temperature.", "Grams → kilograms.", "Water's c is about 4186 (often 4200) J/(kg·°C)."],
    ex: "How much energy is needed to heat 2 kg of water from 20 °C to 100 °C?" }));

  L.push(build({ id: "moments", subj: "physics", name: "Levers & moments", icon: "⚖️", draw: "lever",
    kw: ["moment", "lever", "pivot", "see-saw", "seesaw", "fulcrum", "balance", "torque", "spanner", "wrench"],
    vars: [V("F1", "F₁", "Force on side 1", "N", "force", [], { ord: 1, alt: ["mass"] }), V("d1", "d₁", "Distance 1 from the pivot", "m", "length", [], { ord: 1 }), V("F2", "F₂", "Force on side 2", "N", "force", [], { ord: 2, alt: ["mass"], ask: ["force", "weight", "how heavy"] }), V("d2", "d₂", "Distance 2 from the pivot", "m", "length", [], { ord: 2, ask: ["where", "how far", "distance"] }), V("Mo", "M", "Moment (turning effect)", "N·m", "moment", ["moment", "torque"], { ask: ["moment", "torque", "turning effect"] })],
    eqs: [E("Mo", "F1*d1", { F1: "Mo/d1", d1: "Mo/F1" }), E("F2", "F1*d1/d2", { F1: "F2*d2/d1", d1: "F2*d2/F1", d2: "F1*d1/F2" })], finds: ["F2", "d2", "Mo"],
    idea: "A lever balances when the turning effect (force × distance from the pivot) is the same on both sides.",
    alt: "Ratio method: if one side is 3× as far from the pivot, it needs only ⅓ of the force.",
    mistakes: ["Measure distances from the pivot, not from the end.", "Clockwise moments = anticlockwise moments at balance."],
    ex: "A 400 N child sits 1.5 m from the pivot of a see-saw. How far from the pivot must a 600 N child sit to balance?" }));

  L.push(build({ id: "hooke", subj: "physics", name: "Springs (Hooke's law)", icon: "🌀", draw: "spring",
    kw: ["spring", "stretch", "extension", "spring constant", "hooke", "elastic", "compressed", "n/m"],
    vars: [V("F", "F", "Force", "N", "force", ["force", "load", "weight", "hung"]), V("k", "k", "Spring constant", "N/m", "springk", ["constant", "stiffness"], { ask: ["spring constant", "stiffness"] }), V("x", "x", "Extension", "m", "length", ["extension", "stretch", "extends", "compressed", "by"], { ask: ["extension", "stretch", "how far", "how much"] }), V("Es", "E", "Elastic energy stored", "J", "energy", ["energy", "stored"], { ask: ["energy"] })],
    pre(lt, vals) { this._w = 0; if (!("F" in vals)) { const m = SV.quantities(lt).find(q => q.dim === "mass"); if (m) { const kg = SV.conv(m.v, m.unit, "kg"); vals.F = kg * 9.81; this._w = kg; } } },
    eqs: [E("F", "k*x", { k: "F/x", x: "F/k" }), E("Es", "0.5*k*x^2", { x: "sqrt(2*Es/k)" })], finds: ["x", "k", "F", "Es"],
    idea: "A spring stretches in proportion to the force: double the force, double the stretch (until its limit).",
    alt: "Energy stored is the area under the force–extension line: ½ × F × x.",
    mistakes: ["cm → m before using N/m.", "Extension is the change in length, not the total length."],
    ex: "A spring with spring constant 40 N/m has a 6 N weight hung on it. How far does it stretch?" }));


  L.push(build({ id: "efficiency", subj: "physics", name: "Efficiency", icon: "♻️", draw: "sankey",
    kw: ["efficiency", "efficient", "useful", "wasted", "input energy", "output energy", "energy in", "energy out"],
    vars: [V("Ein", "E_in", "Energy (or power) put in", "J", "energy", ["uses", "input", "supplied", "takes in", "consumes", "total", "from"], { alt: ["power"] }), V("Eout", "E_out", "Useful energy (or power) out", "J", "energy", ["useful", "output", "gives", "produces"], { alt: ["power"], ask: ["useful energy", "useful output", "how much useful"] }), V("eff", "η", "Efficiency", "%", "percent", ["efficiency", "efficient"], { ask: ["efficiency", "how efficient"] }), V("Ew", "E_waste", "Wasted energy", "J", "energy", ["wasted", "lost"], { ask: ["wasted", "lost"] })],
    detect(t) { return /efficien|useful|wasted/i.test(t) ? 12 : 0; },
    post(vals) { if ("Ein" in vals && "Eout" in vals && vals.Eout > vals.Ein) { const x = vals.Ein; vals.Ein = vals.Eout; vals.Eout = x; } },
    eqs: [E("eff", "Eout/Ein*100", { Eout: "eff*Ein/100", Ein: "Eout*100/eff" }), E("Ew", "Ein-Eout", { Eout: "Ein-Ew", Ein: "Eout+Ew" })], finds: ["eff", "Ew"],
    idea: "Efficiency = useful energy out ÷ total energy in × 100%. The rest is wasted, usually as heat or sound.",
    alt: "Same rule works with power: useful power out ÷ power in × 100%.",
    mistakes: ["Efficiency can never be more than 100%.", "Put the useful part on top, the total on the bottom."],
    ex: "A motor uses 500 J of energy and gives 350 J of useful energy. What is its efficiency?" }));

  L.push(build({ id: "circular", subj: "physics", name: "Circular motion", icon: "🎠", draw: "circle",
    kw: ["centripetal", "in a circle", "circular path", "circular motion", "horizontal circle", "bend", "round a bend", "around a bend", "corner", "roundabout", "orbit", "whirled", "tension"],
    vars: [V("m", "m", "Mass", "kg", "mass", ["mass", "of"]), V("v", "v", "Speed", "m/s", "speed", ["speed", "at", "moving"], { ask: ["speed", "how fast", "maximum speed"] }), V("r", "r", "Radius", "m", "length", ["radius", "string", "of radius", "long"], { ask: ["radius"] }), V("F", "F", "Centripetal force", "N", "force", ["force", "tension", "friction"], { ask: ["centripetal force", "force", "tension", "friction needed"] }), V("ac", "a", "Centripetal acceleration", "m/s²", "accel", ["accelerat"], { ask: ["acceleration"] })],
    eqs: [E("ac", "v^2/r", { v: "sqrt(ac*r)", r: "v^2/ac" }), E("F", "m*v^2/r", { m: "F*r/v^2", v: "sqrt(F*r/m)", r: "m*v^2/F" })], finds: ["F", "ac", "v"],
    idea: "Moving in a circle means constantly turning, which needs a force pointing to the centre: F = m v² ÷ r.",
    alt: "Find the acceleration first (v² ÷ r), then multiply by the mass.",
    mistakes: ["Square the speed.", "Use the radius, not the diameter.", "For a vertical circle the tension also changes with gravity; this uses the horizontal-circle value."],
    ex: "A car of mass 800 kg goes round a bend of radius 50 m at 15 m/s. Find the centripetal force." }));

  L.push(build({ id: "halflife", subj: "physics", name: "Radioactive half-life", icon: "☢️", draw: "decay",
    kw: ["half-life", "half life", "halflife", "radioactive", "decay", "decays", "isotope", "activity", "becquerel", "bq"],
    vars: [V("N0", "N₀", "Starting amount", "g", "mass", [], { ord: 1, alt: ["none", "percent"] }), V("N", "N", "Amount left", "g", "mass", ["left", "remain"], { ord: 2, alt: ["none", "percent"], ask: ["left", "remain", "how much", "activity after"] }), V("t", "t", "Time passed", "days", "time", ["in", "after", "takes"], { ask: ["how long", "time"] }), V("Th", "T½", "Half-life", "days", "time", ["half-life", "half life"], { ask: ["half-life", "half life", "halflife"] })],
    eqs: [E("N", "N0*0.5^(t/Th)", { N0: "N/0.5^(t/Th)", t: "Th*ln(N0/N)/ln(2)", Th: "t*ln(2)/ln(N0/N)" })], finds: ["N", "Th", "t"],
    pre(lt, vals) { const qs = SV.quantities(lt).filter(q => q.dim === "time"); const hl = qs.find(q => /half.?life\s*(of|is|=)?\s*$/.test(q.before)); if (hl) { delete vals.t; delete vals.Th; vals.Th = SV.conv(hl.v, hl.unit, "days"); const o = qs.find(q => q !== hl); if (o) vals.t = SV.conv(o.v, o.unit, "days"); } },
    idea: "In each half-life, half of what's left decays. After n half-lives, (½)ⁿ of the start remains.",
    alt: "Count halvings: 80 → 40 → 20 is two half-lives, so each half-life is the total time ÷ 2.",
    mistakes: ["It doesn't all decay after two half-lives: ½ then ¼ remains.", "Keep time and half-life in the same unit."],
    ex: "A radioactive sample decays from 80 g to 20 g in 12 days. What is its half-life?" }));

  L.push(build({ id: "lens", subj: "physics", name: "Lenses (thin lens formula)", icon: "🔍", draw: "lens",
    kw: ["lens", "focal length", "converging", "convex", "object distance", "image distance", "magnifying glass", "projector"],
    vars: [V("f", "f", "Focal length", "cm", "length", ["focal"], { ask: ["focal length"] }), V("u", "u", "Object distance", "cm", "length", ["object", "placed", "away"], { ask: ["object distance", "where should the object"] }), V("v", "v", "Image distance", "cm", "length", ["image"], { ask: ["where is the image", "image distance", "image form", "image"] }), V("Mg", "M", "Magnification", "×", "none", ["magnification"], { ask: ["magnification", "how big"] })],
    eqs: [E("v", "1/(1/f-1/u)", { u: "1/(1/f-1/v)", f: "1/(1/u+1/v)" }), E("Mg", "v/u")], finds: ["v", "Mg", "f"],
    idea: "For a thin converging lens, 1/f = 1/u + 1/v links focal length, object distance and image distance.",
    alt: "Ray diagram: draw one ray parallel then through the focus, one straight through the centre; the image is where they cross.",
    mistakes: ["If the object is inside the focal length, v comes out negative: a virtual, magnified image (magnifying glass).", "Keep all distances in the same unit."],
    ex: "A lens has a focal length of 10 cm and an object is 15 cm away. Where is the image?" }));

  L.push(build({ id: "enthalpy", subj: "chemistry", name: "Energy of reactions (ΔH)", icon: "🔥", draw: "enthalpy",
    kw: ["enthalpy", "δh", "Δh", "kj/mol", "combustion", "energy released", "energy absorbed", "exothermic", "endothermic", "heat of reaction"],
    vars: [V("m", "m", "Mass burned or reacted", "g", "mass", ["of", "grams", "burns", "by"]), V("M", "M", "Molar mass", "g/mol", "molarmass", ["molar"]), V("n", "n", "Amount", "mol", "amount", ["moles", "mol"]), V("dH", "ΔH", "Enthalpy change per mole", "kJ/mol", "enthalpy", ["enthalpy", "δh", "Δh", "change"]), V("Q", "Q", "Energy change", "kJ", "energy", ["energy"], { ask: ["energy", "how much heat", "heat released", "heat given"] })],
    eqs: [E("n", "m/M", { m: "n*M", M: "m/n" }), E("Q", "n*dH", { n: "Q/dH", dH: "Q/n" })], finds: ["Q", "n"],
    idea: "ΔH is the energy change for one mole of reaction. Multiply by the number of moles to get the total. Negative means energy is released.",
    alt: "Scale directly: if 1 mol (16 g of CH₄) releases 890 kJ, then 32 g releases twice as much.",
    mistakes: ["Turn grams into moles first.", "A negative ΔH means the reaction gives out heat (exothermic)."],
    ex: "The enthalpy change for combustion of methane is -890 kJ/mol. How much energy is released by 32 g of methane?" }));

  /* ============================ MATH (formula-based) ============================ */
  const shape = (id, name, vars, eqs, finds, draw, ex, extra) => Object.assign(build({ id, subj: "math", name, vars, eqs, finds, draw, ex, kw: [] }), extra || {});
  const AREA = [
    { re: /circle|circular|radius|diameter|round|pizza|wheel/, T: shape("a_circle", "Circle", [V("r", "r", "Radius", "m", "length", ["radius"], { unitFree: 1 }), V("D", "d", "Diameter", "m", "length", ["diameter", "across"]), V("A", "A", "Area", "m²", "area", ["area"], { ask: ["area"] }), V("C", "C", "Circumference", "m", "length", ["circumference", "perimeter"], { ask: ["circumference", "perimeter", "around"] })], [E("D", "2*r", { r: "D/2" }), E("A", "pi*r^2", { r: "sqrt(A/pi)" }), E("C", "2*pi*r", { r: "C/(2*pi)" })], ["A", "C"], "shape2d", "Find the area and circumference of a circle with radius 7 cm.") },
    { re: /triangle|triangular/, T: shape("a_tri", "Triangle", [V("b", "b", "Base", "m", "length", ["base"]), V("h", "h", "Height", "m", "length", ["height", "high", "tall"]), V("A", "A", "Area", "m²", "area", ["area"], { ask: ["area"] })], [E("A", "0.5*b*h", { b: "2*A/h", h: "2*A/b" })], ["A"], "shape2d", "A triangle has a base of 10 cm and a height of 6 cm. Find its area.") },
    { re: /trapezium|trapezoid/, T: shape("a_trap", "Trapezium", [V("a", "a", "Top side", "m", "length", ["bases", "sides"], { ord: 1 }), V("b", "b", "Bottom side", "m", "length", ["and"], { ord: 2 }), V("h", "h", "Height", "m", "length", ["height", "apart", "between"]), V("A", "A", "Area", "m²", "area", ["area"], { ask: ["area"] })], [E("A", "(a+b)/2*h", { h: "2*A/(a+b)" })], ["A"], "shape2d", "A trapezium has parallel sides 6 cm and 10 cm, 4 cm apart. Find its area.") },
    { re: /parallelogram|rhombus/, T: shape("a_para", "Parallelogram", [V("b", "b", "Base", "m", "length", ["base", "side"]), V("h", "h", "Height", "m", "length", ["height", "perpendicular"]), V("A", "A", "Area", "m²", "area", ["area"], { ask: ["area"] })], [E("A", "b*h", { b: "A/h", h: "A/b" })], ["A"], "shape2d", "A parallelogram has base 9 m and height 4 m. Find its area.") },
    { re: /square/, T: shape("a_sq", "Square", [V("s", "s", "Side", "m", "length", ["side", "sides", "each"]), V("A", "A", "Area", "m²", "area", ["area"], { ask: ["area"] }), V("P", "P", "Perimeter", "m", "length", ["perimeter"], { ask: ["perimeter", "fence", "around"] })], [E("A", "s^2", { s: "sqrt(A)" }), E("P", "4*s", { s: "P/4" })], ["A", "P"], "shape2d", "A square garden has an area of 64 m². How long is each side and what is its perimeter?") },
    { re: /.*/, T: shape("a_rect", "Rectangle", [V("l", "l", "Length", "m", "length", ["length", "long", "by"], { ord: 1, ask: ["find the length", "find its length", "how long"] }), V("w", "w", "Width", "m", "length", ["width", "wide", "breadth"], { ord: 2, ask: ["find the width", "find its width", "how wide"] }), V("A", "A", "Area", "m²", "area", ["area", "covers"], { ask: ["area", "carpet", "tiles", "cover"] }), V("P", "P", "Perimeter", "m", "length", ["perimeter", "fence"], { ask: ["perimeter", "fence", "fencing", "around", "border"] })], [E("A", "l*w", { l: "A/w", w: "A/l" }), E("P", "2*(l+w)", { l: "P/2-w", w: "P/2-l" })], ["A", "P"], "shape2d", "A rectangular room is 5 m long and 3.5 m wide. Find its area and perimeter.") }];
  L.push({ id: "area", subj: "math", name: "Area & perimeter", icon: "📐", family: AREA, draw: "shape2d", kw: ["area", "perimeter", "circumference", "rectangle", "rectangular", "square", "circle", "triangle", "trapezium", "parallelogram", "fence", "carpet", "tiles", "garden", "field"],
    idea: "Area counts the unit squares inside a shape; perimeter is the distance around its edge.", alt: "Break awkward shapes into rectangles and triangles, then add the pieces.",
    mistakes: ["Area units are squared (cm², m²).", "For circles, check whether you were given the radius or the diameter (d = 2r).", "Triangle area needs the perpendicular height, not the slanted side."], ex: "A rectangular room is 5 m long and 3.5 m wide. Find its area and perimeter." });

  const VOL = [
    { re: /sphere|ball|globe|spherical/, T: shape("v_sph", "Sphere", [V("r", "r", "Radius", "m", "length", ["radius"]), V("D", "d", "Diameter", "m", "length", ["diameter"]), V("Vol", "V", "Volume", "m³", "volume", ["volume"], { ask: ["volume", "hold", "capacity"] }), V("S", "SA", "Surface area", "m²", "area", ["surface"], { ask: ["surface area", "surface"] })], [E("D", "2*r", { r: "D/2" }), E("Vol", "4/3*pi*r^3", { r: "(3*Vol/(4*pi))^(1/3)" }), E("S", "4*pi*r^2", { r: "sqrt(S/(4*pi))" })], ["Vol", "S"], "shape3d", "Find the volume of a ball with radius 11 cm.") },
    { re: /cone|conical/, T: shape("v_cone", "Cone", [V("r", "r", "Radius", "m", "length", ["radius"]), V("D", "d", "Diameter", "m", "length", ["diameter", "across"]), V("h", "h", "Height", "m", "length", ["height", "tall", "high"]), V("Vol", "V", "Volume", "m³", "volume", ["volume"], { ask: ["volume"] }), V("l", "l", "Slant height", "m", "length", ["slant"]), V("S", "SA", "Surface area", "m²", "area", ["surface"], { ask: ["surface area"] })], [E("D", "2*r", { r: "D/2" }), E("Vol", "pi*r^2*h/3", { h: "3*Vol/(pi*r^2)", r: "sqrt(3*Vol/(pi*h))" }), E("l", "sqrt(r^2+h^2)"), E("S", "pi*r^2+pi*r*l")], ["Vol", "S"], "shape3d", "A cone has radius 3 cm and height 4 cm. Find its volume and surface area.") },
    { re: /rectang|cuboid|\bbox\b|long[^.]*wide|wide[^.]*(deep|high|tall)/, T: null },
    { re: /cylind|can\b|pipe|tank|tin\b|drum/, T: shape("v_cyl", "Cylinder", [V("r", "r", "Radius", "m", "length", ["radius"]), V("D", "d", "Diameter", "m", "length", ["diameter", "across"]), V("h", "h", "Height", "m", "length", ["height", "tall", "high", "long", "length", "deep"]), V("Vol", "V", "Volume", "m³", "volume", ["volume"], { ask: ["volume", "hold", "capacity", "water"] }), V("S", "SA", "Surface area", "m²", "area", ["surface"], { ask: ["surface area", "label", "metal"] })], [E("D", "2*r", { r: "D/2" }), E("Vol", "pi*r^2*h", { h: "Vol/(pi*r^2)", r: "sqrt(Vol/(pi*h))" }), E("S", "2*pi*r^2+2*pi*r*h", { h: "(S-2*pi*r^2)/(2*pi*r)" })], ["Vol", "S"], "shape3d", "A cylindrical tank has radius 0.5 m and height 2 m. How much water can it hold?") },
    { re: /cube(?!oid)/, T: shape("v_cube", "Cube", [V("s", "s", "Side", "m", "length", ["side", "edge", "each"]), V("Vol", "V", "Volume", "m³", "volume", ["volume"], { ask: ["volume"] }), V("S", "SA", "Surface area", "m²", "area", ["surface"], { ask: ["surface area"] })], [E("Vol", "s^3", { s: "Vol^(1/3)" }), E("S", "6*s^2", { s: "sqrt(S/6)" })], ["Vol", "S"], "shape3d", "A cube has edges of 4 cm. Find its volume and surface area.") },
    { re: /.*/, box: 1, T: shape("v_box", "Cuboid (box)", [V("l", "l", "Length", "m", "length", ["length", "long"], { ord: 1 }), V("w", "w", "Width", "m", "length", ["width", "wide"], { ord: 2 }), V("h", "h", "Height", "m", "length", ["height", "high", "tall", "deep"], { ord: 3 }), V("Vol", "V", "Volume", "m³", "volume", ["volume"], { ask: ["volume", "hold", "capacity", "water", "fill"] }), V("S", "SA", "Surface area", "m²", "area", ["surface"], { ask: ["surface area", "paint", "wrap"] })], [E("Vol", "l*w*h", { h: "Vol/(l*w)", l: "Vol/(w*h)", w: "Vol/(l*h)" }), E("S", "2*(l*w+l*h+w*h)")], ["Vol", "S"], "shape3d", "A box is 30 cm long, 20 cm wide and 10 cm high. Find its volume and surface area.") }];
  VOL.forEach(f => { if (f.T === null) f.T = VOL[VOL.length - 1].T; });
  L.push({ id: "volume", subj: "math", name: "Volume & surface area", icon: "🧊", family: VOL, draw: "shape3d", kw: ["volume", "surface area", "cube", "cuboid", "box", "cylinder", "sphere", "cone", "tank", "capacity", "hold", "litres of water"],
    idea: "Volume counts the unit cubes that fill a solid; surface area is the total area of its outside.", alt: "For prisms and cylinders: volume = area of the end × length.",
    mistakes: ["Volume units are cubed (cm³, m³); 1000 cm³ = 1 litre.", "Cone and pyramid volumes have the ⅓.", "Use the radius, not the diameter."], ex: "A cylindrical tank has radius 0.5 m and height 2 m. How much water can it hold?" });

  L.push(build({ id: "pythag", subj: "math", name: "Pythagoras' theorem", icon: "📏", draw: "triangle",
    kw: ["pythagoras", "hypotenuse", "right-angled", "right angled", "right triangle", "ladder", "diagonal", "leans", "against a wall"],
    vars: [V("a", "a", "Short side a", "m", "length", ["base", "foot", "from the wall", "away", "side", "leg", "wide"], { ord: 1, ask: ["find the base", "how far from", "the other side", "missing side"] }), V("b", "b", "Short side b", "m", "length", ["height", "up the wall", "reaches", "high", "side"], { ord: 2 }), V("c", "c", "Hypotenuse (longest side)", "m", "length", ["hypotenuse", "ladder", "diagonal", "long"], { ask: ["hypotenuse", "diagonal", "how long is the ladder", "length of the ladder", "brace", "how long should", "how long is the"] })],
    eqs: [E("c", "sqrt(a^2+b^2)", { a: "sqrt(mx(0,c^2-b^2))", b: "sqrt(mx(0,c^2-a^2))" })], finds: ["c", "b", "a"],
    detect(t) { const lt = t.toLowerCase(); if (SV.quantities(t).some(q => q.dim === "angle")) return -8; return /diagonal|hypotenuse|right.angled|right triangle|pythag/.test(lt) ? 14 : 0; },
    pre(text, vals) { const qs = SV.quantities(text).filter(q => q.dim === "length"); const askHyp = /(find|calculate|what is|work out|how long is|length of)[^.?]{0,25}(diagonal|hypotenuse|the ladder)/.test(text); if (!askHyp && /ladder|hypotenuse|diagonal/.test(text) && qs.length === 2) { const lad = qs.find(q => /ladder|hypotenuse|diagonal|long/.test(q.before.slice(-45) + " " + q.after.slice(0, 12))); if (lad) { delete vals.a; delete vals.b; vals.c = SV.conv(lad.v, lad.unit, "m"); const o = qs.find(q => q !== lad); vals.a = SV.conv(o.v, o.unit, "m"); return true; } } },
    idea: "In a right-angled triangle, the square on the longest side equals the sum of the squares on the other two: a² + b² = c².",
    alt: "Check with known triples: 3-4-5, 5-12-13, 8-15-17, and their multiples.",
    mistakes: ["The hypotenuse is opposite the right angle and is always the longest side.", "To find a shorter side, subtract: a² = c² − b²."],
    ex: "A 5 m ladder leans against a wall with its foot 1.5 m from the wall. How high up the wall does it reach?" }));

  L.push(build({ id: "trig", subj: "math", name: "Trigonometry (SOH CAH TOA)", icon: "📐", draw: "triangle",
    kw: ["sin", "cos", "tan", "angle of elevation", "angle of depression", "trigonometry", "opposite", "adjacent", "elevation", "soh", "bearing"],
    vars: [V("th", "θ", "Angle", "°", "angle", ["angle", "elevation", "depression", "at"], { ask: ["angle"] }), V("o", "opp", "Opposite side", "m", "length", ["opposite", "height", "tall", "high", "up", "rises", "rise", "vertical"], { ask: ["height", "how high", "how tall", "opposite"] }), V("a", "adj", "Adjacent side", "m", "length", ["adjacent", "from", "away", "distance", "base", "along", "horizontal", "over"], { ask: ["how far", "distance", "adjacent"] }), V("h", "hyp", "Hypotenuse", "m", "length", ["hypotenuse", "ladder", "string", "rope", "ramp", "slope", "kite"], { ask: ["hypotenuse", "length of"] })],
    detect(t) { const lt = t.toLowerCase(), hasA = SV.quantities(t).some(q => q.dim === "angle"); return /what angle|find the angle|angle (does|it) make|angle of (elevation|depression|inclination)/.test(lt) ? 16 : (hasA && /ladder|tree|tower|building|kite|string|wall|height|tall|high|ground/.test(lt) && !/slides|friction|speed|thrown|kicked|launched|fired/.test(lt) ? 14 : 0); },
    eqs: [E("o", "h*sin(th)", { h: "o/sin(th)", th: "asin(o/h)" }), E("a", "h*cos(th)", { h: "a/cos(th)", th: "acos(a/h)" }), E("o", "a*tan(th)", { a: "o/tan(th)", th: "atan(o/a)" })], finds: ["o", "a", "h", "th"],
    idea: "In a right triangle, the angle fixes the ratios of the sides: sin = opp/hyp, cos = adj/hyp, tan = opp/adj.",
    alt: "Once you have two sides you can check the third with Pythagoras.",
    mistakes: ["Label the sides from the angle you're using.", "Use sin⁻¹ (inverse) to find an angle.", "Calculator must be in degrees."],
    ex: "From 40 m away, the angle of elevation to the top of a tree is 28°. How tall is the tree?" }));

  L.push(build({ id: "interest", subj: "math", name: "Simple & compound interest", icon: "💰", draw: "growthmoney",
    kw: ["interest", "invest", "invests", "deposit", "loan", "borrow", "compound", "per annum", "p.a", "savings", "bank", "principal"],
    vars: [V("P", "P", "Starting amount", "", "money", ["invests", "deposit", "borrow", "of", "principal", "loan", "on"], { alt: ["none"], ask: ["what principal", "find the principal", "how much was invested", "how much money was", "how much must be invested"] }), V("r", "r", "Rate per year", "%", "percent", ["rate", "interest", "at"]), V("t", "t", "Years", "years", "time", ["for", "years"], { ask: ["how long", "how many years"] }), V("n", "n", "Times compounded per year", "", "none", [], { def: 1 }),
      V("A", "A", "Final amount", "", "money", ["total", "becomes", "amount"], { ask: ["amount", "total", "worth", "balance", "how much will"] }), V("I", "I", "Interest earned", "", "money", ["interest", "earns", "earned", "received"], { ask: ["interest"] })],
    eqs: [E("A", "P+I", { I: "A-P", P: "A-I" })],
    pre(text, vals) { this.compound = /compound/.test(text); if (/monthly/.test(text)) vals.n = 12; if (/quarterly/.test(text)) vals.n = 4; if (/half.?year|semi/.test(text)) vals.n = 2; if (/daily/.test(text)) vals.n = 365; const tq = SV.quantities(text).filter(q => q.dim === "time"); if (tq.length > 1) { const L = tq[tq.length - 1]; vals.t = SV.conv(L.v, L.unit, "years"); } },
    idea: "Simple interest adds the same amount every year; compound interest earns interest on the interest too.",
    alt: "Compound: multiply by (1 + rate) once per period. Simple: interest = P × r × t ÷ 100.",
    mistakes: ["Rate as a decimal: 5% = 0.05.", "Convert months to years (or use monthly compounding: n = 12).", "The question may want the interest only, not the final amount."],
    ex: "£2000 is invested at 4% per year compound interest for 5 years. How much is it worth at the end?" }));
  /* interest needs the simple/compound link added at run time */
  const INT = L.find(t => t.id === "interest");
  INT.variantFor = function (text) { const comp = /compound/.test(text);
    const T = build({ id: comp ? "interest_c" : "interest_s", subj: "math", name: comp ? "Compound interest" : "Simple interest", vars: INT.vars.map(v => Object.assign({}, v)), draw: "growthmoney", kw: [],
      eqs: comp ? [E("A", "P*(1+r/100/n)^(n*t)", { P: "A/(1+r/100/n)^(n*t)", t: "ln(A/P)/(n*ln(1+r/100/n))", r: "100*n*((A/P)^(1/(n*t))-1)" }), E("I", "A-P")] : [E("I", "P*r*t/100", { P: "100*I/(r*t)", r: "100*I/(P*t)", t: "100*I/(P*r)" }), E("A", "P+I", { I: "A-P", P: "A-I" })], finds: ["A", "I", "t"] });
    if (!T.pre) T.pre = INT.pre; return T; };

  L.push(build({ id: "polygon", subj: "math", name: "Angles in polygons", icon: "🔷", draw: "polygon",
    kw: ["polygon", "interior angle", "exterior angle", "sides", "hexagon", "pentagon", "octagon", "decagon", "regular", "sum of the angles"],
    vars: [V("n", "n", "Number of sides", "", "none", ["sides", "sided"], { ask: ["how many sides", "number of sides"] }), V("S", "S", "Sum of interior angles", "°", "angle", ["sum", "total"], { ask: ["sum"] }), V("Ia", "i", "Each interior angle", "°", "angle", ["interior"], { ask: ["interior angle", "each angle", "each interior"] }), V("Ea", "e", "Each exterior angle", "°", "angle", ["exterior"], { ask: ["exterior angle"] })],
    eqs: [E("S", "(n-2)*180", { n: "S/180+2" }), E("Ea", "360/n", { n: "360/Ea" }), E("Ia", "180-Ea", { Ea: "180-Ia" })],
    pre(text, vals) { const nm = { triangle: 3, quadrilateral: 4, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, nonagon: 9, decagon: 10, dodecagon: 12 }; for (const k in nm) if (text.includes(k)) { vals.n = nm[k]; break; } },
    finds: ["Ia", "S", "Ea", "n"],
    idea: "A polygon with n sides splits into (n − 2) triangles, so its angles add to (n − 2) × 180°. The exterior angles always add to 360°.",
    alt: "Exterior route: each exterior angle of a regular polygon is 360° ÷ n, and interior = 180° − exterior.",
    mistakes: ["Only regular polygons have all angles equal.", "Interior + exterior = 180° at each corner."],
    ex: "Find the size of each interior angle of a regular octagon." }));

  /* ============================ CHEMISTRY (formula-based) ============================ */
  L.push(build({ id: "moles", subj: "chemistry", name: "Moles, mass & particles", icon: "⚗️", draw: "moles",
    kw: ["mole", "moles", "mol", "molar mass", "avogadro", "particles", "molecules", "atoms in", "number of", "g/mol", "how many grams"],
    vars: [V("m", "m", "Mass", "g", "mass", ["mass", "of", "grams", "weighs"], { ask: ["mass", "how many grams", "grams"] }), V("M", "M", "Molar mass", "g/mol", "molarmass", ["molar"]), V("n", "n", "Amount", "mol", "amount", ["moles", "mol"], { ask: ["moles", "how many moles", "amount"] }), V("N", "N", "Number of particles", "", "none", ["particles", "molecules", "atoms"], { ask: ["particles", "molecules", "atoms", "how many molecules", "how many atoms"] })],
    consts: { NA: 6.022e23 },
    eqs: [E("n", "m/M", { m: "n*M", M: "m/n" }), E("N", "n*NA", { n: "N/NA" })], finds: ["n", "m", "N"],
    idea: "A mole is a fixed count of particles (6.022 × 10²³). Its mass in grams equals the formula's molar mass.",
    alt: "Use the molar mass as a conversion factor: grams × (1 mol ÷ M grams).",
    mistakes: ["Work out the molar mass from the whole formula (H₂O = 2×1.008 + 16.00).", "Particles = moles × 6.022 × 10²³, not divided."],
    ex: "How many moles are in 36 g of H2O? How many molecules is that?" }));

  L.push(build({ id: "gas", subj: "chemistry", name: "Gas laws", icon: "🎈", draw: "gas",
    kw: ["gas", "pressure", "volume", "temperature", "boyle", "charles", "ideal gas", "pv=nrt", "compressed", "expands", "atm", "kpa", "stp", "balloon", "syringe"],
    vars: [V("P1", "P₁", "Start pressure", "atm", "pressure", [], { ord: 1 }), V("V1", "V₁", "Start volume", "L", "volume", [], { ord: 1 }), V("T1", "T₁", "Start temperature", "K", "temp", [], { ord: 1 }),
      V("P2", "P₂", "New pressure", "atm", "pressure", [], { ord: 2, ask: ["pressure", "new pressure", "final pressure"] }), V("V2", "V₂", "New volume", "L", "volume", [], { ord: 2, ask: ["volume", "new volume", "final volume"] }), V("T2", "T₂", "New temperature", "K", "temp", [], { ord: 2, ask: ["temperature", "new temperature", "final temperature"] })],
    eqs: [E("V2", "P1*V1*T2/(T1*P2)", { P2: "P1*V1*T2/(T1*V2)", T2: "P2*V2*T1/(P1*V1)", P1: "P2*V2*T1/(V1*T2)", V1: "P2*V2*T1/(P1*T2)", T1: "P1*V1*T2/(P2*V2)" })],
    detect(t) { return /\bmol\b|moles?\b|find n\b|\bn\s*=|pv\s*=\s*nrt|ideal gas/i.test(t) ? -10 : 0; },
    post(vals) { const n = id => id in vals; if (!n("P1") && !n("P2")) { vals.P1 = vals.P2 = 1; this._const = "pressure"; } else if (!n("T1") && !n("T2")) { vals.T1 = vals.T2 = 1; this._const = "temperature"; } else if (!n("V1") && !n("V2")) { vals.V1 = vals.V2 = 1; this._const = "volume"; } else this._const = null; },
    finds: ["V2", "P2", "T2"],
    idea: "For a fixed amount of gas, P × V ÷ T stays the same. Squeeze it and the pressure rises; heat it and it expands.",
    alt: "Ratio method: new volume = old volume × (pressure ratio that makes it smaller or bigger) × (temperature ratio).",
    mistakes: ["Temperatures must be in kelvin: K = °C + 273.15.", "Pressures and volumes just need matching units on both sides."],
    ex: "A gas occupies 2.0 L at 1 atm and 27 °C. What volume will it occupy at 2 atm and 127 °C?" }));

  L.push(build({ id: "idealgas", subj: "chemistry", name: "Ideal gas (PV = nRT)", icon: "🧪", draw: "gas",
    kw: ["ideal gas", "pv=nrt", "moles of gas", "mol of gas", "gas constant", "occupy", "stp"],
    vars: [V("P", "P", "Pressure", "atm", "pressure", ["pressure", "at"], { ask: ["pressure"] }), V("Vg", "V", "Volume", "L", "volume", ["volume", "occupies", "container"], { ask: ["volume"] }), V("n", "n", "Amount of gas", "mol", "amount", ["moles", "mol"], { ask: ["moles", "how many moles", "amount"] }), V("T", "T", "Temperature", "K", "temp", ["at", "temperature"], { ask: ["temperature"] }), V("m", "m", "Mass of gas", "g", "mass", ["mass", "of"], { ask: ["mass", "how many grams"] }), V("M", "M", "Molar mass", "g/mol", "molarmass", ["molar"])],
    consts: { R: 0.08206 },
    phrases: [{ re: /\bstp\b|standard temperature and pressure/, set: { P: 1, T: 273.15 } }],
    detect(t) { const d = SV.quantities(t).map(q => q.dim); return (/\bmol\b|moles?\b|find n\b|\bn\s*=|pv\s*=\s*nrt|ideal gas/i.test(t) && (d.includes("pressure") || d.includes("temp"))) || /ideal gas|pv\s*=\s*nrt/i.test(t) ? 16 : 0; },
    eqs: [E("P", "n*R*T/Vg", { Vg: "n*R*T/P", n: "P*Vg/(R*T)", T: "P*Vg/(n*R)" }), E("n", "m/M", { m: "n*M", M: "m/n" })], finds: ["Vg", "P", "n", "T", "m"],
    idea: "Gas particles bounce around: more particles, more heat or less room all push the pressure up. PV = nRT ties them together.",
    alt: "At STP one mole of any gas fills about 22.4 L; scale from there.",
    mistakes: ["With R = 0.08206 use atm, litres and kelvin. With R = 8.314 use Pa and m³.", "°C → K: add 273.15."],
    ex: "What volume does 0.5 mol of gas occupy at 2 atm and 300 K?" }));

  L.push(build({ id: "conc", subj: "chemistry", name: "Concentration (molarity)", icon: "🧫", draw: "beaker",
    kw: ["concentration", "molarity", "molar", "mol/l", "mol/dm3", "dissolved", "solution", "solute", "make up"],
    vars: [V("n", "n", "Amount of solute", "mol", "amount", ["moles", "mol"], { ask: ["moles", "how many moles"] }), V("Vs", "V", "Volume of solution", "L", "volume", ["volume", "solution", "water", "made up", "in"]), V("c", "c", "Concentration", "mol/L", "conc", ["concentration", "molar"], { ask: ["concentration", "molarity"] }), V("m", "m", "Mass of solute", "g", "mass", ["mass", "grams", "dissolved"], { ask: ["mass", "how many grams"] }), V("M", "M", "Molar mass", "g/mol", "molarmass", ["molar mass"])],
    eqs: [E("c", "n/Vs", { n: "c*Vs", Vs: "n/c" }), E("n", "m/M", { m: "n*M", M: "m/n" })], finds: ["c", "m", "n", "Vs"],
    idea: "Concentration is how many moles are dissolved in each litre of solution.",
    alt: "Work per litre: if 250 mL holds x mol, 1 L holds 4x mol.",
    mistakes: ["mL → L: divide by 1000.", "Volume is of the whole solution, not just the water added."],
    ex: "5.85 g of NaCl is dissolved to make 250 mL of solution. What is its concentration?" }));

  L.push(build({ id: "dilution", subj: "chemistry", name: "Dilution", icon: "💧", draw: "dilute",
    kw: ["dilut", "diluted", "stock solution", "c1v1", "add water", "made up to", "water is added"],
    vars: [V("c1", "c₁", "Stock concentration", "mol/L", "conc", [], { ord: 1 }), V("V1", "V₁", "Stock volume used", "L", "volume", [], { ord: 1, ask: ["how much stock", "volume of stock", "what volume of", "how much of the", "volume of the stock", "how many ml of", "how many litres of", "how many liters of"] }), V("c2", "c₂", "Final concentration", "mol/L", "conc", [], { ord: 2, ask: ["new concentration", "final concentration", "concentration"] }), V("V2", "V₂", "Final volume", "L", "volume", [], { ord: 2, ask: ["final volume", "total volume"] })],
    detect(t) { return SV.quantities(t).filter(q => q.dim === "conc").length >= 2 ? 22 : 0; },
    eqs: [E("c2", "c1*V1/V2", { c1: "c2*V2/V1", V1: "c2*V2/c1", V2: "c1*V1/c2" })], finds: ["c2", "V1", "V2"],
    idea: "Adding water doesn't change how many moles there are, so c₁V₁ = c₂V₂.",
    alt: "Dilution factor: going from 100 mL to 500 mL is ×5 the volume, so the concentration is ÷5.",
    mistakes: ["V₂ is the total final volume, not the water added.", "Keep both volumes in the same unit."],
    ex: "25 mL of 2.0 M HCl is diluted to 500 mL. What is the new concentration?" }));

  /* ============================ BIOLOGY (formula-based) ============================ */
  L.push(build({ id: "growth", subj: "biology", name: "Population growth (doubling)", icon: "🦠", draw: "growth",
    kw: ["bacteria", "doubles", "doubling", "divides", "generation time", "population", "cells divide", "every", "binary fission", "culture"],
    vars: [V("N0", "N₀", "Starting number", "", "none", ["starts", "initially", "starting", "single", "begins", "with"], { ord: 1 }), V("td", "t_d", "Doubling time", "min", "time", ["every", "doubles", "divides", "generation"]), V("t", "t", "Time passed", "min", "time", ["after", "for", "in"], { ask: ["how long", "time"] }), V("N", "N", "Final number", "", "none", ["becomes", "reaches"], { ord: 2, ask: ["how many", "number", "population"] })],
    pre(text, vals) { if (/single|one (bacterium|cell)|a bacterium/.test(text) && !("N0" in vals)) vals.N0 = 1; const qs = SV.quantities(text).filter(q => q.dim === "time"); const ev = qs.find(q => /every|each|doubles|divides|generation/.test(q.before.slice(-25))); if (ev) { delete vals.t; delete vals.td; vals.td = SV.conv(ev.v, ev.unit, "min"); const o = qs.find(q => q !== ev); if (o) vals.t = SV.conv(o.v, o.unit, "min"); return true; } },
    eqs: [E("N", "N0*2^(t/td)", { N0: "N/2^(t/td)", t: "td*ln(N/N0)/ln(2)", td: "t*ln(2)/ln(N/N0)" })], finds: ["N", "t"],
    idea: "If a population doubles every fixed time, the number of doublings is time ÷ doubling time, and each doubling multiplies by 2.",
    alt: "Count it out: 1 → 2 → 4 → 8 … one step per doubling time.",
    mistakes: ["Use the number of doublings as the power of 2, not a multiplier.", "Keep the times in the same unit."],
    ex: "A bacterium divides every 20 minutes. How many bacteria will there be after 3 hours, starting from one?" }));

  L.push(build({ id: "magnify", subj: "biology", name: "Microscope magnification", icon: "🔬", draw: "microscope",
    kw: ["magnification", "microscope", "image size", "actual size", "eyepiece", "objective", "real size", "magnified", "micrometre", "µm"],
    vars: [V("I", "I", "Image size", "µm", "length", ["image", "drawing", "measures", "appears", "photo"], { ask: ["image size"] }), V("A", "A", "Actual size", "µm", "length", ["actual", "real"], { ask: ["actual size", "real size", "how big", "actual length", "real length", "actual width", "real width", "actual diameter", "actual"] }), V("Mg", "M", "Magnification", "×", "none", ["magnification", "magnified", "x", "×", "times"], { ask: ["magnification"] }),
      V("ep", "eyepiece", "Eyepiece lens", "×", "none", ["eyepiece"]), V("ob", "objective", "Objective lens", "×", "none", ["objective"])],
    eqs: [E("Mg", "I/A", { I: "Mg*A", A: "I/Mg" }), E("Mg", "ep*ob", { ep: "Mg/ob", ob: "Mg/ep" })], finds: ["A", "Mg", "I"],
    pre(text, vals) { const m = text.match(/[x×*]\s?(\d[\d,]*)|(\d[\d,]*)\s?(x|×|times)\b/); if (m && !/eyepiece|objective/.test(text)) vals.Mg = +(m[1] || m[2]).replace(/,/g, ""); const ep = text.match(/(\d+)\s?[x×]?\s*eyepiece|eyepiece[^0-9]{0,12}(\d+)/), ob = text.match(/(\d+)\s?[x×]?\s*objective|objective[^0-9]{0,12}(\d+)/); if (ep) vals.ep = +(ep[1] || ep[2]); if (ob) vals.ob = +(ob[1] || ob[2]); if (ep && ob && !/magnification (is|of)\s*[x×*]?\d/.test(text)) delete vals.Mg; },
    idea: "Magnification = image size ÷ actual size. Remember it as the I AM triangle.",
    alt: "Total magnification of a light microscope = eyepiece × objective.",
    mistakes: ["Both sizes must be in the same unit: 1 mm = 1000 µm.", "Magnification has no unit, just ×."],
    ex: "A cell in a photo is 30 mm long. The magnification is ×1500. What is its actual length in µm?" }));

  L.push(build({ id: "sav", subj: "biology", name: "Surface area to volume ratio", icon: "🎲", draw: "cubes",
    kw: ["surface area to volume", "surface area : volume", "sa:v", "sa/v", "ratio", "diffusion", "agar", "cube"],
    vars: [V("s", "s", "Side of the cube", "cm", "length", ["side", "cube", "edge", "sides"]), V("SA", "SA", "Surface area", "cm²", "area", ["surface"], { ask: ["find the surface area of", "what is the surface area"] }), V("Vc", "V", "Volume", "cm³", "volume", ["volume"], { ask: ["find the volume", "what is the volume"] }), V("ratio", "SA:V", "SA : V ratio", ": 1", "none", ["ratio"], { ask: ["ratio", "sa:v"] })],
    detect(t) { return /surface area to volume|surface area:volume|sa\s*:\s*v|sa\/v/i.test(t) ? 25 : 0; },
    eqs: [E("SA", "6*s^2", { s: "sqrt(SA/6)" }), E("Vc", "s^3", { s: "Vc^(1/3)" }), E("ratio", "SA/Vc")], finds: ["ratio"],
    idea: "Small things have lots of surface for their volume. That's why cells are small: everything they need must cross the surface.",
    alt: "For a cube, SA:V simplifies to 6 ÷ side length.",
    mistakes: ["Surface area is all 6 faces.", "Write the ratio as x : 1."],
    ex: "Find the surface area to volume ratio of a 2 cm agar cube." }));

  L.push(build({ id: "cardiac", subj: "biology", name: "Cardiac output", icon: "❤️", draw: "heart",
    kw: ["cardiac output", "heart rate", "stroke volume", "beats per minute", "bpm", "heart pumps", "pulse"],
    vars: [V("HR", "HR", "Heart rate", "bpm", "rate", ["heart rate", "rate", "beats", "pulse"]), V("SV", "SV", "Stroke volume", "mL", "volume", ["stroke", "each beat", "per beat"], { ask: ["stroke volume"] }), V("CO", "CO", "Cardiac output", "L/min", "flow", ["output", "cardiac"], { ask: ["cardiac output", "output", "how much blood"] })],
    eqs: [E("CO", "HR*SV/1000", { HR: "1000*CO/SV", SV: "1000*CO/HR" })], finds: ["CO", "SV", "HR"],
    idea: "Each heartbeat pumps one stroke volume of blood, so blood per minute = beats per minute × volume per beat.",
    alt: "Per hour: multiply the cardiac output by 60 to see how much blood the heart moves in an hour.",
    mistakes: ["mL → L: divide by 1000.", "Heart rate is per minute, so the output is per minute too."],
    ex: "A heart beats 72 times a minute with a stroke volume of 70 mL. What is the cardiac output?" }));

  L.push(build({ id: "ventilation", subj: "biology", name: "Breathing (ventilation rate)", icon: "🫁", draw: "lungs",
    kw: ["breath", "breaths", "breathing rate", "tidal volume", "ventilation", "lungs", "minute volume", "inhale"],
    vars: [V("f", "f", "Breathing rate", "/min", "rate", ["breaths", "rate", "breathing"]), V("TV", "TV", "Tidal volume (per breath)", "mL", "volume", ["tidal", "each breath", "per breath"]), V("VE", "V̇", "Air breathed per minute", "L/min", "flow", ["minute", "ventilation"], { ask: ["ventilation", "per minute", "how much air"] })],
    eqs: [E("VE", "f*TV/1000", { f: "1000*VE/TV", TV: "1000*VE/f" })], finds: ["VE", "TV", "f"],
    idea: "Air breathed each minute = breaths per minute × air per breath.",
    alt: "Exercise raises both the rate and the depth, so ventilation rises a lot.",
    mistakes: ["mL → L: divide by 1000."],
    ex: "A student takes 15 breaths a minute with a tidal volume of 500 mL. What is their ventilation rate?" }));

  L.push(build({ id: "foodchain", subj: "biology", name: "Energy in food chains", icon: "🌿", draw: "pyramid",
    kw: ["food chain", "trophic", "producer", "consumer", "10%", "energy transfer", "pyramid", "herbivore", "carnivore", "kj/m2", "efficiency"],
    vars: [V("E1", "E₁", "Energy at the producer level", "kJ", "energy", ["producer", "plants", "grass", "algae", "first", "captures"], { ord: 1, ask: ["producers have", "producers had", "did the producers", "producer level", "plants have", "plants had"] }), V("eff", "eff", "Transfer efficiency", "%", "percent", ["efficien", "transferred", "passed"], { def: 10 }), V("lv", "level", "Trophic level", "", "none", ["level"], { def: 3 }), V("En", "Eₙ", "Energy reaching that level", "kJ", "energy", [], { ord: 2, ask: ["energy", "how much"] })],
    pre(text, vals) { const lv = { primary: 2, secondary: 3, tertiary: 4, herbivore: 2, quaternary: 5 }; for (const k in lv) if (text.includes(k)) { vals.lv = lv[k]; break; } if (/carnivore/.test(text) && !/secondary|tertiary/.test(text)) vals.lv = 3;
      const q = SV.quantities(text).find(q => q.dim === "energy" && /(primary|secondary|tertiary|quaternary) consumers?[a-z ]{0,20}$|herbivores?[a-z ]{0,20}$/.test(q.before)); if (q && /producers?|plants|grass/.test(text.slice(text.search(/how much|what|find|calculate/)))) { const w = q.before.match(/(primary|secondary|tertiary|quaternary)|herbivore/)[0]; delete vals.E1; delete vals.En; vals.En = q.v; vals.lv = lv[w]; } },
    eqs: [E("En", "E1*(eff/100)^(lv-1)", { E1: "En/(eff/100)^(lv-1)" })], finds: ["En"],
    idea: "Only about 10% of the energy at one level is passed to the next; the rest is used for living or lost as heat.",
    alt: "Step it: producer → ×0.1 → primary consumer → ×0.1 → secondary consumer …",
    mistakes: ["Producers are level 1, so the secondary consumer (level 3) is two steps up: × 0.1 × 0.1.", "Efficiency = energy passed on ÷ energy received × 100."],
    ex: "Grass captures 20,000 kJ of energy. How much reaches a secondary consumer if 10% is passed on at each step?" }));

  L.push(build({ id: "osmosis", subj: "biology", name: "Percentage change in mass (osmosis)", icon: "🥔", draw: "osmosis",
    kw: ["osmosis", "potato", "carrot", "beetroot", "percentage change", "% change", "change in mass", "sugar solution", "salt solution", "pure water", "chips", "initial mass", "final mass", "before and", "after in"],
    vars: [V("m1", "m₁", "Start mass", "g", "mass", [], { ord: 1 }), V("m2", "m₂", "End mass", "g", "mass", [], { ord: 2 }), V("pc", "% change", "Percentage change", "%", "percent", ["change"], { ask: ["percentage change", "% change", "percent"] })],
    eqs: [E("pc", "(m2-m1)/m1*100", { m2: "m1*(1+pc/100)", m1: "m2/(1+pc/100)" })], finds: ["pc"],
    idea: "Percentage change = (end − start) ÷ start × 100. Positive means the cells took in water.",
    alt: "Compare the new mass to the old as a multiplier: m₂ ÷ m₁; above 1 is a gain.",
    mistakes: ["Divide by the start mass, not the end mass.", "Keep the sign: a loss is negative."],
    ex: "A potato chip had a mass of 2.50 g and 2.15 g after an hour in sugar solution. Find the percentage change in mass." }));

  L.push(build({ id: "recapture", subj: "biology", name: "Population estimate (mark–recapture)", icon: "🐞", draw: "recapture",
    kw: ["mark", "marked", "recapture", "recaptured", "capture", "lincoln", "estimate the population", "tagged", "released"],
    vars: [V("M1", "M", "Marked in first sample", "", "none", ["marked", "tagged", "caught and marked", "first"], { ord: 1 }), V("C2", "C", "Caught in second sample", "", "none", ["second", "caught", "later"], { ord: 2 }), V("R", "R", "Marked ones recaught", "", "none", ["were marked", "of which", "had marks", "recaptured"], { ord: 3 }), V("N", "N", "Estimated population", "", "none", [], { ask: ["population", "estimate", "how many"] })],
    eqs: [E("N", "M1*C2/R", { R: "M1*C2/N", M1: "N*R/C2", C2: "N*R/M1" })], finds: ["N"],
    idea: "If 1 in 5 of the second catch is marked, then the marked animals are about 1 in 5 of the whole population.",
    alt: "Set up the proportion: R ÷ C = M ÷ N, then solve for N.",
    mistakes: ["It's first × second ÷ recaptured marked, not the other way round.", "Assumes marks don't wash off and animals mix back in."],
    ex: "40 beetles are caught and marked. Later 50 are caught, 8 of which are marked. Estimate the population." }));

  return { L, build, E, V, cmp };
})(typeof SV !== "undefined" ? SV : require("./core.js"));
if (typeof module !== "undefined") module.exports = ST;
