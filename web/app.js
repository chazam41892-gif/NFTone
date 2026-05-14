// NFTones — single-page app.
//
// Data access goes through window.NFTONES_DATA_SOURCE (dataSource.js):
//   - useApi:false (default) → reads window.NFTONES_MOCK (mock-data/data.js)
//   - useApi:true            → fetches from nftones-api
//
// The local `D` cache below is a STABLE reference. In mock mode it starts as
// window.NFTONES_MOCK so all existing sync mutation paths (revoke, new release)
// continue to work unchanged. In API mode it starts as an empty shape, then
// hydrateAll() populates it before the first render.

(() => {
  const DS = window.NFTONES_DATA_SOURCE;
  const D = DS.useApi
    ? { wallets: [], releases: [], grants: [], scans: [], evidenceReports: [], tokenEvents: [], balances: {} }
    : window.NFTONES_MOCK;

  // ------- helpers -------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const fmtDur = (sec) => `${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;
  const riskClass = (r) => r < 25 ? "low" : r < 50 ? "med" : "high";
  const riskLabel = (r) => r < 25 ? "low" : r < 50 ? "med" : "high";

  // ------- routing -------
  function go(view) {
    $$(".view").forEach(v => v.classList.toggle("is-active", v.dataset.view === view));
    $$(".nav__link").forEach(a => a.classList.toggle("is-active", a.dataset.view === view));
    const labels = {
      dashboard: "Dashboard", releases: "Release registry", access: "Wallet access",
      watermarks: "Watermark map", leakcheck: "Leak check", evidence: "Evidence", token: "Token flow"
    };
    $("#crumb").textContent = labels[view] || "NFTones";
    $(".sidebar").classList.remove("is-open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  window.addEventListener("hashchange", () => {
    const v = (location.hash || "#dashboard").slice(1);
    go(v);
  });
  $$("[data-view]").forEach(el => el.addEventListener("click", (e) => {
    if (el.dataset.view && el.tagName === "A") return; // hash-handled
  }));
  $$("[data-go]").forEach(el => el.addEventListener("click", () => location.hash = "#" + el.dataset.go));

  // ------- mobile nav -------
  $("#navToggle").addEventListener("click", () => $(".sidebar").classList.toggle("is-open"));

  // ------- counters -------
  function animateCount(el, target, duration = 800) {
    const start = performance.now();
    const initial = parseFloat(el.textContent) || 0;
    function tick(t) {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(initial + (target - initial) * eased).toString();
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ------- hero waveform -------
  function buildWaveform() {
    const wave = $("#heroWave");
    const seed = [4,7,12,18,24,30,38,46,52,58,62,66,70,72,70,66,62,58,52,46,40,34,28,22,16,12,8,16,24,32,40,48,56,62,68,72,68,62,54,46,38,30,22,16,10,6,12,20,30,42,54,66,72,68,60,50,40,30,22,14,8,5];
    const html = seed.map((v,i) => `<i style="height:${v}%; --d:${(i*60)%2400}ms"></i>`).join("");
    wave.innerHTML = html;
  }

  // ------- dashboard -------
  function renderDashboard() {
    // KPIs
    $$(".kpi__num[data-count]").forEach(el => animateCount(el, parseInt(el.dataset.count, 10)));

    // Activity timeline (synthesize from mock data)
    const events = [];
    D.scans.slice().sort((a,b) => b.uploaded_at.localeCompare(a.uploaded_at)).forEach(s => {
      const ok = s.status === "matched";
      events.push({
        when: s.uploaded_at,
        kind: ok ? "ok" : (s.status === "nomatch" ? "warn" : "danger"),
        msg: ok
          ? `Leak attributed for <b>${s.release_title}</b> → wallet <b>${s.matched_wallet}</b> (${s.confidence}%)`
          : `Leak scan on <b>${s.release_title}</b> — no NFTones watermark detected`
      });
    });
    D.releases.forEach(r => events.push({
      when: r.created_at, kind: "ok",
      msg: `Release anchored: <b>${r.title}</b> · ${r.access_count} access NFTs`
    }));
    events.sort((a,b) => b.when.localeCompare(a.when));

    $("#activityList").innerHTML = events.slice(0, 6).map(e => `
      <li>
        <div class="tl__dot tl__dot--${e.kind}"></div>
        <div class="tl__msg">${e.msg}</div>
        <div class="tl__when">${fmtDate(e.when)}</div>
      </li>
    `).join("");

    // Exposure bars
    const max = Math.max(...D.releases.map(r => r.access_count));
    $("#exposureBars").innerHTML = D.releases.map(r => `
      <div class="bar">
        <div class="bar__name">${r.title}</div>
        <div class="bar__track"><div class="bar__fill" style="width:${(r.access_count/max)*100}%"></div></div>
        <div class="bar__val">${r.access_count}</div>
      </div>
    `).join("");
  }

  // ------- releases -------
  function coverSVG(release) {
    const h = release.cover_hue;
    const accent = `hsl(${h},70%,60%)`;
    const dark   = `hsl(${(h+200)%360},40%,12%)`;
    const mid    = `hsl(${h},35%,22%)`;

    if (release.art_style === "ember") {
      return `<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="g${release.id}" cx="30%" cy="100%" r="80%">
            <stop offset="0%" stop-color="${accent}" stop-opacity=".9"/>
            <stop offset="60%" stop-color="${mid}" stop-opacity=".4"/>
            <stop offset="100%" stop-color="${dark}"/>
          </radialGradient>
        </defs>
        <rect width="400" height="220" fill="url(#g${release.id})"/>
        ${Array.from({length:80}, (_,i) => {
          const x = Math.random()*400, y = 220 - Math.random()*180, r = Math.random()*1.2 + .3;
          return `<circle cx="${x}" cy="${y}" r="${r}" fill="${accent}" opacity="${Math.random()*.6}"/>`;
        }).join("")}
        <path d="M0 180 Q 100 ${140 + Math.random()*30} 200 170 T 400 165" stroke="${accent}" stroke-width="1" fill="none" opacity=".5"/>
      </svg>`;
    }
    if (release.art_style === "vapor") {
      return `<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="g${release.id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${dark}"/>
            <stop offset="100%" stop-color="${accent}" stop-opacity=".5"/>
          </linearGradient>
        </defs>
        <rect width="400" height="220" fill="url(#g${release.id})"/>
        ${Array.from({length:14}, (_,i) => {
          const y = 30 + i*14;
          return `<line x1="0" y1="${y}" x2="400" y2="${y - 8}" stroke="${accent}" stroke-width=".6" opacity="${.15 + i*.04}"/>`;
        }).join("")}
        <circle cx="280" cy="80" r="46" fill="none" stroke="${accent}" stroke-width="1.4" opacity=".6"/>
        <circle cx="280" cy="80" r="30" fill="none" stroke="${accent}" stroke-width=".8" opacity=".4"/>
      </svg>`;
    }
    // tidal (default)
    return `<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="g${release.id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${dark}"/>
          <stop offset="100%" stop-color="${mid}"/>
        </linearGradient>
      </defs>
      <rect width="400" height="220" fill="url(#g${release.id})"/>
      ${Array.from({length:6}, (_,i) => {
        const a = .15 + i*.12;
        const yo = 60 + i*22;
        return `<path d="M0 ${yo} Q 100 ${yo - 30 - i*4} 200 ${yo} T 400 ${yo}" stroke="${accent}" stroke-width="1.4" fill="none" opacity="${a}"/>`;
      }).join("")}
      <path d="M0 130 Q 100 100 200 130 T 400 130" stroke="${accent}" stroke-width="2.2" fill="none"/>
    </svg>`;
  }

  function renderReleases() {
    $("#releaseGrid").innerHTML = D.releases.map(r => `
      <article class="release">
        <div class="release__cover">${coverSVG(r)}</div>
        <div class="release__body">
          <div class="release__title">${r.title}</div>
          <div class="release__artist">${r.artist} · ${fmtDur(r.duration_sec)}</div>
          <div class="release__meta">
            <div><span>access NFTs</span><b>${r.access_count}</b></div>
            <div><span>renders</span><b>${r.renders}</b></div>
            <div><span>anchored</span><b>${fmtDate(r.created_at)}</b></div>
            <div><span>status</span><b>${r.revoked ? "<span class='chip chip--danger'>revoked</span>" : "<span class='chip chip--ok'>active</span>"}</b></div>
          </div>
          <div class="release__hash" title="${r.master_hash}">${r.master_hash.slice(0, 36)}…</div>
        </div>
      </article>
    `).join("");
  }

  // ------- access -------
  function walletByAddr(addr) { return D.wallets.find(w => w.wallet === addr); }

  function renderAccess() {
    // populate release filter once
    const sel = $("#accessReleaseFilter");
    if (sel.children.length === 1) {
      D.releases.forEach(r => {
        const o = document.createElement("option");
        o.value = r.id; o.textContent = r.title;
        sel.appendChild(o);
      });
    }

    const rel  = $("#accessReleaseFilter").value;
    const tier = $("#accessTierFilter").value;
    const stat = $("#accessStatusFilter").value;

    const rows = D.grants.filter(g =>
      (rel === "all"  || g.release_id === rel) &&
      (tier === "all" || g.tier === tier) &&
      (stat === "all" || g.status === stat)
    );

    $("#accessTable tbody").innerHTML = rows.map(g => {
      const w = walletByAddr(g.wallet);
      const r = D.releases.find(x => x.id === g.release_id);
      const rc = riskClass(w?.risk ?? 0);
      const statusChip = g.status === "active"
        ? `<span class="chip chip--ok">active</span>`
        : `<span class="chip chip--danger">revoked</span>`;
      return `<tr>
        <td>
          <div style="font-weight:700;color:var(--text-0)">${w?.label || "—"}</div>
          <div class="mono" style="margin-top:2px">${g.wallet}</div>
        </td>
        <td>${r?.title || g.release_id}</td>
        <td><span class="chip chip--muted">${g.tier}</span></td>
        <td class="mono">${g.watermark_id}</td>
        <td>${statusChip}</td>
        <td class="mono" style="font-size:11px">${fmtDate(g.last_access)}</td>
        <td class="num"><span class="risk risk--${rc}"><span class="risk__dot"></span>${w?.risk ?? 0}</span></td>
        <td>${g.status === "active" ? `<button class="btn btn--ghost btn--sm" data-revoke="${g.id}">Revoke</button>` : ""}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:32px">No grants match these filters.</td></tr>`;

    $$("#accessTable [data-revoke]").forEach(btn => btn.addEventListener("click", () => {
      const g = D.grants.find(x => x.id === btn.dataset.revoke);
      g.status = "revoked";
      g.revoked_at = new Date().toISOString();
      toast(`Access revoked for ${g.wallet}. Future renders blocked.`);
      renderAccess();
    }));
  }

  ["#accessReleaseFilter","#accessTierFilter","#accessStatusFilter"]
    .forEach(s => $(s).addEventListener("change", renderAccess));

  // ------- watermarks -------
  function renderWatermarks() {
    $("#wmTable").innerHTML = D.grants.map(g => {
      const r = D.releases.find(x => x.id === g.release_id);
      const w = walletByAddr(g.wallet);
      // synthesize a render hash + cost
      const renderHash = "blake3:" + g.watermark_id.slice(3) + "…";
      const cost = "0.40";
      return `<tr>
        <td class="mono" style="color:var(--accent)">${g.watermark_id}</td>
        <td>${r?.title || ""}</td>
        <td>
          <div style="color:var(--text-0)">${w?.label || ""}</div>
          <div class="mono" style="font-size:11px;color:var(--text-3)">${g.wallet}</div>
        </td>
        <td class="mono" style="font-size:11px">${renderHash}</td>
        <td>
          <span class="chip chip--ok">A</span>
          <span class="chip chip--ok">B</span>
          <span class="chip">C</span>
        </td>
        <td class="num">${cost}</td>
      </tr>`;
    }).join("");
  }

  // ------- leak check / scanner -------
  let scanRunning = false;

  function resetScanner() {
    $$(".stage").forEach(s => {
      s.classList.remove("is-done","is-fail");
      s.style.setProperty("--p","0%");
      $(".stage__pct", s).textContent = "0%";
    });
    $("#scanResult").hidden = true;
    $("#scanResult").innerHTML = "";
  }

  function runScan(scanId) {
    if (scanRunning) return;
    scanRunning = true;

    const s = D.scans.find(x => x.id === scanId);
    $("#scanner").hidden = false;
    $("#scanFile").textContent = s.input_filename;
    $("#scanHash").textContent = s.input_hash.slice(0, 48) + "…";
    resetScanner();

    const stages = $$(".stage");
    let i = 0;

    function nextStage() {
      if (i >= stages.length) {
        scanRunning = false;
        renderResult(s);
        return;
      }
      const stage = stages[i];
      const stageName = stage.dataset.stage;
      // determine outcome of this stage based on s.layers_recovered or status
      let willFail = false;
      if (s.status === "nomatch" && (stageName === "layerA" || stageName === "layerB" || stageName === "layerC" || stageName === "match")) {
        willFail = true;
      } else if (stageName === "layerA" && s.layers_recovered && s.layers_recovered.A === false) willFail = true;
      else if (stageName === "layerB" && s.layers_recovered && s.layers_recovered.B === false) willFail = true;
      else if (stageName === "layerC" && s.layers_recovered && s.layers_recovered.C === false) willFail = true;

      let p = 0;
      const dur = 380 + Math.random()*220;
      const start = performance.now();
      function step(t) {
        const e = Math.min(1, (t - start)/dur);
        p = Math.round(e*100);
        stage.style.setProperty("--p", p + "%");
        $(".stage__pct", stage).textContent = (willFail && e === 1) ? "fail" : p + "%";
        if (e < 1) requestAnimationFrame(step);
        else {
          stage.classList.add(willFail ? "is-fail" : "is-done");
          $(".stage__pct", stage).textContent = willFail ? "fail" : "done";
          i++;
          setTimeout(nextStage, 140);
        }
      }
      requestAnimationFrame(step);
    }
    nextStage();
  }

  function renderResult(s) {
    const box = $("#scanResult");
    box.hidden = false;

    if (s.status === "nomatch") {
      box.innerHTML = `
        <div class="result-banner result-banner--none">
          <div class="result-banner__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
          </div>
          <div>
            <h4>No NFTones watermark detected</h4>
            <p>${s.notes || "This file does not appear to contain an NFTones-rendered payload."}</p>
          </div>
        </div>
        <div class="result-grid">
          <div class="result-cell"><h5>Layers recovered</h5><div class="layer-pills"><span class="chip chip--muted">A —</span><span class="chip chip--muted">B —</span><span class="chip chip--muted">C —</span></div></div>
          <div class="result-cell"><h5>Compute cost</h5><div class="v">${s.ktrs_cost} <span style="color:var(--ktrs);font-size:12px">$KTRS</span></div></div>
        </div>`;
      return;
    }

    const grant = D.grants.find(g => g.id === s.matched_grant_id);
    const wallet = walletByAddr(s.matched_wallet);
    const release = D.releases.find(r => r.id === s.release_id);

    const conf = s.confidence;
    const confColor = conf >= 85 ? "var(--accent)" : conf >= 70 ? "var(--warn)" : "var(--danger)";
    const bannerVariant = conf >= 85 ? "ok" : "warn";
    const layerPill = (k, ok) => `<span class="chip chip--${ok ? "ok" : "muted"}">${k} ${ok ? "✓" : "—"}</span>`;

    box.innerHTML = `
      <div class="result-banner result-banner--${bannerVariant}">
        <div class="result-banner__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 13 4 4L19 7"/></svg>
        </div>
        <div>
          <h4>Match · ${conf}% confidence</h4>
          <p>The leaked file's payload corresponds to <b>${wallet?.label}</b> (<span class="mono">${s.matched_wallet}</span>)'s render of <b>${release.title}</b>.</p>
        </div>
      </div>

      <div class="result-grid">
        <div class="result-cell">
          <h5>Identified wallet</h5>
          <div class="v">${s.matched_wallet}</div>
          <div style="font-size:12px;color:var(--text-2);margin-top:6px">${wallet?.label}</div>
        </div>
        <div class="result-cell">
          <h5>Watermark ID</h5>
          <div class="v" style="color:var(--accent)">${s.matched_wm_id}</div>
        </div>
        <div class="result-cell">
          <h5>Confidence</h5>
          <div class="v v--big" style="color:${confColor}">${conf}%</div>
          <div class="confidence-bar"><i style="width:${conf}%;background:${confColor}"></i></div>
        </div>
        <div class="result-cell">
          <h5>Layers recovered</h5>
          <div class="layer-pills">
            ${layerPill("A", s.layers_recovered.A)}
            ${layerPill("B", s.layers_recovered.B)}
            ${layerPill("C", s.layers_recovered.C)}
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-top:8px;font-family:var(--mono)">~${s.transcodes_estimated} transcode${s.transcodes_estimated===1?"":"s"} estimated</div>
        </div>
        <div class="result-cell">
          <h5>Grant tier</h5>
          <div class="v">${grant?.tier}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:6px">minted ${fmtDate(grant?.minted_at)}</div>
        </div>
        <div class="result-cell">
          <h5>Compute cost</h5>
          <div class="v">${s.ktrs_cost} <span style="color:var(--ktrs);font-size:12px">$KTRS</span></div>
        </div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn--primary" data-evidence="${s.id}">Generate evidence report (0.90 $KTRS)</button>
        <button class="btn btn--ghost" data-go="evidence">View past reports</button>
      </div>
    `;

    $$("[data-evidence]", box).forEach(b => b.addEventListener("click", () => {
      toast("Evidence report generated, signed, and anchored to Solana.");
      // promote scan to evidence list (idempotent)
      const exists = D.evidenceReports.find(e => e.scan_id === s.id);
      if (!exists) {
        D.evidenceReports.unshift({
          id: "ev_" + (D.evidenceReports.length + 1).toString().padStart(3,"0"),
          scan_id: s.id, release_id: s.release_id,
          matched_wallet: s.matched_wallet, wallet_label: walletByAddr(s.matched_wallet)?.label,
          confidence: s.confidence, generated_at: new Date().toISOString(),
          report_hash: "blake3:" + Math.random().toString(16).slice(2, 18),
          on_chain_anchor: "5KX...evidence_tx_" + Math.random().toString(16).slice(2,5),
          nft_history: [{ event: "mint", to: s.matched_wallet, at: D.grants.find(g => g.id === s.matched_grant_id)?.minted_at, tx: "5KX...mint_" + Math.random().toString(16).slice(2,4) }]
        });
        renderEvidence();
      }
      setTimeout(() => location.hash = "#evidence", 600);
    }));
    $$("[data-go]", box).forEach(el => el.addEventListener("click", () => location.hash = "#" + el.dataset.go));
  }

  // dropzone
  function setupDropzone() {
    const dz = $("#dropzone");
    dz.addEventListener("click", () => {
      // pick a default demo
      runScan("scan_001");
    });
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("is-drag"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("is-drag"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault(); dz.classList.remove("is-drag");
      // any drop runs a demo scan — we don't actually read the file in this prototype
      runScan("scan_001");
    });
    $$(".dz__demo [data-demo]").forEach(b => b.addEventListener("click", (e) => {
      e.stopPropagation();
      runScan(b.dataset.demo);
    }));
  }

  // ------- evidence -------
  function renderEvidence() {
    const list = $("#evidenceList");
    if (D.evidenceReports.length === 0) {
      list.innerHTML = `<div class="card" style="text-align:center;color:var(--text-3);padding:40px">No evidence reports yet. Run a leak check, then generate a report.</div>`;
      return;
    }
    list.innerHTML = D.evidenceReports.map(e => {
      const r = D.releases.find(x => x.id === e.release_id);
      const scan = D.scans.find(s => s.id === e.scan_id);
      return `<article class="evidence-card">
        <header class="evidence-card__head">
          <div class="evidence-card__title">${r?.title} <small>${e.id} · generated ${fmtDate(e.generated_at)}</small></div>
          <span class="chip chip--${e.confidence >= 85 ? "ok" : "warn"}">${e.confidence}% confidence</span>
        </header>
        <div class="evidence-card__body">
          <div class="evidence-card__col">
            <div class="evidence-card__field"><h6>Identified wallet</h6><div class="v">${e.matched_wallet}</div><div style="font-size:12px;color:var(--text-2);margin-top:4px">${e.wallet_label}</div></div>
            <div class="evidence-card__field"><h6>Source scan</h6><div class="v">${e.scan_id} · ${scan?.input_filename || ""}</div></div>
            <div class="evidence-card__field"><h6>Report hash</h6><div class="v">${e.report_hash}</div></div>
            <div class="evidence-card__field"><h6>On-chain anchor</h6><div class="v" style="color:var(--accent)">${e.on_chain_anchor}</div></div>
          </div>
          <div class="evidence-card__col">
            <div class="evidence-card__field">
              <h6>NFT transfer history</h6>
              <ul class="nft-history">
                ${e.nft_history.map(h => `<li><span class="nft-history__kind">${h.event}</span><span>to <b>${h.to}</b></span><span style="color:var(--text-3)">${fmtDate(h.at)}</span></li>`).join("")}
              </ul>
            </div>
            <div class="evidence-card__field">
              <h6>Caveats</h6>
              <div style="font-size:12px;color:var(--text-2);line-height:1.55">
                Evidence reflects the watermark-payload-to-wallet mapping at render time. NFT transfers since render are recorded above for context but do not change the attribution: leaks are attributed to the wallet that <em>received the rendered file</em>.
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn--ghost btn--sm" onclick="event.preventDefault()">Download PDF</button>
              <button class="btn btn--ghost btn--sm" onclick="event.preventDefault()">Copy hash</button>
            </div>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  // ------- token -------
  function renderToken() {
    $("#tokenTable").innerHTML = D.tokenEvents.slice().sort((a,b) => b.at.localeCompare(a.at)).map(e => {
      const tokenColor = e.token === "KTRS" ? "var(--ktrs)" : "var(--lvtn)";
      const sign = e.kind === "lvtn_stake_reward" ? "+" : "-";
      return `<tr>
        <td class="mono" style="font-size:11px;color:var(--text-3)">${fmtDate(e.at)}</td>
        <td><span class="chip chip--muted">${e.kind}</span></td>
        <td>${e.reason}</td>
        <td class="num">${sign}${e.amount}</td>
        <td><span class="mono" style="color:${tokenColor};font-weight:700">${e.token}</span></td>
      </tr>`;
    }).join("");
  }

  // ------- new release modal -------
  function openModal() { $("#newReleaseModal").hidden = false; }
  function closeModal() { $("#newReleaseModal").hidden = true; $("#newReleaseForm").reset(); $("#masterFileName").textContent = "no file selected"; updateNRTotal(); }

  $("#newReleaseBtn").addEventListener("click", openModal);
  $$("[data-close]").forEach(el => el.addEventListener("click", closeModal));
  $("#masterPickBtn").addEventListener("click", () => $("#masterPick").click());
  $("#masterPick").addEventListener("change", (e) => {
    $("#masterFileName").textContent = e.target.files[0]?.name || "no file selected";
  });
  $("#newReleaseForm").addEventListener("input", updateNRTotal);
  function updateNRTotal() {
    const wallets = $("#newReleaseForm [name=wallets]").value.split("\n").map(s => s.trim()).filter(Boolean).length;
    const total = (2.80 + wallets*0.20 + wallets*0.40).toFixed(2);
    $("#nrTotal").textContent = total + " $KTRS";
  }
  $("#newReleaseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value;
    const artist = f.artist.value;
    const wallets = f.wallets.value.split("\n").map(s => s.trim()).filter(Boolean);
    const id = "rel_" + (D.releases.length + 1).toString().padStart(3,"0");
    const newRelease = {
      id, title, artist, slug: title.toLowerCase().replace(/[^a-z0-9]+/g,"-"),
      duration_sec: 180 + Math.floor(Math.random()*120),
      master_hash: "blake3:" + Math.random().toString(16).slice(2,34) + Math.random().toString(16).slice(2,34),
      fingerprint_uri: `store://fingerprints/${id}.fp`,
      anchor_tx: "5KX...solana_tx_" + Math.random().toString(16).slice(2,5),
      created_at: new Date().toISOString(),
      access_count: wallets.length, renders: wallets.length,
      revoked: false,
      cover_hue: Math.floor(Math.random()*360),
      art_style: ["tidal","ember","vapor"][Math.floor(Math.random()*3)],
    };
    D.releases.unshift(newRelease);
    wallets.forEach((w, i) => {
      D.grants.push({
        id: "gr_" + Math.random().toString(16).slice(2,6),
        release_id: id, wallet: w,
        watermark_id: "wm_" + Math.random().toString(16).slice(2,10),
        tier: "collaborator", status: "active",
        minted_at: new Date().toISOString(), last_access: null,
      });
      if (!walletByAddr(w)) D.wallets.push({ wallet: w, label: `New collaborator #${i+1}`, tier: "collaborator", verified: false, risk: 20 });
    });
    closeModal();
    toast(`Release "${title}" anchored. ${wallets.length} access NFT${wallets.length===1?"":"s"} minted.`);
    renderReleases(); renderAccess(); renderWatermarks(); renderDashboard();
    location.hash = "#releases";
  });

  // ------- toast -------
  let toastT;
  function toast(msg) {
    $("#toastMsg").textContent = msg;
    $("#toast").hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { $("#toast").hidden = true; }, 3200);
  }

  // ------- init -------
  // Chrome that doesn't need data renders immediately.
  buildWaveform();
  setupDropzone();

  // Hydrate D from the configured data source, then render every view.
  // In mock mode this resolves synchronously and D was already populated
  // at IIFE-top, so the demo is byte-identical to the pre-API behavior.
  // In API mode this waits on the nftones-api fetches before the first paint.
  DS.hydrateAll()
    .then((fresh) => {
      Object.assign(D, fresh);
      renderDashboard();
      renderReleases();
      renderAccess();
      renderWatermarks();
      renderEvidence();
      renderToken();
      const v = (location.hash || "#dashboard").slice(1);
      go(v);
    })
    .catch((e) => {
      console.error("[NFTones] hydrate failed:", e);
      // Fail visible — surface the error in the crumb so it's not silent.
      const crumb = document.querySelector("#crumb");
      if (crumb) crumb.textContent = "Data source unavailable — check console";
    });
})();
