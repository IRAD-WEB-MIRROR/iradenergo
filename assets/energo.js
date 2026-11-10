/* energo.js — informer, schedule of works, calculator. ver 3.2 */
(function () {
  var ROOT = window.ROOT || "";
  var SRC = ["https://iradgov.org/data/today.json", ROOT + "data/today.json"];
  function $(id) { return document.getElementById(id); }
  function q(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function irDate(off) { return new Date(Date.now() + 6 * 3600e3 + (off || 0) * 86400e3).toISOString().slice(0, 10); }
  function irHM() { return new Date(Date.now() + 6 * 3600e3).toISOString().slice(11, 16); }
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function human(iso) { var p = iso.split("-"); return +p[2] + " " + MON[+p[1] - 1] + " " + p[0]; }
  function dm(iso) { var p = iso.split("-"); var w = new Date(iso + "T12:00:00Z").getUTCDay(); return WD[w] + " " + (+p[2]) + "." + p[1]; }
  function get(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw r.status; return r.json(); });
  }
  function today() {
    return get(SRC[0]).catch(function () { return get(SRC[1]); });
  }
  function setText(sel, t) { q(sel).forEach(function (e) { e.textContent = t; }); }

  /* ---- informer ---- */
  var T = null;
  function lowOf(place, iso) {
    if (!T || !T.weather) return null;
    var p = (T.weather.places || []).filter(function (x) { return x.id === place; })[0];
    if (!p) return null;
    if (iso === T.date) return p.low;
    var f = (p.forecast || []).filter(function (x) { return x.date === iso; })[0];
    return f ? f.low : null;
  }
  function informer(d) {
    T = d;
    var tk = d.water && d.water.toktogul, pw = d.power || {}, se = d.season || {};
    if (tk) {
      setText(".tk-storage", tk.storage_km3.toFixed(2).replace(".", ","));
      setText(".tk-pct", tk.fill_pct.toFixed(1).replace(".", ","));
      setText(".tk-change", (tk.change_mcm > 0 ? "+" : "") + tk.change_mcm);
      setText(".tk-trend", tk.trend_label.en);
      q(".ring").forEach(function (e) { e.style.setProperty("--p", tk.fill_pct); });
      var dot = $("tkdot");
      if (dot) {
        var p = d.date.split("-"), doy = (Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(+p[0], 0, 1)) / 86400e3;
        dot.setAttribute("cx", (50 + doy / 365 * 600).toFixed(1));
        dot.setAttribute("cy", (230 - tk.storage_km3 / 19 * 200).toFixed(1));
        dot.style.display = "";
      }
    }
    setText(".tk-date", human(d.date));
    if (pw.supply) setText(".pw-supply", pw.supply.en);
    if (pw.exports) setText(".pw-exports", pw.exports.en);
    var cuts = pw.supply && /no scheduled cuts/i.test(pw.supply.en);
    q(".rat-status").forEach(function (e) {
      e.textContent = cuts ? "NOT IN FORCE" : "SEE SUPPLY NOTICE";
      e.className = "rat-status st " + (cuts ? "done" : "now");
    });
    if (se.heating) {
      setText(".heat-state", se.heating.on ? "on since " + human(se.heating.from) : "off");
    }
    if (se.label) setText(".season-label", se.label.en.toLowerCase());
    var tl = (d.weather && d.weather.places || []).filter(function (x) { return x.id === "talas"; })[0];
    if (tl) setText(".talas-temp", (tl.high > 0 ? "+" : "") + tl.high + " / " + (tl.low > 0 ? "+" : "") + tl.low + " °C");
    var run = $("runtxt");
    if (run) {
      var bits = [];
      if (pw.supply) bits.push(pw.supply.en);
      if (tk) bits.push("Toktogul reservoir " + human(d.date) + ": " + tk.storage_km3.toFixed(2) + " km³ (" + tk.fill_pct.toFixed(1) + "% of full storage), " + tk.trend_label.en.toLowerCase() + " " + Math.abs(tk.change_mcm) + " million m³ a day.");
      if (pw.exports) bits.push(pw.exports.en);
      if (se.heating && se.heating.on) bits.push("The heating season is on. Please do not use electric heaters at full power from 18:00 to 22:00.");
      bits.push("Pay your bill by the 25th of the month at Talasbank, Irad Pochtasy or pay.e-irad.org. Faults: 1-55.");
      run.textContent = bits.join("   ✦   ");
    }
    if (window.OUT) drawOut();
  }

  /* ---- planned works ---- */
  var NETS = { all: "All networks" };
  var sel = { day: irDate(), net: "all" };
  /* emergency disconnections from today's incidents (storm damage): the same areas and times as Attelkom's status page */
  function emergency(d) {
    var l = (d.incidents && d.incidents.list || []).filter(function (x) {
      return x.power && x.power.length && x.state !== "ended" && (!x.end || Date.parse(x.end) > Date.now() - 6 * 3600e3);
    });
    var now = irDate() + " " + irHM(), h = "";
    l.forEach(function (x) {
      var rows = x.power.filter(function (r) { return r.to > now; });
      if (!rows.length) return;
      h += "<div class='warn'><b>Emergency disconnections, " + human(rows[0].from.slice(0, 10)) + ".</b> " + ((x.lines && x.lines.power && x.lines.power.en) || "") + "<br>" +
        rows.map(function (r) { return "<b>" + r.area + "</b> (" + r.addr + "): " + r.from.slice(11) + "–" + r.to.slice(11) + (r.from <= now ? " <span class='st now'>Under way</span>" : ""); }).join("<br>") +
        "<br><span class=sm>Times of restoration are approximate. Report faults to the line 1-55.</span></div>";
    });
    q(".emerg").forEach(function (e) { e.innerHTML = h; e.hidden = !h; });
  }
  function status(r) {
    var t = irDate();
    if (r.cancel) return ["Cancelled", "done"];
    var lo = lowOf(r.place, r.date);
    if (r.date >= t && lo !== null && lo <= -15) return ["Postponed (frost)", "post"];
    if (r.date < t) return ["Completed", "done"];
    if (r.date > t) return ["Planned", "plan"];
    var hm = irHM();
    if (hm < r.from) return ["Planned", "plan"];
    if (hm < r.to) return ["Under way", "now"];
    return ["Completed", "done"];
  }
  function row(r) {
    var s = status(r);
    return "<tr" + (r.date === irDate() ? ' class="today"' : r.date < irDate() ? ' class="past"' : "") + "><td>" + dm(r.date) + "<br><span class=sm>" + r.from + "–" + r.to + "</span></td><td><b>" + r.area + "</b><br>" + r.addr +
      "</td><td>" + r.work + "<br><span class=sm>" + r.feed + "</span></td><td>" + r.network + (r.operator ? "<br><span class=sm>" + r.operator + "</span>" : "") +
      "</td><td><span class='st " + s[1] + "'>" + s[0] + "</span><br><span class=sm>" + r.id + "</span></td></tr>";
  }
  function drawOut() {
    var tb = $("out-body"); if (!tb || !window.OUT) return;
    var mode = tb.getAttribute("data-mode");
    var rows;
    if (mode === "home") {
      var t0 = irDate(), qv = (($("out-q") || {}).value || "").trim().toLowerCase();
      var t2 = irDate(qv ? 14 : 3);
      rows = OUT.filter(function (r) { return r.date >= t0 && r.date <= t2 && (!qv || (r.area + " " + r.addr + " " + r.network).toLowerCase().indexOf(qv) >= 0); }).slice(0, qv ? 20 : 6);
    } else {
      rows = OUT.filter(function (r) { return r.date === sel.day && (sel.net === "all" || r.net === sel.net); });
    }
    tb.innerHTML = rows.length ? rows.map(row).join("") : "<tr><td colspan=5 class=sm>No planned disconnections for the selected day and network.</td></tr>";
    var tabs = $("out-days");
    if (tabs) {
      var h = "";
      for (var i = -3; i <= 10; i++) {
        var dd = irDate(i);
        h += "<a href='#" + dd + "' data-d='" + dd + "'" + (dd === sel.day ? " class=on" : "") + ">" + dm(dd) + (i === 0 ? " (today)" : "") + "</a>";
      }
      tabs.innerHTML = h;
      q("#out-days a").forEach(function (a) {
        a.onclick = function (e) { e.preventDefault(); sel.day = a.getAttribute("data-d"); drawOut(); };
      });
    }
    setText(".out-sel", human(sel.day));
  }
  function outages() {
    if (!$("out-body")) return;
    get(ROOT + "data/outages.json").then(function (d) {
      window.OUT = d.rows;
      var ns = $("out-net");
      if (ns) {
        ns.onchange = function () { sel.net = ns.value; drawOut(); };
      }
      if (location.hash.length === 11) sel.day = location.hash.slice(1);
      var qi = $("out-q"); if (qi) qi.oninput = drawOut;
      drawOut();
    }).catch(function () {});
  }

  /* ---- tariff calculator ---- */
  function calc() {
    var f = $("calc"); if (!f) return;
    f.onsubmit = function (e) {
      e.preventDefault();
      var a = parseFloat(f.prev.value), b = parseFloat(f.cur.value), t = parseFloat(f.group.value);
      var out = $("calc-out");
      if (isNaN(a) || isNaN(b) || b < a) { out.innerHTML = "<span style='color:#c00'>Check the meter readings: the current reading must not be less than the previous one.</span>"; return; }
      var kwh = b - a, sum = kwh * t;
      out.innerHTML = "Consumption: <b>" + kwh.toLocaleString("en") + " kWh</b> × " + t.toFixed(2) + " som = <b class=big>" + sum.toFixed(2) + " som</b><br><span class=sm>The amount is approximate. Penalties, debts and service charges are not included. Pay by the 25th of the month.</span>";
    };
  }

  /* ---- e-Irad temporary slip (cabinet.html): planned works at the slip holder's address ---- */
  function slipWorks() {
    document.addEventListener("irad-slip", function (ev) {
      var box = document.querySelector(".isl-works"); if (!box) return;
      var st = box.getAttribute("data-street"), town = box.getAttribute("data-town"), slug = town.toLowerCase().replace(/ı/g, "i").replace(/\s+/g, "-");
      var from = irDate(), to = irDate(60);
      get(ROOT + "data/outages.json").then(function (d) {
        var rows = d.rows.filter(function (r) { return r.date >= from && r.date <= to && !r.cancel && r.addr.indexOf(st) >= 0 && (r.place === slug || r.addr.indexOf(town) >= 0); });
        box.innerHTML = "<h3>Planned works at your address</h3>" + (rows.length ? "<table class='isl-t'>" + rows.map(function (r) {
          return "<tr><td>" + dm(r.date) + "</td><td>" + r.from + "–" + r.to + "</td><td>" + r.work + "</td></tr>"; }).join("") + "</table><p class=sm>Full schedule: <a href='" + ROOT + "outages.html'>planned disconnections</a>.</p>"
          : "<p>No planned disconnections at your address in the next 60 days.</p>");
      }).catch(function () {});
    });
  }

  /* ---- counter ---- */
  function counter() {
    var c = $("cnt"); if (!c) return;
    var d = irDate(), n = 0;
    for (var i = 0; i < d.length; i++) n = (n * 31 + d.charCodeAt(i)) % 9973;
    var h = +irHM().slice(0, 2);
    c.textContent = "today " + (300 + n % 700 + h * 37) + " | total " + (2318004 + Math.floor((Date.now() - 1.7e12) / 864e5) * 1450 + h * 37).toLocaleString("ru");
  }

  /* ---- slider and counters ---- */
  function slider() {
    var sl = q(".slide"), dots = q(".dots button"), i = 0, timer;
    if (!sl.length) return;
    function go(n) { sl[i].classList.remove("on"); dots[i].classList.remove("on"); i = (n + sl.length) % sl.length; sl[i].classList.add("on"); dots[i].classList.add("on"); }
    dots.forEach(function (d, n) { d.onclick = function () { clearInterval(timer); go(n); }; });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) timer = setInterval(function () { go(i + 1); }, 6500);
  }
  function counters() {
    q(".count").forEach(function (el) {
      var n = parseFloat(el.getAttribute("data-n")), dgt = +(el.getAttribute("data-d") || 0), t0 = null;
      function step(ts) {
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0) / 1400), v = n * (1 - Math.pow(1 - k, 3));
        el.textContent = dgt ? v.toFixed(dgt) : Math.round(v).toLocaleString("en");
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    slider(); counters();
    today().then(function (d) { informer(d); emergency(d); }).catch(function () { setText(".pw-supply", "Information is temporarily unavailable."); });
    outages(); calc(); counter(); slipWorks();
  });
})();
