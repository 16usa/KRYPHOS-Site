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
     OPTIONAL LIVE SOLANA STATE
     Blank addresses = no fake data / no RPC calls.
  --------------------------------------------------------- */
  async function rpc(method, params) {
    const r = await fetch(cfg.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (!r.ok) throw new Error(`RPC ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error.message || 'RPC error');
    return data.result;
  }

  async function refreshChain() {
    const hasMint = typeof cfg.mintAddress === 'string' && cfg.mintAddress.trim();
    const hasVault = typeof cfg.burnVaultTokenAccount === 'string' && cfg.burnVaultTokenAccount.trim();
    const hasProgram = typeof cfg.programId === 'string' && cfg.programId.trim();
    if (!hasMint && !hasVault && !hasProgram) return;

    const panel = document.getElementById('chainData');
    panel.hidden = false;
    document.getElementById('mintAddress').textContent = hasMint ? cfg.mintAddress : 'Not configured';
    document.getElementById('vaultAddress').textContent = hasVault ? cfg.burnVaultTokenAccount : 'Not configured';
    document.getElementById('programAddress').textContent = hasProgram ? cfg.programId : 'Not configured';
    const note = document.getElementById('liveNote');

    try {
      let vaultBalance;
      if (hasMint) {
        const s = await rpc('getTokenSupply', [cfg.mintAddress, { commitment: 'confirmed' }]);
        const raw = Number(s?.value?.amount);
        const decimals = Number(s?.value?.decimals || 0);
        if (Number.isFinite(raw)) liveSupply = raw / (10 ** decimals);
      }
      if (hasVault) {
        const v = await rpc('getTokenAccountBalance', [cfg.burnVaultTokenAccount, { commitment: 'confirmed' }]);
        const raw = Number(v?.value?.amount);
        const decimals = Number(v?.value?.decimals || 0);
        if (Number.isFinite(raw)) vaultBalance = raw / (10 ** decimals);
      }
      setStats(vaultBalance);
      renderSchedule();
      note.textContent = `Live Solana state · updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (err) {
      note.textContent = `Live Solana state unavailable: ${err.message}`;
    }
  }

  refreshChain();
  if (cfg.refreshMs && (cfg.mintAddress || cfg.burnVaultTokenAccount)) {
    setInterval(refreshChain, Math.max(15000, Number(cfg.refreshMs) || 30000));
  }
})();
