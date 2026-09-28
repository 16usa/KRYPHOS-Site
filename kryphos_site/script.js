(() => {
  'use strict';


  /* ---------------------------------------------------------
     MONOLITHIC UI HARDENING
     Stops normal selection/copy/context-menu/image dragging
     and common browser save/view-source shortcuts.
     This is deterrence, not DRM: screenshots/devtools/network
     access cannot be made impossible in a normal website.
  --------------------------------------------------------- */
  const blockEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    return false;
  };

  ['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart'].forEach((name) => {
    document.addEventListener(name, blockEvent, true);
  });

  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    const mod = event.metaKey || event.ctrlKey;

    const blockedCombos = mod && ['c', 'x', 's', 'u', 'p', 'a'].includes(key);
    const blockedDevtools =
      key === 'f12' ||
      (mod && event.shiftKey && ['i', 'j', 'c'].includes(key));

    if (blockedCombos || blockedDevtools) {
      blockEvent(event);
    }
  }, true);

  document.querySelectorAll('img').forEach((img) => {
    img.setAttribute('draggable', 'false');
    img.setAttribute('aria-hidden', img.getAttribute('alt') ? 'false' : 'true');
  });



  /* ---------------------------------------------------------
     FORENSIC SCREENSHOT MARK
     Temporary mint is rendered into the watermark.
     Bottom-right marker is a fixed UTC countdown ending
     exactly three calendar months after Sep 28, 2026.
  --------------------------------------------------------- */
  const forensicGrid = document.getElementById('forensicGrid');
  const forensicTopLeft = document.getElementById('forensicTopLeft');
  const forensicBottomRight = document.getElementById('forensicBottomRight');

  const FORENSIC_MINT = 'MINT ADDRESS';
  const COUNTDOWN_TARGET = new Date('2026-12-28T23:20:10Z').getTime();

  function formatCountdown(ms) {
    const safe = Math.max(0, ms);
    const totalSeconds = Math.floor(safe / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(days).padStart(3, '0')}D ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  if (forensicGrid) {
    const count = innerWidth <= 580 ? 24 : 40;
    forensicGrid.innerHTML = Array.from({ length: count }, () =>
      `<span class="forensic-mark">KRYPHOS · ${FORENSIC_MINT}</span>`
    ).join('');
  }

  function refreshForensicMark() {
    if (forensicTopLeft) {
      forensicTopLeft.textContent = `KRYPHOS · ${FORENSIC_MINT}`;
    }

    if (forensicBottomRight) {
      const remaining = COUNTDOWN_TARGET - Date.now();
      forensicBottomRight.textContent = formatCountdown(remaining);
    }
  }

  refreshForensicMark();
  setInterval(refreshForensicMark, 1000);


  const cfg = window.KRYPHOS_CONFIG || {};
  const burnSchedule = [
    ['$100K', 100000000, 100000000, 900000000],
    ['$200K',  95000000, 195000000, 805000000],
    ['$300K',  90000000, 285000000, 715000000],
    ['$400K',  80000000, 365000000, 635000000],
    ['$500K',  75000000, 440000000, 560000000],
    ['$600K',  70000000, 510000000, 490000000],
    ['$700K',  60000000, 570000000, 430000000],
    ['$800K',  50000000, 620000000, 380000000],
    ['$900K',  40000000, 660000000, 340000000],
    ['$1M',    40000000, 700000000, 300000000]
  ];

  const fmt = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
    .format(Math.max(0, Math.round(Number(n) || 0)));

  const scheduleBody = document.getElementById('scheduleBody');
  let liveSupply = Number(cfg.initialSupply || 1000000000);

  function renderSchedule() {
    const burned = Math.max(0, Number(cfg.initialSupply || 1000000000) - liveSupply);
    scheduleBody.innerHTML = '';
    let currentSet = false;

    burnSchedule.forEach(row => {
      const tr = document.createElement('tr');
      if (burned >= row[2]) tr.classList.add('completed');
      else if (!currentSet) {
        tr.classList.add('current');
        currentSet = true;
      }
      tr.innerHTML = `<td>${row[0]}</td><td>${fmt(row[1])}</td><td>${fmt(row[2])}</td><td>${fmt(row[3])}</td>`;
      scheduleBody.appendChild(tr);
    });

    const pct = Math.min(100, Math.max(0, burned / Number(cfg.lockedForBurn || 700000000) * 100));
    document.getElementById('progressBar').style.width = `${pct}%`;
    document.getElementById('progressPct').textContent = `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%`;
    document.getElementById('progressLabel').textContent = burned > 0 ? `${fmt(burned)} burned` : 'Protocol schedule';
  }

  function setStats(vaultBalance) {
    const initialEl = document.querySelector('[data-stat="initial"]');
    const vaultEl = document.querySelector('[data-stat="vault"]');
    if (initialEl) initialEl.textContent = fmt(liveSupply);
    if (vaultEl && Number.isFinite(vaultBalance)) vaultEl.textContent = fmt(vaultBalance);
  }

  renderSchedule();

  /* ---------------------------------------------------------
     FULL-SCREEN SLIDE ENGINE
     Wheel / swipe / arrows. No document scrolling.
  --------------------------------------------------------- */
  const slides = Array.from(document.querySelectorAll('.slide'));
  const dotsHost = document.getElementById('deckDots');
  const currentEl = document.getElementById('deckCurrent');
  const totalEl = document.getElementById('deckTotal');
  const swipeHint = document.getElementById('swipeHint');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let index = 0;
  let locked = false;
  let touchY = null;
  let touchX = null;
  let touchStartAt = 0;
  let wheelSum = 0;
  let wheelTimer = 0;

  const pad2 = n => String(n).padStart(2, '0');
  totalEl.textContent = pad2(slides.length);

  slides.forEach((slide, i) => {
    slide.classList.toggle('active', i === 0);
    slide.classList.add(i === 0 ? 'from-bottom' : 'from-bottom');
    if (i === 0) slide.classList.remove('from-bottom');

    const dot = document.createElement('i');
    dot.className = i === 0 ? 'active' : '';
    dotsHost.appendChild(dot);
  });

  const dots = Array.from(dotsHost.children);

  function showReveals(slide) {
    slide.querySelectorAll('.reveal').forEach((el, i) => {
      window.setTimeout(() => el.classList.add('visible'), Math.min(i * 55, 220));
    });
  }

  function hideReveals(slide) {
    slide.querySelectorAll('.reveal').forEach(el => el.classList.remove('visible'));
  }

  showReveals(slides[0]);

  function syncUI() {
    currentEl.textContent = pad2(index + 1);
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    swipeHint.classList.toggle('hidden', index !== 0);
  }

  function go(next) {
    next = Math.max(0, Math.min(slides.length - 1, next));
    if (next === index || locked) return;

    locked = true;
    const old = slides[index];
    const incoming = slides[next];
    const forward = next > index;

    hideReveals(old);
    incoming.classList.remove('leave-up', 'leave-down', 'active', 'from-top', 'from-bottom');
    incoming.classList.add(forward ? 'from-bottom' : 'from-top');
    incoming.style.visibility = 'visible';

    // Force the browser to paint the starting position first.
    void incoming.offsetHeight;

    old.classList.remove('active', 'from-top', 'from-bottom');
    old.classList.add(forward ? 'leave-up' : 'leave-down');

    incoming.classList.add('active');
    incoming.classList.remove('from-top', 'from-bottom');

    const oldIndex = index;
    index = next;
    syncUI();

    window.setTimeout(() => showReveals(incoming), reduced ? 0 : 160);
    window.setTimeout(() => {
      old.classList.remove('leave-up', 'leave-down');
      old.style.visibility = '';
      // Keep non-active slides logically positioned by their relation to current slide.
      slides.forEach((s, i) => {
        if (i === index) return;
        s.classList.remove('from-top', 'from-bottom');
        s.classList.add(i < index ? 'from-top' : 'from-bottom');
      });
      locked = false;
    }, reduced ? 280 : 900);

    // Reset hero tilt when leaving / returning so it never jumps.
    if (oldIndex === 0 || index === 0) {
      targetX = 0;
      targetY = 0;
    }
  }

  function nextSlide() { go(index + 1); }
  function prevSlide() { go(index - 1); }

  window.addEventListener('wheel', e => {
    e.preventDefault();
    if (locked) return;
    wheelSum += e.deltaY;
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => { wheelSum = 0; }, 180);
    if (Math.abs(wheelSum) > 38) {
      wheelSum > 0 ? nextSlide() : prevSlide();
      wheelSum = 0;
    }
  }, { passive: false });

  window.addEventListener('touchstart', e => {
    if (!e.touches || !e.touches.length) return;
    touchY = e.touches[0].clientY;
    touchX = e.touches[0].clientX;
    touchStartAt = performance.now();
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    // The deck owns vertical gestures; this prevents Safari page bounce.
    if (touchY !== null) e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', e => {
    if (touchY === null || locked) {
      touchY = touchX = null;
      return;
    }
    const p = e.changedTouches && e.changedTouches[0];
    if (!p) return;
    const dy = p.clientY - touchY;
    const dx = p.clientX - touchX;
    const elapsed = Math.max(1, performance.now() - touchStartAt);
    const velocity = Math.abs(dy) / elapsed;
    touchY = touchX = null;

    if (Math.abs(dy) > Math.abs(dx) * 1.15 && (Math.abs(dy) > 44 || velocity > .42)) {
      dy < 0 ? nextSlide() : prevSlide();
    }
  }, { passive: true });

  window.addEventListener('keydown', e => {
    if (['ArrowDown', 'PageDown', ' ', 'ArrowRight'].includes(e.key)) {
      e.preventDefault(); nextSlide();
    } else if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault(); prevSlide();
    } else if (e.key === 'Home') {
      e.preventDefault(); go(0);
    } else if (e.key === 'End') {
      e.preventDefault(); go(slides.length - 1);
    }
  });

  syncUI();

  /* ---------------------------------------------------------
     HERO 2.5D PARALLAX
  --------------------------------------------------------- */
  const scene = document.getElementById('scene');
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0;

  if (!reduced) {
    const setTarget = (x, y) => {
      targetX = Math.max(-1, Math.min(1, x));
      targetY = Math.max(-1, Math.min(1, y));
    };

    window.addEventListener('pointermove', e => {
      if (index !== 0) return;
      setTarget((e.clientX / innerWidth - .5) * 2, (e.clientY / innerHeight - .5) * 2);
    }, { passive: true });

    const animateScene = () => {
      currentX += (targetX - currentX) * .05;
      currentY += (targetY - currentY) * .05;
      scene.style.transform = `perspective(1200px) rotateY(${currentX * 1.15}deg) rotateX(${-currentY * .7}deg) translate3d(${currentX * -6}px,${currentY * -4}px,0) scale(1.035)`;
      requestAnimationFrame(animateScene);
    };
    requestAnimationFrame(animateScene);
  }

  /* ---------------------------------------------------------
     MIST + WATER FX
  --------------------------------------------------------- */
  const mistCanvas = document.getElementById('mistCanvas');
  const waterCanvas = document.getElementById('waterCanvas');
  const mistCtx = mistCanvas.getContext('2d');
  const waterCtx = waterCanvas.getContext('2d');
  let particles = [];
  let dpr = Math.min(devicePixelRatio || 1, 2);

  function resizeCanvas(canvas) {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  function resetFx() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    resizeCanvas(mistCanvas);
    resizeCanvas(waterCanvas);
    const w = mistCanvas.width, h = mistCanvas.height;
    particles = Array.from({ length: Math.min(70, Math.max(36, Math.floor(innerWidth / 18))) }, () => ({
      x: w * (.5 + (Math.random() - .5) * .13),
      y: h * (.35 + Math.random() * .32),
      r: (18 + Math.random() * 58) * dpr,
      vy: (.08 + Math.random() * .28) * dpr,
      vx: (Math.random() - .5) * .13 * dpr,
      a: .018 + Math.random() * .065,
      phase: Math.random() * Math.PI * 2
    }));
  }

  function drawMist(t) {
    if (reduced || index !== 0) return;
    const w = mistCanvas.width, h = mistCanvas.height;
    mistCtx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.y -= p.vy;
      p.x += p.vx + Math.sin(t * .00035 + p.phase) * .06 * dpr;
      if (p.y < h * .18) {
        p.y = h * .68;
        p.x = w * (.5 + (Math.random() - .5) * .14);
      }
      const g = mistCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(255,255,255,${p.a})`);
      g.addColorStop(.45, `rgba(255,255,255,${p.a * .45})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      mistCtx.fillStyle = g;
      mistCtx.beginPath();
      mistCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      mistCtx.fill();
    }
  }

  function drawWater(t) {
    if (reduced || index !== 0) return;
    const w = waterCanvas.width, h = waterCanvas.height;
    waterCtx.clearRect(0, 0, w, h);
    const y0 = h * .71;
    waterCtx.lineWidth = Math.max(1, dpr * .75);
    for (let i = 0; i < 24; i++) {
      const y = y0 + i * (h * .011);
      const spread = w * (.08 + i * .028);
      const center = w * .5 + Math.sin(t * .00045 + i * .55) * w * .006;
      const amp = (1.5 + i * .08) * dpr;
      const alpha = Math.max(0, .16 - i * .0045);
      waterCtx.strokeStyle = `rgba(255,255,255,${alpha})`;
      waterCtx.beginPath();
      const x1 = Math.max(0, center - spread), x2 = Math.min(w, center + spread);
      for (let x = x1; x <= x2; x += 7 * dpr) {
        const yy = y + Math.sin(x * .012 / dpr + t * .0017 + i * .8) * amp;
        if (x === x1) waterCtx.moveTo(x, yy); else waterCtx.lineTo(x, yy);
      }
      waterCtx.stroke();
    }
    const glow = waterCtx.createLinearGradient(0, h * .63, 0, h);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(.15, 'rgba(255,255,255,.10)');
    glow.addColorStop(.52, 'rgba(255,255,255,.035)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    waterCtx.fillStyle = glow;
    waterCtx.fillRect(w * .485, h * .63, w * .03, h * .37);
  }

  function fxLoop(t) {
    drawMist(t);
    drawWater(t);
    requestAnimationFrame(fxLoop);
  }

  resetFx();
  if (!reduced) requestAnimationFrame(fxLoop);
  window.addEventListener('resize', resetFx, { passive: true });

  /* ---------------------------------------------------------
     LIVE ON-CHAIN VERIFICATION
     Uses only the already-published KRYPHOS mechanics:
     Mint, total supply, Burn Vault, completed burns,
     Program, upgrade authority, no-withdraw design,
     permissionless burn design.
  --------------------------------------------------------- */
  const SOLSCAN = 'https://solscan.io';
  const verifyLiveState = document.getElementById('verifyLiveState');
  const verifyLiveText = document.getElementById('verifyLiveText');
  const verifyMintAddress = document.getElementById('verifyMintAddress');
  const verifyVaultAddress = document.getElementById('verifyVaultAddress');
  const verifyProgramAddress = document.getElementById('verifyProgramAddress');
  const verifyTotalSupply = document.getElementById('verifyTotalSupply');
  const verifyVaultBalance = document.getElementById('verifyVaultBalance');
  const verifyMintLink = document.getElementById('verifyMintLink');
  const verifyVaultLink = document.getElementById('verifyVaultLink');
  const verifyProgramLink = document.getElementById('verifyProgramLink');
  const vaultProofText = document.getElementById('vaultProofText');
  const vaultProofStatus = document.getElementById('vaultProofStatus');
  const burnProofText = document.getElementById('burnProofText');
  const burnProofStatus = document.getElementById('burnProofStatus');
  const burnTxList = document.getElementById('burnTxList');
  const upgradeProofText = document.getElementById('upgradeProofText');
  const upgradeProofStatus = document.getElementById('upgradeProofStatus');

  let mintDecimals = 0;

  function shortAddress(value, head = 6, tail = 6) {
    if (!value || value.length <= head + tail + 3) return value || 'Not configured';
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
  }

  function setExplorerLink(el, path) {
    if (!el || !path) return;
    el.href = `${SOLSCAN}${path}`;
    el.hidden = false;
  }

  function setVerifyStatus(el, text, state) {
    if (!el) return;
    el.textContent = text;
    el.className = `verify-status ${state}`;
  }

  function setLiveState(text, state = 'waiting') {
    if (verifyLiveText) verifyLiveText.textContent = text;
    if (verifyLiveState) verifyLiveState.className = `verify-live-state ${state}`;
  }

  async function rpc(method, params) {
    const r = await fetch(cfg.rpcUrl, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0', id:1, method, params})
    });
    if (!r.ok) throw new Error(`RPC ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error.message || 'RPC error');
    return data.result;
  }

  function decodeBase64(data) {
    const raw = atob(data || '');
    return Uint8Array.from(raw, ch => ch.charCodeAt(0));
  }

  function encodeBase58(bytes) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    if (!bytes || !bytes.length) return '';
    const digits = [0];

    for (const byte of bytes) {
      let carry = byte;
      for (let i = 0; i < digits.length; i++) {
        const x = digits[i] * 256 + carry;
        digits[i] = x % 58;
        carry = Math.floor(x / 58);
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = Math.floor(carry / 58);
      }
    }

    let leading = 0;
    while (leading < bytes.length && bytes[leading] === 0) leading++;

    let result = '1'.repeat(leading);
    for (let i = digits.length - 1; i >= 0; i--) result += alphabet[digits[i]];
    return result;
  }

  function u32le(bytes, offset = 0) {
    return (
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    ) >>> 0;
  }

  async function readUpgradeAuthority(programId) {
    const program = await rpc('getAccountInfo', [
      programId,
      { encoding:'base64', commitment:'confirmed' }
    ]);

    if (!program?.value) {
      return { state:'missing', text:'Program account not found' };
    }

    if (!program.value.executable) {
      return { state:'alert', text:'Program account is not executable' };
    }

    const programBytes = decodeBase64(program.value.data?.[0] || '');
    if (programBytes.length < 36 || u32le(programBytes, 0) !== 2) {
      return { state:'unknown', text:'Executable program · authority format unavailable' };
    }

    const programDataAddress = encodeBase58(programBytes.slice(4, 36));
    const programData = await rpc('getAccountInfo', [
      programDataAddress,
      { encoding:'base64', commitment:'confirmed' }
    ]);

    if (!programData?.value) {
      return { state:'unknown', text:'ProgramData account unavailable' };
    }

    const bytes = decodeBase64(programData.value.data?.[0] || '');
    if (bytes.length < 13 || u32le(bytes, 0) !== 3) {
      return { state:'unknown', text:'ProgramData authority format unavailable' };
    }

    const option = bytes[12];
    if (option === 0) {
      return { state:'immutable', text:'NONE · program is immutable' };
    }

    if (option === 1 && bytes.length >= 45) {
      const authority = encodeBase58(bytes.slice(13, 45));
      return { state:'authority', text:`${shortAddress(authority)} · upgrade authority present`, authority };
    }

    return { state:'unknown', text:'Upgrade authority unavailable' };
  }

  function collectParsedInstructions(tx) {
    const outer = tx?.transaction?.message?.instructions || [];
    const inner = (tx?.meta?.innerInstructions || []).flatMap(group => group?.instructions || []);
    return [...outer, ...inner];
  }

  function burnAmountFromInstruction(ix) {
    if (!ix?.parsed) return null;
    const type = ix.parsed.type;
    if (type !== 'burn' && type !== 'burnChecked') return null;

    const info = ix.parsed.info || {};
    if (info.tokenAmount?.uiAmountString != null) {
      return Number(info.tokenAmount.uiAmountString);
    }
    if (info.tokenAmount?.amount != null) {
      const d = Number(info.tokenAmount.decimals || mintDecimals || 0);
      return Number(info.tokenAmount.amount) / (10 ** d);
    }
    if (info.amount != null) {
      return Number(info.amount) / (10 ** Number(mintDecimals || 0));
    }
    return null;
  }

  async function loadBurnTransactions(vaultAddress) {
    const signatures = await rpc('getSignaturesForAddress', [
      vaultAddress,
      { limit:24, commitment:'confirmed' }
    ]);

    const list = Array.isArray(signatures) ? signatures.filter(x => !x.err).slice(0, 18) : [];
    if (!list.length) return [];

    const txs = await Promise.all(list.map(async item => {
      try {
        const tx = await rpc('getTransaction', [
          item.signature,
          {
            encoding:'jsonParsed',
            commitment:'confirmed',
            maxSupportedTransactionVersion:0
          }
        ]);

        let amount = 0;
        for (const ix of collectParsedInstructions(tx)) {
          const v = burnAmountFromInstruction(ix);
          if (Number.isFinite(v) && v > 0) amount += v;
        }

        if (amount <= 0) return null;
        return {
          signature:item.signature,
          amount,
          blockTime:item.blockTime || tx?.blockTime || null
        };
      } catch (_) {
        return null;
      }
    }));

    return txs.filter(Boolean);
  }

  function renderBurnTransactions(items) {
    if (!burnTxList) return;
    burnTxList.innerHTML = '';

    if (!items.length) {
      burnTxList.hidden = true;
      return;
    }

    items.slice(0, 3).forEach(item => {
      const a = document.createElement('a');
      a.href = `${SOLSCAN}/tx/${item.signature}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `${fmt(item.amount)} · ${shortAddress(item.signature, 5, 5)}`;
      burnTxList.appendChild(a);
    });

    burnTxList.hidden = false;
  }

  async function refreshChain() {
    const mint = typeof cfg.mintAddress === 'string' ? cfg.mintAddress.trim() : '';
    const vault = typeof cfg.burnVaultTokenAccount === 'string' ? cfg.burnVaultTokenAccount.trim() : '';
    const program = typeof cfg.programId === 'string' ? cfg.programId.trim() : '';

    const hasMint = Boolean(mint);
    const hasVault = Boolean(vault);
    const hasProgram = Boolean(program);

    verifyMintAddress.textContent = hasMint ? shortAddress(mint) : 'Not configured';
    verifyVaultAddress.textContent = hasVault ? shortAddress(vault) : 'Not configured';
    verifyProgramAddress.textContent = hasProgram ? shortAddress(program) : 'Not configured';

    if (hasMint) setExplorerLink(verifyMintLink, `/token/${mint}`);
    if (hasVault) setExplorerLink(verifyVaultLink, `/account/${vault}`);
    if (hasProgram) setExplorerLink(verifyProgramLink, `/account/${program}`);

    if (!hasMint && !hasVault && !hasProgram) {
      setLiveState('Awaiting on-chain addresses', 'waiting');
      setVerifyStatus(vaultProofStatus, 'WAITING', 'waiting');
      setVerifyStatus(burnProofStatus, 'WAITING', 'waiting');
      setVerifyStatus(upgradeProofStatus, 'WAITING', 'waiting');
      return;
    }

    setLiveState('Reading Solana', 'live');

    try {
      let vaultBalance = null;
      let burnTxs = [];

      if (hasMint) {
        const supply = await rpc('getTokenSupply', [
          mint,
          { commitment:'confirmed' }
        ]);

        const raw = Number(supply?.value?.amount);
        mintDecimals = Number(supply?.value?.decimals || 0);

        if (Number.isFinite(raw)) {
          liveSupply = raw / (10 ** mintDecimals);
          verifyTotalSupply.textContent = fmt(liveSupply);
          setStats(vaultBalance);
          renderSchedule();
        }
      }

      if (hasVault) {
        const vaultData = await rpc('getTokenAccountBalance', [
          vault,
          { commitment:'confirmed' }
        ]);

        const raw = Number(vaultData?.value?.amount);
        const decimals = Number(vaultData?.value?.decimals ?? mintDecimals ?? 0);

        if (Number.isFinite(raw)) {
          vaultBalance = raw / (10 ** decimals);
          verifyVaultBalance.textContent = fmt(vaultBalance);
          setStats(vaultBalance);
        }

        vaultProofText.textContent = Number.isFinite(vaultBalance)
          ? `${fmt(vaultBalance)} tokens currently in Burn Vault`
          : 'Burn Vault account is public on-chain';
        setVerifyStatus(vaultProofStatus, 'VERIFIED', 'verified');

        burnTxs = await loadBurnTransactions(vault);
        renderBurnTransactions(burnTxs);
      }

      const burned = Math.max(0, Number(cfg.initialSupply || 1000000000) - liveSupply);
      const completedStages = burnSchedule.filter(row => burned >= row[2]).length;

      burnProofText.textContent = burnTxs.length
        ? `${fmt(burned)} burned · ${completedStages}/10 stages · ${burnTxs.length} burn tx found`
        : `${fmt(burned)} burned · ${completedStages}/10 stages`;

      if (hasMint) {
        setVerifyStatus(
          burnProofStatus,
          burned > 0 ? 'VERIFIED' : 'LIVE',
          burned > 0 ? 'verified' : 'protocol'
        );
      }

      if (hasProgram) {
        const authority = await readUpgradeAuthority(program);

        if (authority.state === 'immutable') {
          upgradeProofText.textContent = authority.text;
          setVerifyStatus(upgradeProofStatus, 'IMMUTABLE', 'verified');
        } else if (authority.state === 'authority') {
          upgradeProofText.textContent = authority.text;
          setVerifyStatus(upgradeProofStatus, 'PRESENT', 'alert');
        } else if (authority.state === 'alert' || authority.state === 'missing') {
          upgradeProofText.textContent = authority.text;
          setVerifyStatus(upgradeProofStatus, 'CHECK', 'alert');
        } else {
          upgradeProofText.textContent = authority.text;
          setVerifyStatus(upgradeProofStatus, 'LIVE', 'protocol');
        }
      }

      setLiveState(
        `Solana live · ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`,
        'live'
      );
    } catch (err) {
      setLiveState(`RPC unavailable`, 'error');
      if (vaultProofText && hasVault) vaultProofText.textContent = `Unable to read Solana: ${err.message}`;
    }
  }

  refreshChain();
  if (cfg.refreshMs && (cfg.mintAddress || cfg.burnVaultTokenAccount || cfg.programId)) {
    setInterval(refreshChain, Math.max(15000, Number(cfg.refreshMs) || 30000));
  }
})();
