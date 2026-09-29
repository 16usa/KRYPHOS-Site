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
  const fmt = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
    .format(Math.max(0, Number(n) || 0));

  const boostPacks = [
    { boosts: 10, label: '10' },
    { boosts: 30, label: '30' },
    { boosts: 50, label: '50' },
    { boosts: 100, label: '100' },
    { boosts: 500, label: '500' }
  ];

  const scheduleBody = document.getElementById('scheduleBody');
  let publicBoostState = null;

  function renderSchedule(state = publicBoostState) {
    if (!scheduleBody) return;
    scheduleBody.innerHTML = '';

    const planned = state?.plan?.packBoosts || 0;
    const active = Number(state?.market?.activeBoosts || 0);

    boostPacks.forEach(pack => {
      const tr = document.createElement('tr');
      if (active >= pack.boosts) tr.classList.add('completed');
      if (planned === pack.boosts) tr.classList.add('current');

      const cost = state?.pricing?.packs?.find?.(p => Number(p.boosts) === pack.boosts)?.usd;
      const shortfall = planned === pack.boosts ? Number(state?.plan?.reserveTopUpUsd || 0) : null;
      const decision = active >= pack.boosts
        ? 'ACTIVE'
        : planned === pack.boosts
          ? String(state?.plan?.action || 'READY').replaceAll('_', ' ')
          : 'AVAILABLE';

      tr.innerHTML = `
        <td>${pack.label}</td>
        <td>${cost ? '$' + fmt(cost) : 'LIVE PRICE'}</td>
        <td>${shortfall == null ? 'ONLY IF NEEDED' : shortfall > 0 ? '$' + fmt(shortfall) : 'NONE'}</td>
        <td>${decision}</td>`;
      scheduleBody.appendChild(tr);
    });

    const bar = document.getElementById('progressBar');
    const pctEl = document.getElementById('progressPct');
    const label = document.getElementById('progressLabel');

    if (!state?.configured) {
      if (bar) bar.style.width = '0%';
      if (pctEl) pctEl.textContent = '—';
      if (label) label.textContent = 'Waiting for live configuration';
      return;
    }

    const target = Number(state?.plan?.packCostUsd || 0);
    const fees = Number(state?.funding?.feesFirstUsd || 0);
    const pct = target > 0 ? Math.min(100, Math.max(0, fees / target * 100)) : 0;
    if (bar) bar.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = target > 0 ? `${pct.toFixed(0)}%` : '—';
    if (label) label.textContent = state?.plan?.action
      ? String(state.plan.action).replaceAll('_', ' ')
      : 'Evaluating';
  }

  function setStats(reserveBalance) {
    const initialEl = document.querySelector('[data-stat="initial"]');
    const vaultEl = document.querySelector('[data-stat="vault"]');
    if (initialEl) initialEl.textContent = fmt(cfg.totalSupply || 1000000000);
    if (vaultEl) vaultEl.textContent = fmt(
      Number.isFinite(reserveBalance) ? reserveBalance : (cfg.boostReserveTokens || 100000000)
    );
  }

  setStats();
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
     ADAPTIVE BOOST ENGINE — PUBLIC READ-ONLY UI
     The executable engine lives in /kryphos_boost.
     This browser code never signs or sends transactions.
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
  const upgradeProofText = document.getElementById('upgradeProofText');
  const upgradeProofStatus = document.getElementById('upgradeProofStatus');
  const reserveGuardText = document.getElementById('reserveGuardText');
  const reserveGuardStatus = document.getElementById('reserveGuardStatus');
  const boostDecisionText = document.getElementById('boostDecisionText');
  const boostDecisionStatus = document.getElementById('boostDecisionStatus');

  function shortAddress(value, head = 6, tail = 6) {
    if (!value || value.length <= head + tail + 3) return value || 'Not configured';
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
  }

  function setLink(el, href) {
    if (!el) return;
    if (!href) {
      el.hidden = true;
      el.removeAttribute('href');
      return;
    }
    el.href = href;
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

  function applyBoostState(state) {
    publicBoostState = state || null;
    renderSchedule(state);

    const mint = state?.addresses?.mint || cfg.mintAddress || '';
    const reserve = state?.addresses?.reserveWallet || cfg.boostReserveWallet || '';
    const treasury = state?.addresses?.boostTreasuryWallet || cfg.boostTreasuryWallet || '';

    if (verifyMintAddress) verifyMintAddress.textContent = mint ? shortAddress(mint) : 'Not configured';
    if (verifyVaultAddress) verifyVaultAddress.textContent = reserve ? shortAddress(reserve) : 'Not configured';
    if (verifyProgramAddress) verifyProgramAddress.textContent = treasury ? shortAddress(treasury) : 'Not configured';
    if (verifyTotalSupply) verifyTotalSupply.textContent = fmt(cfg.totalSupply || 1000000000);

    setLink(verifyMintLink, mint ? `${SOLSCAN}/token/${mint}` : '');
    setLink(verifyVaultLink, reserve ? `${SOLSCAN}/account/${reserve}` : '');
    setLink(verifyProgramLink, treasury ? `${SOLSCAN}/account/${treasury}` : '');

    const reserveBalance = Number(state?.funding?.reserveTokenBalance);
    if (verifyVaultBalance) verifyVaultBalance.textContent = Number.isFinite(reserveBalance)
      ? fmt(reserveBalance)
      : fmt(cfg.boostReserveTokens || 100000000);
    setStats(reserveBalance);

    if (!state?.configured) {
      setLiveState('Awaiting live configuration', 'waiting');
      if (vaultProofText) vaultProofText.textContent = 'Waiting for reserve wallet';
      if (burnProofText) burnProofText.textContent = 'Waiting for fee treasury data';
      if (upgradeProofText) upgradeProofText.textContent = 'Waiting for token pair';
      setVerifyStatus(vaultProofStatus, 'WAITING', 'waiting');
      setVerifyStatus(burnProofStatus, 'WAITING', 'waiting');
      setVerifyStatus(upgradeProofStatus, 'WAITING', 'waiting');
      return;
    }

    setLiveState(`ENGINE ${state.plan?.action || 'LIVE'}`.replaceAll('_', ' '), 'live');

    if (vaultProofText) {
      vaultProofText.textContent = `${fmt(reserveBalance)} KRYPHOS remaining · ${fmt(state.funding?.reservePercentRemaining || 0)}% of reserve`;
    }
    setVerifyStatus(vaultProofStatus, reserve ? 'PUBLIC' : 'WAITING', reserve ? 'verified' : 'waiting');

    const feesUsd = Number(state?.funding?.feesFirstUsd || 0);
    const unclaimed = Number(state?.funding?.unclaimedCreatorFeesSol || 0);
    if (burnProofText) {
      burnProofText.textContent = `$${fmt(feesUsd)} fees/treasury available first · ${fmt(unclaimed)} SOL unclaimed creator fees`;
    }
    setVerifyStatus(burnProofStatus, 'FEES FIRST', 'verified');

    const active = Number(state?.market?.activeBoosts || 0);
    if (upgradeProofText) {
      upgradeProofText.textContent = `${active} active · next pack ${state?.plan?.packBoosts || '—'} · ${state?.market?.pairDex || 'DEX'} pair`;
    }
    setVerifyStatus(upgradeProofStatus, active >= 500 ? 'GOLDEN' : active > 0 ? 'ACTIVE' : 'LIVE', active > 0 ? 'verified' : 'protocol');

    const impact = Number(state?.plan?.estimatedPriceImpactPct);
    const limit = Number(state?.guard?.maxPriceImpactPct ?? cfg.maxPriceImpactPct ?? 0.5);
    if (reserveGuardText) {
      reserveGuardText.textContent = Number.isFinite(impact)
        ? `${impact.toFixed(3)}% estimated · ${limit.toFixed(2)}% configured limit`
        : `${limit.toFixed(2)}% limit · live quote required before reserve sale`;
    }
    setVerifyStatus(
      reserveGuardStatus,
      Number.isFinite(impact) && impact > limit ? 'BLOCKED' : 'GUARDED',
      Number.isFinite(impact) && impact > limit ? 'alert' : 'verified'
    );

    if (boostDecisionText) {
      const topup = Number(state?.plan?.reserveTopUpUsd || 0);
      boostDecisionText.textContent = state?.plan?.packBoosts
        ? `${state.plan.packBoosts} Boost · $${fmt(state.plan.packCostUsd || 0)} · reserve top-up $${fmt(topup)}`
        : 'No safe pack selected yet · accumulating fees / liquidity';
    }
    setVerifyStatus(boostDecisionStatus, state?.plan?.packBoosts ? 'READY' : 'WAIT', state?.plan?.packBoosts ? 'verified' : 'waiting');
  }

  async function loadBoostState() {
    try {
      const url = cfg.boostStateUrl || 'boost-state.json';
      const r = await fetch(`${url}?t=${Date.now()}`, { cache:'no-store' });
      if (!r.ok) throw new Error(`state ${r.status}`);
      const state = await r.json();
      applyBoostState(state);
    } catch (_) {
      applyBoostState({
        configured:false,
        addresses:{
          mint:cfg.mintAddress || '',
          reserveWallet:cfg.boostReserveWallet || '',
          boostTreasuryWallet:cfg.boostTreasuryWallet || ''
        }
      });
    }
  }

  loadBoostState();
  setInterval(loadBoostState, Math.max(15000, Number(cfg.refreshMs) || 30000));
})();
