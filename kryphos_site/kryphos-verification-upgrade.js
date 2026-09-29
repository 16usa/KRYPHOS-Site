(() => {
  "use strict";
  if (window.__KRYPHOS_VERIFICATION_V4__) return;
  window.__KRYPHOS_VERIFICATION_V4__ = true;

  const CFG = {
    programId: "AiAyabtePcmbsA8VSsq4JCvR2qdotL4szqbNggHYvjwS",
    binarySha256: "70a6e471fae667bcef4efc905ea3655b4cc4cd8e1f8c51d48e5f0dbfa044b487",
    binaryBytes: "356,920",
    deployer: "JB9NMp1ur1kbVah5rdGz6oEAquNDnAKiZm3ERg5t1c1g",
    rpc: "https://api.mainnet-beta.solana.com",
    explorer: "https://solscan.io/account/",
    instructions: ["initialize_vault", "bind_canonical_pool", "burn_next"]
  };

  let checked = false;
  let onChain = false;

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

  function allTextNodes(root=document.body) {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || ["SCRIPT","STYLE","NOSCRIPT"].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        return norm(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }

  function findTextNodeContains(text) {
    const want = text.toLowerCase();
    return allTextNodes().find(n => norm(n.nodeValue).toLowerCase().includes(want)) || null;
  }

  function replaceTextEverywhere(from, to) {
    for (const n of allTextNodes()) {
      if (n.nodeValue.includes(from)) n.nodeValue = n.nodeValue.replaceAll(from, to);
    }
  }

  function smallestContainerForText(text, extraChecks=[], maxChars=600) {
    const n = findTextNodeContains(text);
    if (!n) return null;
    let el = n.parentElement;
    let best = el;
    for (let i=0; i<8 && el; i++, el=el.parentElement) {
      const t = norm(el.textContent);
      if (t.length <= maxChars && extraChecks.every(x => t.includes(x))) best = el;
    }
    return best;
  }

  function textNodeInside(el, exact) {
    if (!el) return null;
    const wanted = norm(exact);
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (norm(n.nodeValue) === wanted) return n;
    }
    return null;
  }

  function replaceFirstTextInside(el, from, to) {
    if (!el) return false;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (norm(n.nodeValue) === from) {
        n.nodeValue = n.nodeValue.replace(from, to);
        return true;
      }
    }
    return false;
  }

  async function checkProgram() {
    if (checked) return;
    checked = true;
    try {
      const r = await fetch(CFG.rpc, {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          jsonrpc:"2.0",
          id:1,
          method:"getAccountInfo",
          params:[CFG.programId,{encoding:"base64",commitment:"confirmed"}]
        })
      });
      const j = await r.json();
      onChain = !!j?.result?.value;
    } catch {
      onChain = false;
    }
  }

  function patchStaticLabels() {
    replaceTextEverywhere(
      "AWAITING ON-CHAIN ADDRESSES",
      onChain ? "ON-CHAIN PROGRAM VERIFIED" : "CODE READY · MAINNET DEPLOYMENT PENDING"
    );
    replaceTextEverywhere("TOTAL SUPPLY", "PLANNED SUPPLY");
    replaceTextEverywhere("VAULT BALANCE", "PLANNED VAULT");
  }

  function patchProgramCard() {
    const box = smallestContainerForText("PROGRAM", ["Not configured","OPEN"], 420);
    if (!box) return;

    const notConfigured = textNodeInside(box, "Not configured");
    if (notConfigured) {
      const span = document.createElement("span");
      span.className = "kv-program-address";
      span.textContent = CFG.programId;
      span.title = CFG.programId;
      notConfigured.parentNode.replaceChild(span, notConfigured);
    }

    const open = textNodeInside(box, "OPEN");
    if (open) {
      const btn = document.createElement("button");
      btn.className = "kv-inline-action";
      btn.type = "button";
      btn.textContent = onChain ? "VERIFY" : "COPY";
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onChain) {
          window.open(CFG.explorer + CFG.programId, "_blank", "noopener,noreferrer");
          return;
        }
        try {
          await navigator.clipboard.writeText(CFG.programId);
          const old = btn.textContent;
          btn.textContent = "COPIED";
          setTimeout(() => btn.textContent = old, 1000);
        } catch {}
      };
      open.parentNode.replaceChild(btn, open);
    }
  }

  function patchAuthority() {
    const row = smallestContainerForText("Upgrade authority", ["Waiting"], 700);
    if (!row) return;
    replaceFirstTextInside(
      row,
      "Waiting for Program ID",
      "Dedicated deployer configured · on-chain authority pending"
    );
  }

  function copy(text, button) {
    navigator.clipboard?.writeText(text).then(() => {
      const old = button.textContent;
      button.textContent = "COPIED";
      setTimeout(() => button.textContent = old, 1000);
    }).catch(()=>{});
  }

  function makeRow(label, value, status, action) {
    const row = document.createElement("div");
    row.className = "kv-row";

    const left = document.createElement("div");
    left.className = "kv-left";
    const key = document.createElement("div");
    key.className = "kv-label";
    key.textContent = label;
    const val = document.createElement("div");
    val.className = "kv-value";
    val.textContent = value;
    val.title = value;
    left.append(key, val);

    const right = document.createElement("div");
    right.className = "kv-right";
    const badge = document.createElement("div");
    badge.className = "kv-status";
    badge.textContent = status;
    right.appendChild(badge);

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

  function findVerificationListContainer() {
    const row5 = smallestContainerForText("Permissionless burn execution", ["Published burn design"], 900);
    if (!row5) return null;

    // Climb until the container includes several verification rows, but not the whole page.
    let el = row5;
    let candidate = row5;
    for (let i=0; i<7 && el; i++, el=el.parentElement) {
      const t = norm(el.textContent);
      if (
        t.includes("Burn Vault address is public") &&
        t.includes("Every completed burn is visible on-chain") &&
        t.includes("Permissionless burn execution") &&
        t.length < 5000
      ) {
        candidate = el;
        break;
      }
    }
    return candidate;
  }

  function buildProofPanel() {
    // Remove prior v3/v4 panel if it was injected in the wrong place.
    const old = document.getElementById("kryphos-public-proof");
    if (old) old.remove();

    const listContainer = findVerificationListContainer();
    if (!listContainer) return;

    const panel = document.createElement("section");
    panel.id = "kryphos-public-proof";
    panel.innerHTML = `
      <div class="kv-kicker">PUBLIC PROOF</div>
      <div class="kv-title">Verify the claims yourself</div>
      <div class="kv-desc">
        Protocol facts and live Solana proofs are separated. Anything that does not yet exist on-chain stays marked WAITING.
      </div>
      <div class="kv-list"></div>
      <div class="kv-note">
        ON-CHAIN VERIFIED = resolved from Solana mainnet · PROTOCOL = confirmed by published program design / IDL · WAITING = no live proof exists yet.
      </div>`;

    const list = panel.querySelector(".kv-list");
    list.append(
      makeRow("PROGRAM ID", CFG.programId, onChain ? "ON-CHAIN VERIFIED" : "PREPARED", {
        label: onChain ? "OPEN" : "COPY",
        run: (e) => onChain
          ? window.open(CFG.explorer + CFG.programId, "_blank", "noopener,noreferrer")
          : copy(CFG.programId, e.currentTarget)
      }),
      makeRow("PROGRAM BINARY", `${CFG.binaryBytes} bytes · SHA256 ${CFG.binarySha256}`, "PROTOCOL", {
        label:"COPY HASH",
        run:(e)=>copy(CFG.binarySha256,e.currentTarget)
      }),
      makeRow("IDL INSTRUCTIONS", CFG.instructions.join(" · "), "PROTOCOL"),
      makeRow("DEPLOY TRANSACTION", "Waiting for Solana mainnet deployment", "WAITING"),
      makeRow("BURN VAULT PDA", "Waiting for initialize_vault", "WAITING"),
      makeRow("MINT", "Not configured", "WAITING"),
      makeRow("LATEST BURN", "Waiting for first completed burn", "WAITING"),
      makeRow("DEPLOYER / FEE PAYER", CFG.deployer, "PREPARED", {
        label:"COPY",
        run:(e)=>copy(CFG.deployer,e.currentTarget)
      })
    );

    listContainer.insertAdjacentElement("afterend", panel);
  }

  async function apply() {
    await checkProgram();
    patchStaticLabels();
    patchProgramCard();
    patchAuthority();
    buildProofPanel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, {once:true});
  } else {
    apply();
  }

  // One extra pass for pages that finish rendering after DOMContentLoaded.
  setTimeout(apply, 600);

  window.KRYPHOS_VERIFICATION = {
    refresh: () => { checked = false; return apply(); },
    config: CFG
  };
})();
