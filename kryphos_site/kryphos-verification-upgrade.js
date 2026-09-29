(() => {
  "use strict";
  if (window.__KRYPHOS_VERIFICATION_V3__) return;
  window.__KRYPHOS_VERIFICATION_V3__ = true;

  const CFG = {
    programId: "AiAyabtePcmbsA8VSsq4JCvR2qdotL4szqbNggHYvjwS",
    binarySha256: "70a6e471fae667bcef4efc905ea3655b4cc4cd8e1f8c51d48e5f0dbfa044b487",
    binaryBytes: "356,920",
    deployer: "JB9NMp1ur1kbVah5rdGz6oEAquNDnAKiZm3ERg5t1c1g",
    rpc: "https://api.mainnet-beta.solana.com",
    explorer: "https://solscan.io/account/",
    instructions: ["initialize_vault", "bind_canonical_pool", "burn_next"]
  };

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

  function leaf(text) {
    const wanted = norm(text);
    for (const el of document.querySelectorAll("body *:not(script):not(style):not(svg):not(path)")) {
      if (el.children.length === 0 && norm(el.textContent) === wanted) return el;
    }
    return null;
  }

  function ancestor(el, checks, maxLen=500) {
    let cur = el;
    for (let i=0; i<8 && cur; i++, cur=cur.parentElement) {
      const t = norm(cur.textContent);
      if (t.length <= maxLen && checks.every(x => t.includes(x))) return cur;
    }
    return el?.parentElement || null;
  }

  function copy(text, btn) {
    navigator.clipboard?.writeText(text).then(() => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = "COPIED";
      setTimeout(() => btn.textContent = old, 1100);
    }).catch(()=>{});
  }

  function makeRow(label, value, status, action) {
    const row = document.createElement("div");
    row.className = "kv-row";

    const left = document.createElement("div");
    left.className = "kv-left";
    const l = document.createElement("div");
    l.className = "kv-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "kv-value";
    v.textContent = value;
    v.title = value;
    left.append(l, v);

    const right = document.createElement("div");
    right.className = "kv-right";
    const s = document.createElement("div");
    s.className = "kv-status";
    s.textContent = status;
    right.appendChild(s);

    if (action) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "kv-button";
      b.textContent = action.label;
      b.onclick = action.run;
      right.appendChild(b);
    }

    row.append(left, right);
    return row;
  }

  let checked = false;
  let onChain = false;

  async function checkProgram() {
    if (checked) return;
    checked = true;
    try {
      const r = await fetch(CFG.rpc, {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAccountInfo",
          params: [CFG.programId, {encoding:"base64", commitment:"confirmed"}]
        })
      });
      const j = await r.json();
      onChain = !!j?.result?.value;
    } catch {
      onChain = false;
    }
  }

  function patchHeader() {
    const current =
      leaf("AWAITING ON-CHAIN ADDRESSES") ||
      leaf("CODE READY · MAINNET DEPLOYMENT PENDING") ||
      leaf("ON-CHAIN PROGRAM VERIFIED");
    if (current) {
      current.textContent = onChain
        ? "ON-CHAIN PROGRAM VERIFIED"
        : "CODE READY · MAINNET DEPLOYMENT PENDING";
    }
  }

  function patchProgram() {
    const p = leaf("PROGRAM");
    if (!p) return;
    const box = ancestor(p, ["PROGRAM"], 300);
    if (!box) return;

    for (const el of box.querySelectorAll("*")) {
      if (el.children.length) continue;
      const t = norm(el.textContent);
      if (t === "Not configured") {
        el.textContent = CFG.programId;
        el.title = CFG.programId;
        el.classList.add("kv-program-address");
      }
      if (t === "OPEN") {
        el.textContent = onChain ? "VERIFY" : "COPY";
        el.classList.add("kv-inline-action");
        el.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onChain) {
            window.open(CFG.explorer + CFG.programId, "_blank", "noopener,noreferrer");
          } else {
            copy(CFG.programId, el);
          }
        };
      }
    }
  }

  function patchAuthority() {
    const t = leaf("Upgrade authority");
    if (!t) return;
    const row = ancestor(t, ["Upgrade authority"], 500);
    if (!row) return;
    for (const el of row.querySelectorAll("*")) {
      if (!el.children.length && norm(el.textContent) === "Waiting for Program ID") {
        el.textContent = "Dedicated deployer configured · on-chain authority pending";
      }
    }
  }

  function buildProof() {
    if (document.getElementById("kryphos-public-proof")) return;

    const anchor = leaf("Permissionless burn execution");
    if (!anchor) return;
    const row = ancestor(anchor, ["Permissionless burn execution"], 500) || anchor.parentElement;

    const panel = document.createElement("section");
    panel.id = "kryphos-public-proof";
    panel.innerHTML = `
      <div class="kv-kicker">PUBLIC PROOF</div>
      <div class="kv-title">Verify the claims yourself</div>
      <div class="kv-desc">
        Protocol facts and live Solana proofs are shown separately.
        Anything not yet available on-chain stays marked WAITING.
      </div>
      <div class="kv-list"></div>
      <div class="kv-note">
        ON-CHAIN VERIFIED = resolved from Solana mainnet · PROTOCOL = confirmed by published program design / IDL · WAITING = no live proof exists yet.
      </div>
    `;

    const list = panel.querySelector(".kv-list");
    list.append(
      makeRow("PROGRAM ID", CFG.programId, onChain ? "ON-CHAIN VERIFIED" : "PREPARED", {
        label: onChain ? "OPEN" : "COPY",
        run: (e) => onChain
          ? window.open(CFG.explorer + CFG.programId, "_blank", "noopener,noreferrer")
          : copy(CFG.programId, e.currentTarget)
      }),
      makeRow("PROGRAM BINARY", `${CFG.binaryBytes} bytes · SHA256 ${CFG.binarySha256}`, "PROTOCOL", {
        label: "COPY HASH",
        run: (e) => copy(CFG.binarySha256, e.currentTarget)
      }),
      makeRow("IDL INSTRUCTIONS", CFG.instructions.join(" · "), "PROTOCOL"),
      makeRow("DEPLOY TRANSACTION", "Waiting for Solana mainnet deployment", "WAITING"),
      makeRow("BURN VAULT PDA", "Waiting for initialize_vault", "WAITING"),
      makeRow("MINT", "Not configured", "WAITING"),
      makeRow("LATEST BURN", "Waiting for first completed burn", "WAITING"),
      makeRow("DEPLOYER / FEE PAYER", CFG.deployer, "PREPARED", {
        label: "COPY",
        run: (e) => copy(CFG.deployer, e.currentTarget)
      })
    );

    row.insertAdjacentElement("afterend", panel);
  }

  async function apply() {
    await checkProgram();
    patchHeader();
    patchProgram();
    patchAuthority();
    buildProof();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, {once:true});
  } else {
    apply();
  }

  let t;
  new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(apply, 80);
  }).observe(document.documentElement, {childList:true, subtree:true});

  window.KRYPHOS_VERIFICATION = {
    refresh: () => { checked = false; return apply(); },
    config: CFG
  };
})();
