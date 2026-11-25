/**
 * Game Scoreboard - Frontend Application
 * Home Assistant Add-on SPA
 */

// State
let currentTab = 'dashboard';
let cachedGames = [];
let cachedPlayers = [];
let activeSessionId = null;

// Helpers
function getApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return cleanPath;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-indigo-600';
  toast.className = `toast px-4 py-3 rounded-xl text-white text-xs font-semibold shadow-xl flex items-center gap-2 pointer-events-auto ${bg}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    el.style.display = 'flex';
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('hidden');
    el.style.display = 'none';
  }
}

// =============================================================================
// OMARCHY UI — THEME ENGINE, QUICKSHELL TOPBAR, SPOTLIGHT & KEYBOARD NAVIGATION
// =============================================================================
const OMARCHY_THEMES = {
  "tokyo-night": {
    id: "tokyo-night",
    label: "Tokyo Night",
    dot: "#7aa2f7",
    bg: "#1a1b26",
    surface: "#16161e",
    elevated: "#24283b",
    border: "#292e42",
    focus: "#7aa2f7",
    text: "#c0caf5",
    muted: "#565f89",
    subtle: "#787c99",
    accent: "#7aa2f7",
    cyan: "#7dcfff",
    green: "#9ece6a",
    amber: "#e0af68",
    red: "#f7768e",
    purple: "#bb9af7",
  },
  "catppuccin": {
    id: "catppuccin",
    label: "Catppuccin Mocha",
    dot: "#cba6f7",
    bg: "#1e1e2e",
    surface: "#181825",
    elevated: "#313244",
    border: "#45475a",
    focus: "#cba6f7",
    text: "#cdd6f4",
    muted: "#6c7086",
    subtle: "#9399b2",
    accent: "#89b4fa",
    cyan: "#89dceb",
    green: "#a6e3a1",
    amber: "#f9e2af",
    red: "#f38ba8",
    purple: "#cba6f7",
  },
  "gruvbox": {
    id: "gruvbox",
    label: "Gruvbox Dark",
    dot: "#fabd2f",
    bg: "#1d2021",
    surface: "#282828",
    elevated: "#3c3836",
    border: "#504945",
    focus: "#fabd2f",
    text: "#ebdbb2",
    muted: "#928374",
    subtle: "#a89984",
    accent: "#83a598",
    cyan: "#8ec07c",
    green: "#b8bb26",
    amber: "#fabd2f",
    red: "#fb4934",
    purple: "#d3869b",
  },
  "sony-ps5": {
    id: "sony-ps5",
    label: "Obsidian Cyan",
    dot: "#00f0ff",
    bg: "#090d16",
    surface: "#0d1322",
    elevated: "#162038",
    border: "#1e2f52",
    focus: "#00b4d8",
    text: "#f1f5f9",
    muted: "#64748b",
    subtle: "#94a3b8",
    accent: "#0070d1",
    cyan: "#00f0ff",
    green: "#10b981",
    amber: "#f59e0b",
    red: "#f43f5e",
    purple: "#818cf8",
  }
};

let currentOmarchyTheme = localStorage.getItem('omarchy_theme') || 'tokyo-night';

function applyOmarchyTheme(themeId, notify = false) {
  const t = OMARCHY_THEMES[themeId] || OMARCHY_THEMES['tokyo-night'];
  currentOmarchyTheme = t.id;
  localStorage.setItem('omarchy_theme', t.id);

  const r = document.documentElement.style;
  r.setProperty('--om-bg', t.bg);
  r.setProperty('--om-surface', t.surface);
  r.setProperty('--om-elevated', t.elevated);
  r.setProperty('--om-border', t.border);
  r.setProperty('--om-focus', t.focus);
  r.setProperty('--om-text', t.text);
  r.setProperty('--om-muted', t.muted);
  r.setProperty('--om-subtle', t.subtle);
  r.setProperty('--om-accent', t.accent);
  r.setProperty('--om-cyan', t.cyan);
  r.setProperty('--om-green', t.green);
  r.setProperty('--om-amber', t.amber);
  r.setProperty('--om-red', t.red);
  r.setProperty('--om-purple', t.purple);

  const lbl = document.getElementById('om-active-theme-label');
  if (lbl) lbl.textContent = t.label;
  const footerLbl = document.getElementById('om-footer-theme-badge');
  if (footerLbl) footerLbl.textContent = `Theme: ${t.label}`;

  renderOmarchyThemeOptions();
  if (notify) {
    showToast(`Tema Omarchy aplicado: ${t.label}`, 'info');
  }
}

function cycleOmarchyTheme() {
  const keys = Object.keys(OMARCHY_THEMES);
  const idx = keys.indexOf(currentOmarchyTheme);
  const nextKey = keys[(idx + 1) % keys.length];
  applyOmarchyTheme(nextKey, true);
}

function toggleOmarchyThemeDropdown() {
  const dd = document.getElementById('om-theme-dropdown');
  if (!dd) return;
  const isHidden = dd.classList.contains('hidden');
  renderOmarchyThemeOptions();
  dd.classList.toggle('hidden', !isHidden);
}

function renderOmarchyThemeOptions() {
  const listEl = document.getElementById('om-theme-options-list');
  if (!listEl) return;
  listEl.innerHTML = Object.values(OMARCHY_THEMES).map(t => {
    const active = t.id === currentOmarchyTheme;
    return `
      <button type="button" onclick="applyOmarchyTheme('${t.id}', true); document.getElementById('om-theme-dropdown')?.classList.add('hidden');" class="w-full px-2.5 py-2 rounded-lg border text-left text-xs flex items-center justify-between transition ${active ? 'border-indigo-400 bg-slate-800 text-white font-bold' : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800'}">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.dot}"></span>
          <span>${t.label}</span>
        </div>
        <span class="text-[10px] ${active ? 'text-emerald-400' : 'text-slate-500'}">${active ? '● ACTIVO' : 'aplicar'}</span>
      </button>
    `;
  }).join('');
}

async function triggerQuickMatchFromTopbar() {
  try {
    // If we already have an active recording session loaded, open match modal directly
    if (currentRecordingSession && currentRecordingSession.status === 'active') {
      switchTab('sessions');
      viewSession(currentRecordingSession.id);
      await openRecordMatchModal(currentRecordingSession.id);
      return;
    }

    // Otherwise check active sessions from API
    const res = await fetch(getApiUrl('/api/sessions?status=active'));
    if (res.ok) {
      const activeSessions = await res.json();
      if (activeSessions && activeSessions.length > 0) {
        const latestActive = activeSessions[0];
        switchTab('sessions');
        await viewSession(latestActive.id);
        await openRecordMatchModal(latestActive.id);
        return;
      }
    }

    // No active session found -> open New Session modal
    switchTab('sessions');
    await openNewSessionModal();
    showToast('Inicia una nueva sesión para comenzar a capturar partidas', 'info');
  } catch (err) {
    console.error('Error in quick match trigger:', err);
  }
}

const OMARCHY_SPOTLIGHT_COMMANDS = [
  { id: 'quick_match', icon: '🏁', label: 'Registrar Partida / Iniciar Modo Captura (Sesión Activa)', tag: 'KEY: N', action: () => triggerQuickMatchFromTopbar() },
  { id: 'new_session', icon: '➕', label: 'Crear Nueva Sesión de Juego', tag: 'SESSION', action: () => { switchTab('sessions'); openNewSessionModal(); } },
  { id: 'tab_dash', icon: '📊', label: 'Ir a Workspace [1]: Dashboard General', tag: 'KEY: 1', action: () => switchTab('dashboard') },
  { id: 'tab_sessions', icon: '⚔️', label: 'Ir a Workspace [2]: Sesiones y Partidas', tag: 'KEY: 2', action: () => switchTab('sessions') },
  { id: 'tab_players', icon: '👥', label: 'Ir a Workspace [3]: Jugadores y Perfiles', tag: 'KEY: 3', action: () => switchTab('players') },
  { id: 'tab_games', icon: '⚙️', label: 'Ir a Workspace [4]: Catálogo de Juegos', tag: 'KEY: 4', action: () => switchTab('games') },
  { id: 'tab_email', icon: '✉️', label: 'Ir a Workspace [5]: Correo y Automatizaciones', tag: 'KEY: 5', action: () => switchTab('email') },
  { id: 'tab_backup', icon: '💾', label: 'Ir a Workspace [6]: Respaldo ZIP', tag: 'KEY: 6', action: () => switchTab('backup') },
  { id: 'theme_tokyo', icon: '🎨', label: 'Tema Omarchy: Tokyo Night', tag: 'THEME', action: () => applyOmarchyTheme('tokyo-night', true) },
  { id: 'theme_catppuccin', icon: '🎨', label: 'Tema Omarchy: Catppuccin Mocha', tag: 'THEME', action: () => applyOmarchyTheme('catppuccin', true) },
  { id: 'theme_gruvbox', icon: '🎨', label: 'Tema Omarchy: Gruvbox Dark', tag: 'THEME', action: () => applyOmarchyTheme('gruvbox', true) },
  { id: 'theme_ps5', icon: '🎨', label: 'Tema Omarchy: Obsidian Cyan', tag: 'THEME', action: () => applyOmarchyTheme('sony-ps5', true) },
  { id: 'changelog', icon: '📋', label: 'Ver Registro de Cambios (Changelog v1.2.0)', tag: 'DOCS', action: () => openChangelogModal() }
];

function toggleOmarchySpotlight() {
  const modal = document.getElementById('modal-omarchy-spotlight');
  if (!modal) return;
  const isOpen = modal.style.display === 'flex' && !modal.classList.contains('hidden');
  if (isOpen) {
    closeModal('modal-omarchy-spotlight');
  } else {
    openModal('modal-omarchy-spotlight');
    const inp = document.getElementById('om-spotlight-input');
    if (inp) {
      inp.value = '';
      renderOmarchySpotlightList('');
      setTimeout(() => inp.focus(), 30);
    }
  }
}

function renderOmarchySpotlightList(query = '') {
  const listEl = document.getElementById('om-spotlight-list');
  if (!listEl) return;
  const q = (query || '').trim().toLowerCase();
  const filtered = OMARCHY_SPOTLIGHT_COMMANDS.filter(c => !q || c.label.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q));
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="text-center py-4 text-slate-500">Sin comandos para "${query}"</div>`;
    return;
  }
  listEl.innerHTML = filtered.map(c => `
    <button type="button" onclick="executeOmarchySpotlightCommand('${c.id}')" class="w-full px-3 py-2 rounded-lg bg-slate-950/90 hover:bg-indigo-600/25 border border-slate-800 hover:border-indigo-500/50 flex items-center justify-between gap-2 text-left transition cursor-pointer">
      <div class="flex items-center gap-2 min-w-0">
        <span>${c.icon}</span>
        <span class="text-slate-200 font-semibold truncate">${c.label}</span>
      </div>
      <span class="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-indigo-300 font-bold flex-shrink-0">${c.tag}</span>
    </button>
  `).join('');
}

function executeOmarchySpotlightCommand(cmdId) {
  closeModal('modal-omarchy-spotlight');
  const found = OMARCHY_SPOTLIGHT_COMMANDS.find(c => c.id === cmdId);
  if (found && found.action) found.action();
}

function isAnyModalOpen() {
  const modalIds = [
    'modal-track-selector',
    'modal-character-selector',
    'modal-omarchy-spotlight',
    'modal-changelog',
    'modal-match',
    'modal-session',
    'modal-edit-player',
    'modal-automation',
    'modal-template'
  ];
  return modalIds.some(id => {
    const el = document.getElementById(id);
    return el && el.style.display !== 'none' && !el.classList.contains('hidden');
  });
}

// Initialize Omarchy Theme, Clock & Keyboard Navigation
applyOmarchyTheme(currentOmarchyTheme, false);

setInterval(() => {
  const clockEl = document.getElementById('om-live-clock');
  if (clockEl) {
    clockEl.textContent = new Date().toLocaleTimeString('es-MX', { hour12: false });
  }
}, 1000);

window.addEventListener('keydown', (e) => {
  const activeEl = document.activeElement;
  const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

  if (e.key === 'Escape') {
    const dd = document.getElementById('om-theme-dropdown');
    if (dd && !dd.classList.contains('hidden')) {
      dd.classList.add('hidden');
      return;
    }
    const priorityModals = [
      'modal-track-selector',
      'modal-character-selector',
      'modal-omarchy-spotlight',
      'modal-changelog',
      'modal-match',
      'modal-session',
      'modal-edit-player',
      'modal-automation',
      'modal-template'
    ];
    for (const mId of priorityModals) {
      const mEl = document.getElementById(mId);
      if (mEl && mEl.style.display !== 'none' && !mEl.classList.contains('hidden')) {
        closeModal(mId);
        return;
      }
    }
    if (isTyping) activeEl.blur();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    toggleOmarchySpotlight();
    return;
  }

  if (isTyping) return;

  if (e.key === '/' || e.key === '?') {
    e.preventDefault();
    toggleOmarchySpotlight();
    return;
  }

  if (e.key.toLowerCase() === 't' && !isAnyModalOpen()) {
    e.preventDefault();
    cycleOmarchyTheme();
    return;
  }

  if (e.key.toLowerCase() === 'n' && !isAnyModalOpen()) {
    e.preventDefault();
    triggerQuickMatchFromTopbar();
    return;
  }

  const tabMap = { '1': 'dashboard', '2': 'sessions', '3': 'players', '4': 'games', '5': 'email', '6': 'backup' };
  if (tabMap[e.key] && !isAnyModalOpen()) {
    e.preventDefault();
    switchTab(tabMap[e.key]);
  }
});

// Tab Switching
function switchTab(tabId) {
  currentTab = tabId;
  const tabs = ['dashboard', 'sessions', 'players', 'games', 'email', 'backup'];
  tabs.forEach(t => {
    const section = document.getElementById(`tab-${t}`);
    const navBtn = document.getElementById(`nav-${t}`);
    if (t === tabId) {
      if (section) {
        section.classList.remove('hidden');
        section.style.display = 'block';
      }
      if (navBtn) {
        navBtn.classList.add('om-pill-active');
      }
    } else {
      if (section) {
        section.classList.add('hidden');
        section.style.display = 'none';
      }
      if (navBtn) {
        navBtn.classList.remove('om-pill-active');
      }
    }
  });

  document.querySelectorAll('.mobile-nav-tab').forEach(btn => {
    const t = btn.getAttribute('data-mobile-tab');
    btn.classList.toggle('om-pill-active', t === tabId);
  });

  if (tabId === 'dashboard') loadDashboard();
  if (tabId === 'sessions') loadSessionsTab();
  if (tabId === 'players') loadPlayers();
  if (tabId === 'games') loadGames();
  if (tabId === 'email') loadEmailTab();
}

// -----------------------------------------------------------------------------
// DASHBOARD
// -----------------------------------------------------------------------------
let evolutionChartInstance = null;
let currentChartMode = 'cumulative';
let cachedTimelineData = null;

async function loadDashboard() {
  try {
    await ensureGamesLoaded();
    const gameSelect = document.getElementById('dash-game-filter');
    const selectedGame = gameSelect.value;
    const includePractice = document.getElementById('dash-practice-toggle').checked;

    document.getElementById('dash-practice-indicator').textContent = includePractice
      ? 'Modo Completo (Incluye Prácticas)'
      : 'Modo Competitivo (Excluye Prácticas)';

    // Load KPIs
    const overviewRes = await fetch(getApiUrl('/api/stats/overview'));
    if (overviewRes.ok) {
      const ov = await overviewRes.json();
      document.getElementById('kpi-matches').textContent = ov.total_matches;
      document.getElementById('kpi-practice-sub').textContent = `${ov.total_races || 0} carreras (${ov.monthly_races || 0} mes) · ${ov.competitive_matches} comp.`;
      document.getElementById('kpi-players').textContent = ov.total_players;
      document.getElementById('kpi-sessions').textContent = ov.active_sessions;
      document.getElementById('kpi-top-game').textContent = ov.top_game;
    }

    // Load Leaderboard
    let lbUrl = `/api/stats/leaderboard?include_practice=${includePractice}`;
    if (selectedGame) lbUrl += `&game_id=${encodeURIComponent(selectedGame)}`;
    const lbRes = await fetch(getApiUrl(lbUrl));
    if (lbRes.ok) {
      const leaderboard = await lbRes.json();
      renderLeaderboard(leaderboard);
      renderPodium(leaderboard);
    }

    // Load Timeline & Advanced Meta Stats
    let tlUrl = `/api/stats/timeline?include_practice=${includePractice}`;
    if (selectedGame) tlUrl += `&game_id=${encodeURIComponent(selectedGame)}`;
    const tlRes = await fetch(getApiUrl(tlUrl));
    if (tlRes.ok) {
      cachedTimelineData = await tlRes.json();
      renderEvolutionChart(cachedTimelineData);
      renderAdvancedStats(cachedTimelineData);
    }

    // Load Track & Class Performance Analytics
    let trkUrl = `/api/stats/tracks?include_practice=${includePractice}`;
    if (selectedGame) trkUrl += `&game_id=${encodeURIComponent(selectedGame)}`;
    const trkRes = await fetch(getApiUrl(trkUrl));
    if (trkRes.ok) {
      const trkData = await trkRes.json();
      renderClassAndTrackAnalytics(trkData);
    }

    // Load Recent Matches
    const rmRes = await fetch(getApiUrl('/api/stats/recent_matches?limit=8'));
    if (rmRes.ok) {
      const recent = await rmRes.json();
      renderRecentMatches(recent);
    }
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function switchChartMode(mode) {
  currentChartMode = mode;
  const cumBtn = document.getElementById('chart-mode-cumulative');
  const matchBtn = document.getElementById('chart-mode-match');
  if (mode === 'cumulative') {
    if (cumBtn) cumBtn.className = 'px-2.5 py-1 rounded-lg font-semibold text-indigo-400 bg-slate-800 transition';
    if (matchBtn) matchBtn.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-400 hover:text-white transition';
  } else {
    if (cumBtn) cumBtn.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-400 hover:text-white transition';
    if (matchBtn) matchBtn.className = 'px-2.5 py-1 rounded-lg font-semibold text-indigo-400 bg-slate-800 transition';
  }
  if (cachedTimelineData) {
    renderEvolutionChart(cachedTimelineData);
  }
}

function renderEvolutionChart(data) {
  const canvas = document.getElementById('dash-evolution-chart');
  const emptyEl = document.getElementById('dash-chart-empty');
  if (!canvas) return;

  const timeline = (data && data.timeline) || [];
  const players = (data && data.players) || {};

  if (!timeline || timeline.length === 0) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (evolutionChartInstance) {
      evolutionChartInstance.destroy();
      evolutionChartInstance = null;
    }
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  const participatingPlayerIds = new Set();
  timeline.forEach(t => {
    Object.keys(t.scores || {}).forEach(pid => participatingPlayerIds.add(Number(pid)));
  });

  const palette = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#38bdf8', '#a855f7', '#ef4444', '#14b8a6'];
  const labels = timeline.map(t => t.label || `#${t.match_number}`);

  const datasets = [];
  let colorIdx = 0;
  participatingPlayerIds.forEach(pId => {
    const pInfo = players[pId] || {};
    const pName = pInfo.nickname || pInfo.name || `P${pId}`;
    const pColor = pInfo.color_hex || palette[colorIdx % palette.length];
    colorIdx++;

    const seriesData = timeline.map(t => {
      const sc = (t.scores && t.scores[String(pId)]) || null;
      if (!sc) return null;
      return currentChartMode === 'cumulative' ? sc.cumulative_score : sc.score;
    });

    datasets.push({
      label: pName,
      data: seriesData,
      borderColor: pColor,
      backgroundColor: pColor + '20',
      borderWidth: 2.5,
      tension: 0.35,
      fill: false,
      pointRadius: timeline.length > 20 ? 2 : 4,
      pointHoverRadius: 6,
      spanGaps: true
    });
  });

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  if (evolutionChartInstance) {
    evolutionChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  evolutionChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#cbd5e1',
            boxWidth: 12,
            font: { size: 11, weight: 'bold' }
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#ffffff',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            title: function(tooltipItems) {
              const item = tooltipItems[0];
              const matchObj = timeline[item.dataIndex];
              return matchObj ? `${matchObj.session_title} · Partida #${matchObj.match_number} (${matchObj.date})` : item.label;
            },
            label: function(context) {
              const pId = Array.from(participatingPlayerIds)[context.datasetIndex];
              const matchObj = timeline[context.dataIndex];
              const scObj = matchObj && matchObj.scores && matchObj.scores[String(pId)];
              const charStr = scObj && scObj.character ? ` (${scObj.character})` : '';
              return ` ${context.dataset.label}: ${context.parsed.y} pts${charStr}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#1e293b' },
          ticks: { color: '#64748b', font: { size: 10 } }
        },
        y: {
          grid: { color: '#1e293b' },
          ticks: { color: '#64748b', font: { size: 10 } },
          title: {
            display: true,
            text: currentChartMode === 'cumulative' ? 'Puntos Acumulados' : 'Puntos por Partida',
            color: '#64748b',
            font: { size: 10 }
          }
        }
      }
    }
  });
}

function renderAdvancedStats(data) {
  if (!data) return;

  // Record Match
  const rec = data.record_score;
  const recPlayerEl = document.getElementById('stat-record-player');
  const recScoreEl = document.getElementById('stat-record-score');
  const recDetailEl = document.getElementById('stat-record-detail');
  if (recPlayerEl) {
    if (rec && rec.score > 0) {
      recPlayerEl.textContent = rec.player_name || rec.player_nickname;
      recScoreEl.textContent = `${rec.score} pts`;
      const charStr = rec.character ? ` con ${rec.character}` : '';
      recDetailEl.textContent = `${rec.match_title}${charStr} (${rec.date})`;
    } else {
      recPlayerEl.textContent = 'Sin récord aún';
      recScoreEl.textContent = '0 pts';
      recDetailEl.textContent = 'Registra partidas oficiales';
    }
  }

  // Top Character / Meta
  const charStats = data.character_stats || [];
  const topChar = charStats[0];
  const charPlayerEl = document.getElementById('stat-top-char');
  const charWinsEl = document.getElementById('stat-top-char-wins');
  const charWinrateEl = document.getElementById('stat-top-char-winrate');
  const charIconBox = document.getElementById('stat-top-char-icon-box');
  if (charPlayerEl) {
    if (topChar) {
      charPlayerEl.textContent = topChar.character;
      charWinsEl.textContent = `${topChar.wins} victorias (${topChar.picks} carreras)`;
      charWinrateEl.textContent = `Efectividad: ${topChar.win_rate}%`;
      if (charIconBox) {
        const iconUrl = getCharacterIconUrl(topChar.character);
        charIconBox.innerHTML = iconUrl
          ? `<img src="${iconUrl}" alt="${topChar.character}" class="w-8 h-8 object-contain">`
          : '🏎️';
      }
    } else {
      charPlayerEl.textContent = 'Sin personaje registrado';
      charWinsEl.textContent = '0 victorias';
      charWinrateEl.textContent = 'Efectividad: 0%';
      if (charIconBox) charIconBox.innerHTML = '🏎️';
    }
  }

  // Best Winrate Player
  const pWins = {};
  const pPicks = {};
  (data.timeline || []).forEach(t => {
    Object.entries(t.scores || {}).forEach(([pId, sc]) => {
      pPicks[pId] = (pPicks[pId] || 0) + 1;
      if (sc.rank === 1) pWins[pId] = (pWins[pId] || 0) + 1;
    });
  });

  let bestP = null;
  let bestRate = -1;
  Object.keys(pPicks).forEach(pId => {
    const played = pPicks[pId];
    if (played >= 2) {
      const wins = pWins[pId] || 0;
      const rate = (wins / played) * 100;
      if (rate > bestRate) {
        bestRate = rate;
        bestP = { id: pId, rate: Math.round(rate), wins, played };
      }
    }
  });

  const bestPlayerEl = document.getElementById('stat-best-winrate-player');
  const bestWinPctEl = document.getElementById('stat-best-winrate-pct');
  const bestDetailEl = document.getElementById('stat-best-winrate-detail');
  if (bestPlayerEl) {
    if (bestP && data.players && data.players[bestP.id]) {
      const p = data.players[bestP.id];
      bestPlayerEl.textContent = p.nickname || p.name;
      bestWinPctEl.textContent = `${bestP.rate}% win rate`;
      bestDetailEl.textContent = `${bestP.wins} victorias en ${bestP.played} partidas`;
    } else {
      bestPlayerEl.textContent = 'En competencia';
      bestWinPctEl.textContent = '-';
      bestDetailEl.textContent = 'Mínimo 2 partidas para calcular racha';
    }
  }
}

let cachedTrackAnalyticsData = null;

function renderClassAndTrackAnalytics(data) {
  cachedTrackAnalyticsData = data || { track_stats: [], class_stats: [] };

  // 1. Render Class Stats
  const classEl = document.getElementById('dash-class-stats-list');
  if (classEl) {
    const classStats = cachedTrackAnalyticsData.class_stats || [];
    if (classStats.length === 0) {
      classEl.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">Aún no hay partidas registradas por clase.</div>`;
    } else {
      classEl.innerHTML = classStats.map(c => {
        const leader = c.leader;
        const leaderHtml = leader
          ? `<span class="font-bold text-amber-400">👑 ${leader.nickname || leader.name}</span> <span class="text-slate-400">(${leader.wins} vic · ${leader.total_points} pts)</span>`
          : `<span class="text-slate-500">-</span>`;

        const pillsHtml = (c.standings || []).slice(0, 4).map((p, idx) => `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
            <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${p.color_hex}"></span>
            <span class="text-slate-200 font-semibold">${idx + 1}º ${p.nickname}</span>
            <span class="text-amber-400 font-bold">${p.total_points}p</span>
          </span>
        `).join('');

        return `
          <div class="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-black text-xs">${c.class_mode}</span>
                <span class="text-[11px] text-slate-400">${c.matches_count} part. · 🏁 ${c.races_count} carr.</span>
              </div>
              <div class="text-xs">${leaderHtml}</div>
            </div>
            <div class="flex flex-wrap gap-1.5">${pillsHtml}</div>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Populate player filter for Track Analytics
  const filterSelect = document.getElementById('dash-track-player-filter');
  if (filterSelect) {
    const currentVal = filterSelect.value;
    const playerMap = new Map();
    (cachedTrackAnalyticsData.track_stats || []).forEach(t => {
      (t.players || []).forEach(p => {
        if (!playerMap.has(p.player_id)) {
          playerMap.set(p.player_id, p.nickname || p.name);
        }
      });
    });
    let opts = `<option value="">Todos los Jugadores (Rey de la Pista)</option>`;
    playerMap.forEach((name, id) => {
      opts += `<option value="${id}" ${String(id) === String(currentVal) ? 'selected' : ''}>Desempeño de: ${name}</option>`;
    });
    filterSelect.innerHTML = opts;
  }

  renderTrackAnalyticsTable();
}

function renderTrackAnalyticsTable() {
  const tbody = document.getElementById('dash-track-stats-body');
  if (!tbody) return;
  const trackStats = (cachedTrackAnalyticsData && cachedTrackAnalyticsData.track_stats) || [];
  const filterSelect = document.getElementById('dash-track-player-filter');
  const selectedPlayerId = filterSelect ? filterSelect.value : '';

  if (trackStats.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-500 text-xs">Registra carreras en Modo Captura para ver estadísticas por pista y copa.</td></tr>`;
    return;
  }

  let rowsData = [];
  if (selectedPlayerId) {
    const pid = Number(selectedPlayerId);
    trackStats.forEach(t => {
      const pEntry = (t.players || []).find(p => p.player_id === pid);
      if (pEntry) {
        rowsData.push({
          track_name: t.track_name,
          cup_name: t.cup_name,
          times_played: pEntry.races,
          player: pEntry
        });
      }
    });
    rowsData.sort((a, b) => (a.player.avg_position - b.player.avg_position) || (b.player.wins - a.player.wins));
  } else {
    rowsData = trackStats.map(t => ({
      track_name: t.track_name,
      cup_name: t.cup_name,
      times_played: t.times_played,
      player: t.best_player
    }));
  }

  if (rowsData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-500 text-xs">Sin carreras registradas para este jugador.</td></tr>`;
    return;
  }

  tbody.innerHTML = rowsData.map(r => {
    const p = r.player;
    const playerBadge = p
      ? `<span class="inline-flex items-center gap-1.5 font-bold text-white"><span class="w-2 h-2 rounded-full" style="background-color: ${p.color_hex}"></span>${p.nickname || p.name}</span>`
      : '-';
    const tIcon = getTrackIconUrl(r.track_name);
    const cIcon = getCupIconUrl(r.cup_name);
    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2 px-3">
          <div class="flex items-center gap-2.5">
            ${tIcon ? `<img src="${tIcon}" alt="${r.track_name}" class="w-12 h-8 rounded-lg object-cover border border-slate-700 flex-shrink-0">` : ''}
            <div>
              <div class="font-bold text-white text-xs">${r.track_name}</div>
              ${r.cup_name ? `<div class="text-[10px] text-slate-400 flex items-center gap-1">${cIcon ? `<img src="${cIcon}" class="w-3.5 h-3.5 object-contain">` : ''}${r.cup_name}</div>` : ''}
            </div>
          </div>
        </td>
        <td class="py-2 px-2 text-center font-semibold text-sky-400">${r.times_played}</td>
        <td class="py-2 px-3">${playerBadge}</td>
        <td class="py-2 px-2 text-center font-bold text-emerald-400">${p ? p.wins : 0} 🥇</td>
        <td class="py-2 px-2 text-center font-mono text-slate-300">${p ? p.avg_position + 'º' : '-'}</td>
        <td class="py-2 px-3 text-right font-black text-amber-400">${p ? p.avg_points + ' pts' : '-'}</td>
      </tr>
    `;
  }).join('');
}

function renderPodium(leaderboard) {
  const container = document.getElementById('dash-podium-container');
  const podiumEl = document.getElementById('dash-podium');
  if (!leaderboard || leaderboard.length === 0) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  const top3 = leaderboard.slice(0, 3);
  const order = [
    { pos: 2, item: top3[1], height: 'h-28', color: 'border-slate-400 bg-slate-800/80', badge: '🥈 2º' },
    { pos: 1, item: top3[0], height: 'h-36', color: 'border-amber-400 bg-amber-950/30', badge: '👑 1º' },
    { pos: 3, item: top3[2], height: 'h-24', color: 'border-amber-700 bg-slate-800/80', badge: '🥉 3º' }
  ];

  podiumEl.innerHTML = order.map(slot => {
    if (!slot.item) {
      return `<div class="flex flex-col items-center justify-end"><div class="w-full ${slot.height} rounded-xl bg-slate-900/40 border border-slate-800/40"></div></div>`;
    }
    const it = slot.item;
    const avatarHtml = it.avatar_url
      ? `<img src="${getApiUrl(it.avatar_url)}" class="w-12 h-12 rounded-full object-cover border-2 shadow-md" style="border-color: ${it.color_hex}">`
      : `<div class="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-md" style="background-color: ${it.color_hex}">${it.name.substring(0, 2).toUpperCase()}</div>`;

    return `
      <div class="flex flex-col items-center justify-end">
        <div class="mb-2 flex flex-col items-center text-center">
          ${avatarHtml}
          <div class="font-bold text-xs text-white mt-1 truncate max-w-[90px]">${it.nickname || it.name}</div>
          <div class="text-[11px] font-semibold text-amber-400">${it.wins} vic · ${it.races_played || it.matches_played} carr.</div>
        </div>
        <div class="w-full ${slot.height} rounded-2xl border ${slot.color} flex flex-col items-center justify-center shadow-lg">
          <span class="text-base font-black">${slot.badge}</span>
          <span class="text-[10px] text-slate-400">${it.total_score} pts</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderLeaderboard(data) {
  const tbody = document.getElementById('leaderboard-body');
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-500">Aún no hay partidas registradas con los filtros seleccionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => {
    const avatarHtml = r.avatar_url
      ? `<img src="${getApiUrl(r.avatar_url)}" class="w-8 h-8 rounded-full object-cover border" style="border-color: ${r.color_hex}">`
      : `<div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs" style="background-color: ${r.color_hex}">${r.name.substring(0, 2).toUpperCase()}</div>`;

    const rankBadge = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-3 px-4 text-center font-black text-slate-400">${rankBadge}</td>
        <td class="py-3 px-4 flex items-center gap-3">
          ${avatarHtml}
          <div>
            <div class="font-bold text-white text-sm">${r.name}</div>
            <div class="text-xs text-slate-400 font-mono">${r.nickname ? '@' + r.nickname : ''}</div>
          </div>
        </td>
        <td class="py-3 px-4 text-center text-slate-300 font-semibold">${r.matches_played}</td>
        <td class="py-3 px-4 text-center text-sky-400 font-bold">${r.races_played || r.matches_played}</td>
        <td class="py-3 px-4 text-center text-emerald-400 font-bold">${r.wins}</td>
        <td class="py-3 px-4 text-center">
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${r.win_rate >= 50 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}">${r.win_rate}%</span>
        </td>
        <td class="py-3 px-4 text-center text-amber-400">${r.podiums}</td>
        <td class="py-3 px-4 text-right font-black text-indigo-300">${r.total_score}</td>
        <td class="py-3 px-4 text-right text-slate-400 font-mono">${r.avg_score}</td>
      </tr>
    `;
  }).join('');
}

function renderRecentMatches(matches) {
  const container = document.getElementById('recent-matches-list');
  if (!matches || matches.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">No hay partidas recientes.</div>`;
    return;
  }

  container.innerHTML = matches.map(m => {
    const practiceBadge = m.is_practice
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">Práctica</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">Competitiva</span>`;

    const scoresList = m.scores.map(s => `
      <span class="inline-flex items-center gap-1.5 text-xs bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800">
        <span class="font-bold text-white">${s.rank_position}º</span>
        <span class="text-slate-300">${s.nickname || s.name}</span>
        <span class="text-amber-400 font-black">(${s.score} pts)</span>
      </span>
    `).join('');

    return `
      <div class="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <span class="text-2xl">${m.game_icon || '🎮'}</span>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-white text-sm">${m.game_name}</span>
              ${practiceBadge}
              <span class="text-xs text-slate-500 font-mono">${m.match_type}</span>
            </div>
            <div class="text-[11px] text-slate-400">Sesión: <span class="text-slate-300">${m.session_title}</span> · ${new Date(m.played_at).toLocaleString()}</div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          ${scoresList}
        </div>
      </div>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// SESSIONS (MATCH TRACKER)
// -----------------------------------------------------------------------------
async function setupInlineSessionForm() {
  await ensureGamesLoaded();
  await ensurePlayersLoaded();

  // Populate games
  const gameSelect = document.getElementById('session-game-select');
  if (gameSelect && cachedGames.length > 0) {
    gameSelect.innerHTML = cachedGames.map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');
  }

  // Populate players checkboxes
  const playersBox = document.getElementById('session-players-checkboxes');
  if (playersBox) {
    if (cachedPlayers.length === 0) {
      playersBox.innerHTML = `<div class="col-span-full text-xs text-amber-400 py-3 text-center">No hay jugadores registrados todavía. Ve a la pestaña "Jugadores" y da de alta al menos uno.</div>`;
    } else {
      playersBox.innerHTML = cachedPlayers.map(p => `
        <label class="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition">
          <input type="checkbox" name="session-players" value="${p.id}" checked class="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${p.color_hex}"></span>
          <span class="text-xs text-white font-medium truncate">${p.nickname || p.name}</span>
        </label>
      `).join('');
    }
  }

  // Pre-fill title if empty
  const titleInput = document.getElementById('session-title');
  if (titleInput && !titleInput.value) {
    const dateStr = new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' });
    titleInput.value = `Noche de juego - ${dateStr}`;
  }
}

async function loadSessionsTab() {
  await setupInlineSessionForm();
  if (activeSessionId) {
    await viewSession(activeSessionId);
  } else {
    const detailView = document.getElementById('session-detail-view');
    if (detailView) {
      detailView.classList.add('hidden');
      detailView.style.display = 'none';
    }
    const createCard = document.getElementById('session-create-card');
    if (createCard) {
      createCard.classList.remove('hidden');
      createCard.style.display = 'block';
    }
    const listContainer = document.getElementById('sessions-list-container');
    if (listContainer) {
      listContainer.classList.remove('hidden');
      listContainer.style.display = 'block';
    }
    await loadSessionsList();
  }
}

async function loadSessionsList() {
  const container = document.getElementById('sessions-grid');
  try {
    const res = await fetch(getApiUrl('/api/sessions'));
    if (!res.ok) return;
    const sessions = await res.json();

    if (!sessions || sessions.length === 0) {
      container.innerHTML = `<div class="col-span-full text-center py-8 text-slate-500 text-xs">Aún no hay sesiones creadas. Usa el formulario de arriba para iniciar tu primera sesión.</div>`;
      return;
    }

    container.innerHTML = sessions.map(s => {
      const statusBadge = s.status === 'active'
        ? `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">● Activa</span>`
        : `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">Finalizada</span>`;

      const playerAvatars = s.players.map(p => {
        return p.avatar_url
          ? `<img src="${getApiUrl(p.avatar_url)}" title="${p.name}" class="w-7 h-7 rounded-full object-cover border-2 border-slate-900 -ml-2 first:ml-0">`
          : `<div title="${p.name}" class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-slate-900 -ml-2 first:ml-0" style="background-color: ${p.color_hex}">${p.name.substring(0,2).toUpperCase()}</div>`;
      }).join('');

      return `
        <div onclick="viewSession(${s.id})" class="game-card-hover cursor-pointer p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3.5 shadow-md">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl sm:text-3xl">${s.game_icon || '🎮'}</span>
              <div>
                <h4 class="font-bold text-white text-sm sm:text-base leading-tight">${s.title}</h4>
                <div class="text-xs text-indigo-400 font-medium">${s.game_name}</div>
              </div>
            </div>
            ${statusBadge}
          </div>

          <div class="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <div class="flex items-center">
              ${playerAvatars}
            </div>
            <div class="flex items-center gap-2.5">
              <span class="font-semibold text-slate-300">
                ${s.total_matches} ${s.total_matches === 1 ? 'partida' : 'partidas'}
              </span>
              ${s.status !== 'active' ? `
                <button onclick="event.stopPropagation(); toggleSessionStatus(${s.id}, 'active')" class="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-[11px] transition flex items-center gap-1">
                  <span>▶️</span> Reanudar
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error fetching sessions:', err);
  }
}

async function viewSession(sessionId) {
  activeSessionId = sessionId;
  const createCard = document.getElementById('session-create-card');
  if (createCard) {
    createCard.classList.add('hidden');
    createCard.style.display = 'none';
  }
  const listContainer = document.getElementById('sessions-list-container');
  if (listContainer) {
    listContainer.classList.add('hidden');
    listContainer.style.display = 'none';
  }
  const detailView = document.getElementById('session-detail-view');
  if (detailView) {
    detailView.classList.remove('hidden');
    detailView.style.display = 'block';
  }

  try {
    const res = await fetch(getApiUrl(`/api/sessions/${sessionId}`));
    if (!res.ok) {
      showToast('Error al cargar la sesión', 'error');
      closeSessionDetail();
      return;
    }
    const session = await res.json();
    renderSessionDetail(session);
  } catch (err) {
    console.error('Error viewing session:', err);
  }
}

function closeSessionDetail() {
  activeSessionId = null;
  const detailView = document.getElementById('session-detail-view');
  if (detailView) {
    detailView.classList.add('hidden');
    detailView.style.display = 'none';
  }
  const createCard = document.getElementById('session-create-card');
  if (createCard) {
    createCard.classList.remove('hidden');
    createCard.style.display = 'block';
  }
  const listContainer = document.getElementById('sessions-list-container');
  if (listContainer) {
    listContainer.classList.remove('hidden');
    listContainer.style.display = 'block';
  }
  loadSessionsList();
}

function renderSessionDetail(s) {
  currentRecordingSession = s;
  const container = document.getElementById('session-detail-view');

  const statusBadge = s.status === 'active'
    ? `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">● En Curso</span>`
    : `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">Finalizada</span>`;

  // Standings rows
  const standingsRows = s.standings.map((st, idx) => {
    const avatarHtml = st.avatar_url
      ? `<img src="${getApiUrl(st.avatar_url)}" class="w-8 h-8 rounded-full object-cover border" style="border-color: ${st.color_hex}">`
      : `<div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs" style="background-color: ${st.color_hex}">${st.name.substring(0, 2).toUpperCase()}</div>`;

    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-4 text-center font-black">${medal}</td>
        <td class="py-2.5 px-4 flex items-center gap-3">
          ${avatarHtml}
          <div>
            <div class="font-bold text-white text-sm">${st.name}</div>
            <div class="text-[11px] text-slate-400">${st.nickname ? '@' + st.nickname : ''}</div>
          </div>
        </td>
        <td class="py-2.5 px-4 text-center text-emerald-400 font-bold">${st.wins}</td>
        <td class="py-2.5 px-4 text-center text-slate-400">${st.matches_played}</td>
        <td class="py-2.5 px-4 text-center text-sky-400 font-semibold">${st.races_played || st.matches_played}</td>
        <td class="py-2.5 px-4 text-right font-black text-amber-400 text-base">${st.total_score}</td>
      </tr>
    `;
  }).join('');

  // Matches list with Edit button
  const matchesHtml = s.matches.length === 0
    ? `<div class="text-center py-8 text-slate-500 text-xs">Aún no has registrado ninguna partida en esta sesión. Haz clic en "Registrar Partida" para comenzar.</div>`
    : s.matches.map(m => {
        const practiceBadge = m.is_practice
          ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">Práctica</span>`
          : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">Oficial</span>`;

        // Format dynamic rules (like Mario Kart fields from photo)
        const rulesBadges = Object.entries(m.rule_values || {}).map(([k, v]) => `
          <span class="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 text-[11px]">${k}: <strong class="text-indigo-300">${v}</strong></span>
        `).join('');

        const scoresTable = m.scores.map(sc => {
          const charOrKart = sc.metrics?.character || sc.metrics?.kart || '';
          const charHtml = charOrKart ? renderCharacterBadgeHtml(charOrKart) : '-';
          return `
            <tr class="border-b border-slate-800/60 last:border-0">
              <td class="py-2 px-3 font-bold text-slate-300 w-16">${sc.rank_position}º</td>
              <td class="py-2 px-3 font-semibold text-white">${sc.player_nickname || sc.player_name}</td>
              <td class="py-2 px-3 text-right font-black text-amber-400">${sc.score} pts</td>
              <td class="py-2 px-3 text-right text-slate-300">${charHtml}</td>
            </tr>
          `;
        }).join('');

        let racesDetailHtml = '';
        if (m.races && m.races.length > 0) {
          const raceRowsHtml = m.races.map(r => {
            const pBadges = (r.scores || []).map(rs => {
              const medal = rs.position === 1 ? '🥇' : rs.position === 2 ? '🥈' : rs.position === 3 ? '🥉' : `${rs.position}º`;
              return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${rs.color_hex || '#6366f1'}"></span>
                <strong class="text-white">${rs.player_nickname || rs.player_name}</strong>:
                <span class="text-indigo-300 font-bold">${medal}</span>
                <span class="text-amber-400 font-semibold">(+${rs.points})</span>
              </span>`;
            }).join('');

            const tIcon = getTrackIconUrl(r.track_name);
            const cIcon = getCupIconUrl(r.cup_name);

            return `
              <div class="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="flex items-center gap-2.5">
                  ${tIcon ? `<img src="${tIcon}" alt="${r.track_name}" class="w-11 h-7 rounded object-cover border border-slate-700 flex-shrink-0">` : ''}
                  <div>
                    <span class="text-[11px] font-black text-sky-400">Carrera #${r.race_number}</span>
                    <span class="text-xs font-bold text-white ml-1.5">${r.track_name}</span>
                    ${r.cup_name ? `<span class="text-[10px] text-slate-400 ml-1 inline-flex items-center gap-1">(${cIcon ? `<img src="${cIcon}" class="w-3.5 h-3.5 object-contain inline">` : ''}${r.cup_name})</span>` : ''}
                  </div>
                </div>
                <div class="flex flex-wrap gap-1.5">${pBadges}</div>
              </div>
            `;
          }).join('');

          racesDetailHtml = `
            <div class="pt-2 border-t border-slate-800/70">
              <button type="button" onclick="toggleMatchBurndownPanel(${m.id})" class="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5">
                <span>📈</span> Ver Burndown de la Copa y Desglose por Pista (${m.races.length} carreras)
              </button>
              <div id="match-burndown-panel-${m.id}" class="hidden mt-3 space-y-3">
                <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Evolución de Puntos Carrera a Carrera (Burndown)</div>
                  <div class="relative w-full h-48">
                    <canvas id="match-burndown-canvas-${m.id}"></canvas>
                  </div>
                </div>
                <div class="space-y-1.5">
                  ${raceRowsHtml}
                </div>
              </div>
            </div>
          `;
        }

        return `
          <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <div class="flex items-center gap-2">
                <span class="font-black text-indigo-400 text-sm">Partida #${m.match_number}</span>
                <span class="text-xs text-slate-300 font-semibold">(${m.match_type})</span>
                ${m.race_count ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30">🏁 ${m.race_count} carreras</span>` : ''}
                ${practiceBadge}
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-[11px] text-slate-500 mr-1">${new Date(m.played_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <button onclick="openEditMatchModal(${m.id})" class="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition flex items-center gap-1" title="Editar partida">
                  <span>✏️</span> Editar
                </button>
                <button onclick="handleDeleteMatch(${m.id})" class="p-1 rounded-lg bg-slate-900 hover:bg-rose-900/50 hover:text-rose-400 text-slate-500 text-xs transition" title="Eliminar partida">
                  🗑️
                </button>
              </div>
            </div>

            ${rulesBadges ? `<div class="flex flex-wrap gap-1.5">${rulesBadges}</div>` : ''}

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <tbody>
                  ${scoresTable}
                </tbody>
              </table>
            </div>

            ${racesDetailHtml}

            ${m.notes ? `<div class="text-[11px] text-slate-400 italic">Notas: ${m.notes}</div>` : ''}
          </div>
        `;
      }).join('');

  container.innerHTML = `
    <!-- Resumption Banner if completed -->
    ${s.status !== 'active' ? `
      <div class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div class="flex items-center gap-2.5 text-xs text-amber-300">
          <span class="text-xl">ℹ️</span>
          <div>
            <div class="font-bold text-amber-200">Esta sesión está marcada como Finalizada.</div>
            <div>Puedes reanudarla en cualquier momento para seguir registrando partidas o editarlas.</div>
          </div>
        </div>
        <button onclick="toggleSessionStatus(${s.id}, 'active')" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition flex-shrink-0">
          <span>▶️</span> Reanudar Sesión Ahora
        </button>
      </div>
    ` : ''}

    <!-- Header -->
    <div class="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <button onclick="closeSessionDetail()" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold">
            ← Volver
          </button>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">${s.game_icon}</span>
              <h2 class="text-xl font-bold text-white">${s.title}</h2>
              ${statusBadge}
            </div>
            <div class="text-xs text-slate-400 mt-0.5">Juego: <span class="text-indigo-400 font-semibold">${s.game_name}</span> · Iniciada: ${new Date(s.started_at).toLocaleDateString()}</div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${s.status === 'active' ? `
            <button onclick="openRecordMatchModal(${s.id})" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition">
              <span>🏁</span> Registrar Partida
            </button>
            <button onclick="toggleSessionStatus(${s.id}, 'completed')" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition flex items-center gap-1">
              <span>🏁</span> Finalizar Sesión
            </button>
          ` : `
            <button onclick="toggleSessionStatus(${s.id}, 'active')" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 transition">
              <span>▶️</span> Reanudar Sesión
            </button>
          `}
          <button onclick="handleDeleteSession(${s.id})" class="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/50 hover:text-rose-400 text-slate-400 text-xs transition" title="Eliminar sesión">
            🗑️
          </button>
        </div>
      </div>
    </div>

    <!-- Live Standings Table -->
    <div class="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
      <div class="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>📊</span> Tabla de Puntuación de la Sesión
        </h3>
        <span class="text-xs text-slate-400">${s.matches.length} partidas registradas${s.total_races ? ` · 🏁 ${s.total_races} carreras` : ''}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs text-slate-300">
          <thead class="bg-slate-950/60 uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th class="py-2.5 px-4 w-12 text-center">Pos</th>
              <th class="py-2.5 px-4">Jugador</th>
              <th class="py-2.5 px-4 text-center">Victorias 🥇</th>
              <th class="py-2.5 px-4 text-center">Partidas</th>
              <th class="py-2.5 px-4 text-center">Carreras 🏁</th>
              <th class="py-2.5 px-4 text-right">Puntos Totales</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            ${standingsRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Matches History -->
    <div class="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>📜</span> Historial de Partidas
        </h3>
      </div>
      <div class="space-y-3">
        ${matchesHtml}
      </div>
    </div>
  `;
}

async function toggleSessionStatus(sessionId, newStatus) {
  try {
    const res = await fetch(getApiUrl(`/api/sessions/${sessionId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      showToast(`Sesión marcada como ${newStatus === 'completed' ? 'finalizada' : 'activa'}`, 'success');
      viewSession(sessionId);
    }
  } catch (err) {
    showToast('Error al actualizar estado de la sesión', 'error');
  }
}

async function handleDeleteSession(sessionId) {
  if (!confirm('¿Seguro que deseas eliminar esta sesión y todas sus partidas?')) return;
  try {
    const res = await fetch(getApiUrl(`/api/sessions/${sessionId}`), { method: 'DELETE' });
    if (res.ok) {
      showToast('Sesión eliminada con éxito', 'success');
      closeSessionDetail();
    }
  } catch (err) {
    showToast('Error al eliminar sesión', 'error');
  }
}

async function handleDeleteMatch(matchId) {
  if (!confirm('¿Seguro que deseas eliminar esta partida?')) return;
  try {
    const res = await fetch(getApiUrl(`/api/sessions/matches/${matchId}`), { method: 'DELETE' });
    if (res.ok) {
      showToast('Partida eliminada', 'success');
      if (activeSessionId) viewSession(activeSessionId);
    }
  } catch (err) {
    showToast('Error al eliminar partida', 'error');
  }
}

// -----------------------------------------------------------------------------
// NEW SESSION MODAL
// -----------------------------------------------------------------------------
async function openNewSessionModal() {
  await ensureGamesLoaded();
  await ensurePlayersLoaded();

  // Populate games
  const gameSelect = document.getElementById('session-game-select');
  gameSelect.innerHTML = cachedGames.map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');

  // Populate players checkboxes
  const playersBox = document.getElementById('session-players-checkboxes');
  if (cachedPlayers.length === 0) {
    playersBox.innerHTML = `<div class="col-span-2 text-xs text-slate-500 py-2">No hay jugadores registrados. Da de alta jugadores primero en la pestaña Jugadores.</div>`;
  } else {
    playersBox.innerHTML = cachedPlayers.map(p => `
      <label class="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer">
        <input type="checkbox" name="session-players" value="${p.id}" checked class="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0">
        <span class="text-xs text-white font-medium">${p.nickname || p.name}</span>
      </label>
    `).join('');
  }

  // Pre-fill title
  const dateStr = new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' });
  document.getElementById('session-title').value = `Partida del ${dateStr}`;

  openModal('modal-session');
}

async function handleCreateSession(e) {
  e.preventDefault();
  const game_id = document.getElementById('session-game-select').value;
  const title = document.getElementById('session-title').value.trim();
  const notes = document.getElementById('session-notes').value.trim();

  const playerCheckboxes = document.querySelectorAll('input[name="session-players"]:checked');
  const player_ids = Array.from(playerCheckboxes).map(cb => parseInt(cb.value, 10));

  if (!title) {
    showToast('El título de la sesión es requerido', 'error');
    return;
  }

  if (player_ids.length === 0) {
    showToast('Selecciona al menos un jugador participante para la sesión', 'error');
    return;
  }

  const btn = document.getElementById('btn-create-session');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Iniciando sesión...';
  }

  try {
    const res = await fetch(getApiUrl('/api/sessions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id, title, notes, player_ids })
    });
    if (res.ok) {
      const newSession = await res.json();
      document.getElementById('session-title').value = '';
      document.getElementById('session-notes').value = '';
      showToast('¡Sesión iniciada con éxito!', 'success');
      viewSession(newSession.id);
    } else {
      showToast('Error al crear la sesión', 'error');
    }
  } catch (err) {
    showToast('Error al conectar con el servidor', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🚀</span> Comenzar Sesión';
    }
  }
}

// -----------------------------------------------------------------------------
// RECORD & EDIT MATCH MODAL + DYNAMIC RULES + MODO CAPTURA (CARRERA POR CARRERA)
// -----------------------------------------------------------------------------
let currentRecordingSession = null;
let currentEditingMatchId = null;
let currentSelectedPlayerIds = new Set();
let currentMatchGame = null;
let currentGameMetricsDef = null;
let currentGameDefaultPoints = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
let currentRuleDraftValues = {};
let showManualScoresInConfig = false;
let postMatchBurndownChartInstance = null;
const sessionMatchBurndownCharts = {};

// Official Mario Kart 8 Deluxe 48 Character Icons Map
const MK8_CHARACTER_ICONS = {
  "Mario": "static/img/mk8/characters/mario.png",
  "Luigi": "static/img/mk8/characters/luigi.png",
  "Peach": "static/img/mk8/characters/peach.png",
  "Daisy": "static/img/mk8/characters/daisy.png",
  "Rosalina": "static/img/mk8/characters/rosalina.png",
  "Tanooki Mario": "static/img/mk8/characters/tanooki_mario.png",
  "Cat Peach": "static/img/mk8/characters/cat_peach.png",
  "Birdo": "static/img/mk8/characters/birdo.png",
  "Yoshi": "static/img/mk8/characters/yoshi.png",
  "Toad": "static/img/mk8/characters/toad.png",
  "Koopa Troopa": "static/img/mk8/characters/koopa_troopa.png",
  "Shy Guy": "static/img/mk8/characters/shy_guy.png",
  "Lakitu": "static/img/mk8/characters/lakitu.png",
  "Toadette": "static/img/mk8/characters/toadette.png",
  "King Boo": "static/img/mk8/characters/king_boo.png",
  "Petey Piranha": "static/img/mk8/characters/petey_piranha.png",
  "Baby Mario": "static/img/mk8/characters/baby_mario.png",
  "Baby Luigi": "static/img/mk8/characters/baby_luigi.png",
  "Baby Peach": "static/img/mk8/characters/baby_peach.png",
  "Baby Daisy": "static/img/mk8/characters/baby_daisy.png",
  "Baby Rosalina": "static/img/mk8/characters/baby_rosalina.png",
  "Metal Mario": "static/img/mk8/characters/metal_mario.png",
  "Pink Gold Peach": "static/img/mk8/characters/pink_gold_peach.png",
  "Wiggler": "static/img/mk8/characters/wiggler.png",
  "Wario": "static/img/mk8/characters/wario.png",
  "Waluigi": "static/img/mk8/characters/waluigi.png",
  "Donkey Kong": "static/img/mk8/characters/donkey_kong.png",
  "Bowser": "static/img/mk8/characters/bowser.png",
  "Dry Bones": "static/img/mk8/characters/dry_bones.png",
  "Bowser Jr.": "static/img/mk8/characters/bowser_jr.png",
  "Dry Bowser": "static/img/mk8/characters/dry_bowser.png",
  "Kamek": "static/img/mk8/characters/kamek.png",
  "Lemmy": "static/img/mk8/characters/lemmy.png",
  "Larry": "static/img/mk8/characters/larry.png",
  "Wendy": "static/img/mk8/characters/wendy.png",
  "Ludwig": "static/img/mk8/characters/ludwig.png",
  "Iggy": "static/img/mk8/characters/iggy.png",
  "Roy": "static/img/mk8/characters/roy.png",
  "Morton": "static/img/mk8/characters/morton.png",
  "Peachette": "static/img/mk8/characters/peachette.png",
  "Inkling": "static/img/mk8/characters/inkling_girl.png",
  "Inkling Girl": "static/img/mk8/characters/inkling_girl.png",
  "Villager": "static/img/mk8/characters/villager.png",
  "Isabelle": "static/img/mk8/characters/isabelle.png",
  "Link": "static/img/mk8/characters/link_champion_s_tunic.png",
  "Diddy Kong": "static/img/mk8/characters/diddy_kong.png",
  "Funky Kong": "static/img/mk8/characters/funky_kong.png",
  "Pauline": "static/img/mk8/characters/pauline.png",
  "Mii": "static/img/mk8/characters/mii.png",
  "Otro / Mii": "static/img/mk8/characters/mii.png"
};

// Official Mario Kart 8 Deluxe 24 Cups (96 Tracks) + Battle Stages Catalog with Local Icons
const MK8_CUPS_CATALOG = [
  { cup: "🍄 Copa Champiñón", icon: "static/img/mk8/cups/cup_01.png", tracks: ["Estadio Mario Kart", "Parque Acuático", "Barranco Goloso", "Ruinas Roca Picuda"], trackIcons: ["static/img/mk8/tracks/c01_t01_mario_kart_stadium.png", "static/img/mk8/tracks/c01_t02_water_park.png", "static/img/mk8/tracks/c01_t03_sweet_sweet_canyon.png", "static/img/mk8/tracks/c01_t04_thwomp_ruins.png"] },
  { cup: "🌸 Copa Flor", icon: "static/img/mk8/cups/cup_02.png", tracks: ["Circuito Mario", "Puerto Toad", "Mansión Retorcida", "Cataratas Shy Guy"], trackIcons: ["static/img/mk8/tracks/c02_t01_mario_circuit.png", "static/img/mk8/tracks/c02_t02_toad_harbor.png", "static/img/mk8/tracks/c02_t03_twisted_mansion.png", "static/img/mk8/tracks/c02_t04_shy_guy_falls.png"] },
  { cup: "⭐ Copa Estrella", icon: "static/img/mk8/cups/cup_03.png", tracks: ["Aeropuerto Soleado", "Cala Delfín", "Electródromo", "Cumbre Wario"], trackIcons: ["static/img/mk8/tracks/c03_t01_sunshine_airport.png", "static/img/mk8/tracks/c03_t02_dolphin_shoals.png", "static/img/mk8/tracks/c03_t03_electrodrome.png", "static/img/mk8/tracks/c03_t04_mount_wario.png"] },
  { cup: "👑 Copa Especial", icon: "static/img/mk8/cups/cup_04.png", tracks: ["Ruta Celeste", "Desierto Seco-Seco", "Castillo de Bowser", "Senda Arco Iris"], trackIcons: ["static/img/mk8/tracks/c04_t01_cloudtop_cruise.png", "static/img/mk8/tracks/c04_t02_bone_dry_dunes.png", "static/img/mk8/tracks/c04_t03_bowser_s_castle.png", "static/img/mk8/tracks/c04_t04_rainbow_road.png"] },
  { cup: "🐢 Copa Caparazón", icon: "static/img/mk8/cups/cup_05.png", tracks: ["Wii Pradera Mu-Mu", "GBA Circuito Mario", "DS Playa Cheep Cheep", "N64 Autopista de Toad"], trackIcons: ["static/img/mk8/tracks/c05_t01_wii_moo_moo_meadows.png", "static/img/mk8/tracks/c05_t02_gba_mario_circuit.png", "static/img/mk8/tracks/c05_t03_ds_cheep_cheep_beach.png", "static/img/mk8/tracks/c05_t04_n64_toad_s_turnpike.png"] },
  { cup: "🍌 Copa Plátano", icon: "static/img/mk8/cups/cup_06.png", tracks: ["GCN Desierto Seco-Seco", "SNES Prado Rosquilla 3", "N64 Pista Real", "3DS Jungla DK"], trackIcons: ["static/img/mk8/tracks/c06_t01_gcn_dry_dry_desert.png", "static/img/mk8/tracks/c06_t02_snes_donut_plains_3.png", "static/img/mk8/tracks/c06_t03_n64_royal_raceway.png", "static/img/mk8/tracks/c06_t04_3ds_dk_jungle.png"] },
  { cup: "🍂 Copa Hoja", icon: "static/img/mk8/cups/cup_07.png", tracks: ["DS Estadio Wario", "GCN Tierra Sorbete", "3DS Autopista Musical", "N64 Valle de Yoshi"], trackIcons: ["static/img/mk8/tracks/c07_t01_ds_wario_stadium.png", "static/img/mk8/tracks/c07_t02_gcn_sherbet_land.png", "static/img/mk8/tracks/c07_t03_3ds_music_park.png", "static/img/mk8/tracks/c07_t04_n64_yoshi_valley.png"] },
  { cup: "⚡ Copa Centella", icon: "static/img/mk8/cups/cup_08.png", tracks: ["DS Reloj Tictac", "3DS Tuberías Planta Piraña", "Wii Volcán Gruñón", "N64 Senda Arco Iris"], trackIcons: ["static/img/mk8/tracks/c08_t01_ds_tick_tock_clock.png", "static/img/mk8/tracks/c08_t02_3ds_piranha_plant_slide.png", "static/img/mk8/tracks/c08_t03_wii_grumble_volcano.png", "static/img/mk8/tracks/c08_t04_n64_rainbow_road.png"] },
  { cup: "🥚 Copa Huevo", icon: "static/img/mk8/cups/cup_09.png", tracks: ["GCN Circuito Yoshi", "Estadio Excitebike", "Ruta Dragón", "Mute City"], trackIcons: ["static/img/mk8/tracks/c09_t01_gcn_yoshi_circuit.png", "static/img/mk8/tracks/c09_t02_excitebike_arena.png", "static/img/mk8/tracks/c09_t03_dragon_driftway.png", "static/img/mk8/tracks/c09_t04_mute_city.png"] },
  { cup: "🗡️ Copa Trifuerza", icon: "static/img/mk8/cups/cup_10.png", tracks: ["Wii Mina de Wario", "SNES Senda Arco Iris", "Estación Glaciar", "Circuito de Hyrule"], trackIcons: ["static/img/mk8/tracks/c10_t01_wii_wario_s_gold_mine.png", "static/img/mk8/tracks/c10_t02_snes_rainbow_road.png", "static/img/mk8/tracks/c10_t03_ice_ice_outpost.png", "static/img/mk8/tracks/c10_t04_hyrule_circuit.png"] },
  { cup: "🍃 Copa Crossing", icon: "static/img/mk8/cups/cup_11.png", tracks: ["GCN Parque Bebé", "GBA Tierra de Queso", "Bosque Mágico", "Animal Crossing"], trackIcons: ["static/img/mk8/tracks/c11_t01_gcn_baby_park.png", "static/img/mk8/tracks/c11_t02_gba_cheese_land.png", "static/img/mk8/tracks/c11_t03_wild_woods.png", "static/img/mk8/tracks/c11_t04_animal_crossing.png"] },
  { cup: "🔔 Copa Campana", icon: "static/img/mk8/cups/cup_12.png", tracks: ["3DS Ciudad Koopa", "GBA Ruta del Lazo", "Metro Campana", "Big Blue"], trackIcons: ["static/img/mk8/tracks/c12_t01_3ds_neo_bowser_city.png", "static/img/mk8/tracks/c12_t02_gba_ribbon_road.png", "static/img/mk8/tracks/c12_t03_super_bell_subway.png", "static/img/mk8/tracks/c12_t04_big_blue.png"] },
  { cup: "🪙 Copa Turbo Dorada", icon: "static/img/mk8/cups/cup_13.png", tracks: ["Tour Bulevares de París", "3DS Circuito Toad", "N64 Monte Chocolate", "Wii Centro Cocotero"], trackIcons: ["static/img/mk8/tracks/c13_t01_tour_paris_promenade.png", "static/img/mk8/tracks/c13_t02_3ds_toad_circuit.png", "static/img/mk8/tracks/c13_t03_n64_choco_mountain.png", "static/img/mk8/tracks/c13_t04_wii_coconut_mall.png"] },
  { cup: "🐱 Copa Felina Fortuna", icon: "static/img/mk8/cups/cup_14.png", tracks: ["Tour Circuito de Tokio", "DS Colinas Champiñón", "GBA Jardín Celeste", "Mansión Ninja"], trackIcons: ["static/img/mk8/tracks/c14_t01_tour_tokyo_blur.png", "static/img/mk8/tracks/c14_t02_ds_shroom_ridge.png", "static/img/mk8/tracks/c14_t03_gba_sky_garden.png", "static/img/mk8/tracks/c14_t04_ninja_hideaway.png"] },
  { cup: "🥕 Copa Nabo", icon: "static/img/mk8/cups/cup_15.png", tracks: ["Tour Visita a Nueva York", "SNES Circuito Mario 3", "N64 Desierto Kalimari", "DS Pinball Waluigi"], trackIcons: ["static/img/mk8/tracks/c15_t01_tour_new_york_minute.png", "static/img/mk8/tracks/c15_t02_snes_mario_circuit_3.png", "static/img/mk8/tracks/c15_t03_n64_kalimari_desert.png", "static/img/mk8/tracks/c15_t04_ds_waluigi_pinball.png"] },
  { cup: "🚁 Copa Hélice", icon: "static/img/mk8/cups/cup_16.png", tracks: ["Tour Sídney sin Pausa", "GBA Tierra Nevada", "Wii Barranco Champiñón", "Cielos Helados"], trackIcons: ["static/img/mk8/tracks/c16_t01_tour_sydney_sprint.png", "static/img/mk8/tracks/c16_t02_gba_snow_land.png", "static/img/mk8/tracks/c16_t03_wii_mushroom_gorge.png", "static/img/mk8/tracks/c16_t04_sky_high_sundae.png"] },
  { cup: "🪨 Copa Roca", icon: "static/img/mk8/cups/cup_17.png", tracks: ["Tour Ronda por Londres", "GBA Lago de Boo", "3DS Montaña Roqui-Roque", "Wii Camino Forestal"], trackIcons: ["static/img/mk8/tracks/c17_t01_tour_london_loop.png", "static/img/mk8/tracks/c17_t02_gba_boo_lake.png", "static/img/mk8/tracks/c17_t03_3ds_rock_rock_mountain.png", "static/img/mk8/tracks/c17_t04_wii_maple_treeway.png"] },
  { cup: "🌙 Copa Luna", icon: "static/img/mk8/cups/cup_18.png", tracks: ["Tour Berlín de Vértigo", "DS Jardín de Peach", "Aldea de los Regalos", "3DS Senda Arco Iris"], trackIcons: ["static/img/mk8/tracks/c18_t01_tour_berlin_byways.png", "static/img/mk8/tracks/c18_t02_ds_peach_gardens.png", "static/img/mk8/tracks/c18_t03_merry_mountain.png", "static/img/mk8/tracks/c18_t04_3ds_rainbow_road.png"] },
  { cup: "🍎 Copa Fruta", icon: "static/img/mk8/cups/cup_19.png", tracks: ["Tour Derrapes en Ámsterdam", "GBA Parque de la Ribera", "Wii Cumbre DK", "Isla de Yoshi"], trackIcons: ["static/img/mk8/tracks/c19_t01_tour_amsterdam_drift.png", "static/img/mk8/tracks/c19_t02_gba_riverside_park.png", "static/img/mk8/tracks/c19_t03_wii_dk_summit.png", "static/img/mk8/tracks/c19_t04_yoshi_s_island.png"] },
  { cup: "🪃 Copa Bumerán", icon: "static/img/mk8/cups/cup_20.png", tracks: ["Tour Atardecer en Bangkok", "DS Circuito Mario", "GCN Estadio Waluigi", "Tour Acelerón en Singapur"], trackIcons: ["static/img/mk8/tracks/c20_t01_tour_bangkok_rush.png", "static/img/mk8/tracks/c20_t02_ds_mario_circuit.png", "static/img/mk8/tracks/c20_t03_gcn_waluigi_stadium.png", "static/img/mk8/tracks/c20_t04_tour_singapore_speedway.png"] },
  { cup: "🪶 Copa Pluma", icon: "static/img/mk8/cups/cup_21.png", tracks: ["Tour Periplo Ateniense", "GCN Crucero Daisy", "Wii Circuito Luz de Luna", "Bañódromo"], trackIcons: ["static/img/mk8/tracks/c21_t01_tour_athens_dash.png", "static/img/mk8/tracks/c21_t02_gcn_daisy_cruiser.png", "static/img/mk8/tracks/c21_t03_wii_moonview_highway.png", "static/img/mk8/tracks/c21_t04_squeaky_clean_sprint.png"] },
  { cup: "🍒 Copa Cereza", icon: "static/img/mk8/cups/cup_22.png", tracks: ["Tour A Todo Gas en Los Ángeles", "GBA Reserva Natural del Poniente", "Wii Colina de Koopa", "Tour Vuelta por Vancouver"], trackIcons: ["static/img/mk8/tracks/c22_t01_tour_los_angeles_laps.png", "static/img/mk8/tracks/c22_t02_gba_sunset_wilds.png", "static/img/mk8/tracks/c22_t03_wii_koopa_cape.png", "static/img/mk8/tracks/c22_t04_tour_vancouver_velocity.png"] },
  { cup: "🌰 Copa Bellota", icon: "static/img/mk8/cups/cup_23.png", tracks: ["Tour Roma Bajo la Luna", "GCN Montaña DK", "Wii Circuito de Daisy", "Ruinas Planta Piraña"], trackIcons: ["static/img/mk8/tracks/c23_t01_tour_rome_avanti.png", "static/img/mk8/tracks/c23_t02_gcn_dk_mountain.png", "static/img/mk8/tracks/c23_t03_wii_daisy_circuit.png", "static/img/mk8/tracks/c23_t04_piranha_plant_cove.png"] },
  { cup: "💙 Copa Picos", icon: "static/img/mk8/cups/cup_24.png", tracks: ["Tour Paseo por Madrid", "3DS Glaciar de Rosalina", "SNES Castillo de Bowser 3", "Wii Senda Arco Iris"], trackIcons: ["static/img/mk8/tracks/c24_t01_tour_madrid_drive.png", "static/img/mk8/tracks/c24_t02_3ds_rosalina_s_ice_world.png", "static/img/mk8/tracks/c24_t03_snes_bowser_castle_3.png", "static/img/mk8/tracks/c24_t04_wii_rainbow_road.png"] },
  { cup: "🎈 Escenarios Batalla", icon: "static/img/mk8/cups/cup_01.png", tracks: ["Estadio de Batalla", "Cielo Azucarado", "Palacio Dragón", "Estación Lunar", "3DS Wuhu Pueblo", "GCN Mansión de Luigi", "SNES Circuito de Batalla 1", "Parque Viaducto"], trackIcons: ["static/img/mk8/tracks/c25_t01_battle_stadium.png", "static/img/mk8/tracks/c25_t02_sweet_sweet_kingdom.png", "static/img/mk8/tracks/c25_t03_dragon_palace.png", "static/img/mk8/tracks/c25_t04_lunar_colony.png", "static/img/mk8/tracks/c25_t05_3ds_wuhu_town.png", "static/img/mk8/tracks/c25_t06_gcn_luigi_s_mansion.png", "static/img/mk8/tracks/c25_t07_snes_battle_course_1.png", "static/img/mk8/tracks/c25_t08_urchin_underpass.png"] }
];

function getCharacterIconUrl(charName) {
  if (!charName) return '';
  if (MK8_CHARACTER_ICONS[charName]) return getApiUrl(MK8_CHARACTER_ICONS[charName]);
  const foundKey = Object.keys(MK8_CHARACTER_ICONS).find(k => k.toLowerCase() === String(charName).toLowerCase());
  return foundKey ? getApiUrl(MK8_CHARACTER_ICONS[foundKey]) : '';
}

function getCupIconUrl(cupName) {
  if (!cupName) return '';
  const found = MK8_CUPS_CATALOG.find(c => c.cup === cupName || c.cup.toLowerCase().includes(String(cupName).toLowerCase()));
  return (found && found.icon) ? getApiUrl(found.icon) : '';
}

function getTrackIconUrl(trackName) {
  if (!trackName) return '';
  for (const c of MK8_CUPS_CATALOG) {
    const idx = c.tracks.findIndex(t => t === trackName || t.toLowerCase() === String(trackName).toLowerCase());
    if (idx >= 0 && c.trackIcons && c.trackIcons[idx]) {
      return getApiUrl(c.trackIcons[idx]);
    }
  }
  return '';
}

function renderCharacterBadgeHtml(charName) {
  if (!charName) return '';
  const icon = getCharacterIconUrl(charName);
  if (icon) {
    return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs font-semibold">
      <img src="${icon}" alt="${charName}" class="w-5 h-5 object-contain">
      <span>${charName}</span>
    </span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-xs">${charName}</span>`;
}

async function openChangelogModal() {
  openModal('modal-changelog');
  const bodyEl = document.getElementById('changelog-modal-body');
  if (!bodyEl) return;
  try {
    const res = await fetch(getApiUrl('/api/changelog'));
    if (!res.ok) throw new Error('Error loading changelog');
    const data = await res.json();
    const lines = (data.changelog || '').split('\n');
    const htmlLines = lines.map(line => {
      if (line.startsWith('## ')) {
        return `<h4 class="text-sm sm:text-base font-black text-indigo-400 pt-3 border-t border-slate-800 first:border-0 first:pt-0">${line.replace('## ', '🚀 ')}</h4>`;
      }
      if (line.startsWith('### ')) {
        return `<div class="text-xs font-bold uppercase tracking-wider text-amber-400 mt-2">${line.replace('### ', '')}</div>`;
      }
      if (line.startsWith('# ')) {
        return '';
      }
      if (line.trim() === '---') {
        return '';
      }
      if (line.trim().startsWith('- ')) {
        const clean = line.trim().substring(2).replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>').replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-slate-800 text-indigo-300 text-[11px]">$1</code>');
        const indent = line.startsWith('  ') ? 'ml-4 text-slate-400' : 'text-slate-200';
        return `<div class="flex items-start gap-2 ${indent}"><span class="text-indigo-400">•</span><span>${clean}</span></div>`;
      }
      return line.trim() ? `<p class="text-slate-400 text-xs">${line}</p>` : '';
    }).join('');
    bodyEl.innerHTML = htmlLines;
  } catch (err) {
    bodyEl.innerHTML = `<div class="text-rose-400 text-xs">No se pudo cargar el registro de cambios.</div>`;
  }
}

let captureState = {
  totalRaces: 4,
  currentRaceIdx: 0,
  matchType: "",
  ruleValues: {},
  isPractice: false,
  notes: "",
  playerMetrics: {},
  isAutoCup: false,
  selectedCupTab: "🍄 Copa Champiñón",
  showTrackPicker: true,
  searchQuery: "",
  races: []
};

function isMarioKartGame(game) {
  if (!game) return false;
  const id = (game.id || '').toLowerCase();
  const name = (game.name || '').toLowerCase();
  return id.includes('mario_kart') || id.includes('mariokart') || name.includes('mario kart');
}

function getPointsForPosition(position) {
  const pos = parseInt(position, 10);
  if (!pos || pos < 1) return 0;
  if (currentGameDefaultPoints && currentGameDefaultPoints[pos - 1] !== undefined) {
    return Number(currentGameDefaultPoints[pos - 1]);
  }
  const mkFallback = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  return mkFallback[pos - 1] !== undefined ? mkFallback[pos - 1] : 1;
}

function showMatchModalStep(stepName) {
  const sConfig = document.getElementById('match-step-config');
  const sCapture = document.getElementById('match-step-capture');
  const sFinished = document.getElementById('match-step-finished');
  if (sConfig) sConfig.classList.toggle('hidden', stepName !== 'config');
  if (sCapture) sCapture.classList.toggle('hidden', stepName !== 'capture');
  if (sFinished) sFinished.classList.toggle('hidden', stepName !== 'finished');
}

function toggleManualScoreTable(forceState = null) {
  if (forceState !== null) {
    showManualScoresInConfig = Boolean(forceState);
  } else {
    showManualScoresInConfig = !showManualScoresInConfig;
  }
  const cols = document.querySelectorAll('.manual-score-col');
  cols.forEach(c => c.classList.toggle('hidden', !showManualScoresInConfig));
  const btn = document.getElementById('btn-toggle-manual-scores');
  if (btn) {
    btn.textContent = showManualScoresInConfig
      ? 'Ocultar Puntaje Manual (Usar Modo Captura)'
      : 'Mostrar / Editar Puntaje Final Directo';
  }
}

function autoRankMarioKartScores() {
  if (!isMarioKartGame(currentMatchGame)) return;

  const playerScores = [];
  currentSelectedPlayerIds.forEach(playerId => {
    const scoreInp = document.querySelector(`[name="score_${playerId}"]`);
    const scoreVal = scoreInp ? parseFloat(scoreInp.value) : 0;
    playerScores.push({
      playerId,
      score: isNaN(scoreVal) ? 0 : scoreVal
    });
  });

  playerScores.sort((a, b) => b.score - a.score);

  playerScores.forEach((item, idx) => {
    const rankInp = document.querySelector(`[name="rank_${item.playerId}"]`);
    if (rankInp) {
      rankInp.value = idx + 1;
    }
  });
}

function toggleMatchPlayer(playerId, isChecked) {
  if (isChecked) {
    currentSelectedPlayerIds.add(playerId);
  } else {
    currentSelectedPlayerIds.delete(playerId);
  }
  updateMatchParticipantsUI();
}

function toggleAllMatchParticipants(selectAll) {
  if (!currentRecordingSession) return;
  if (selectAll) {
    currentRecordingSession.players.forEach(p => currentSelectedPlayerIds.add(p.id));
  } else {
    currentSelectedPlayerIds.clear();
  }
  const checkboxes = document.querySelectorAll('input[name="match_participant_check"]');
  checkboxes.forEach(cb => { cb.checked = selectAll; });
  updateMatchParticipantsUI();
}

function updateMatchParticipantsUI(existingScoresMap = null) {
  if (!currentRecordingSession) return;

  // Preserve current character selection before re-rendering
  const preservedMetrics = {};
  currentRecordingSession.players.forEach(p => {
    const mEl = document.querySelector(`[name="metric_${p.id}"]`);
    if (mEl && mEl.value) preservedMetrics[p.id] = mEl.value;
  });

  const countBadge = document.getElementById('match-participants-count');
  if (countBadge) {
    const total = currentRecordingSession.players.length;
    const selected = currentSelectedPlayerIds.size;
    countBadge.textContent = `${selected} de ${total} jugadores`;
  }

  const scoresBody = document.getElementById('match-players-scores-body');
  if (!scoresBody) return;

  const isMK = isMarioKartGame(currentMatchGame);

  const autoRankBanner = document.getElementById('mk-auto-rank-banner');
  if (autoRankBanner) {
    autoRankBanner.classList.toggle('hidden', !isMK || !showManualScoresInConfig);
  }

  const selectedPlayers = currentRecordingSession.players.filter(p => currentSelectedPlayerIds.has(p.id));

  if (selectedPlayers.length === 0) {
    scoresBody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-amber-400 font-medium text-xs">⚠️ Selecciona arriba los jugadores que participan en esta partida.</td></tr>`;
    return;
  }

  const hiddenClass = showManualScoresInConfig ? '' : 'hidden';

  // Auto-detect last used character per player in this session for instant default selection
  const lastCharacterByPlayer = {};
  if (currentRecordingSession && Array.isArray(currentRecordingSession.matches)) {
    currentRecordingSession.matches.forEach(m => {
      (m.scores || []).forEach(sc => {
        if (sc.metrics && sc.metrics.character) {
          lastCharacterByPlayer[sc.player_id] = sc.metrics.character;
        }
      });
    });
  }

  scoresBody.innerHTML = selectedPlayers.map((p, idx) => {
    let rankVal = idx + 1;
    let scoreVal = currentGameDefaultPoints[idx] !== undefined ? currentGameDefaultPoints[idx] : 0;
    let metricVal = preservedMetrics[p.id] || lastCharacterByPlayer[p.id] || '';

    if (existingScoresMap && existingScoresMap[p.id]) {
      rankVal = existingScoresMap[p.id].rank_position;
      scoreVal = existingScoresMap[p.id].score;
      metricVal = existingScoresMap[p.id].metrics?.character || existingScoresMap[p.id].metrics?.kart || metricVal;
    }

    let metricInput = `<input type="text" name="metric_${p.id}" value="${metricVal}" placeholder="ej. Mario / Yoshi" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white">`;

    if (currentGameMetricsDef && currentGameMetricsDef.type === 'select' && currentGameMetricsDef.options) {
      const defaultFallbackChar = currentGameMetricsDef.options[idx % currentGameMetricsDef.options.length] || currentGameMetricsDef.options[0];
      const activeCharVal = metricVal || defaultFallbackChar;
      const charIconUrl = getCharacterIconUrl(activeCharVal);

      metricInput = `
        <div>
          <input type="hidden" name="metric_${p.id}" value="${activeCharVal}">
          <button type="button" onclick="openCharacterSelectorModal(${p.id})" class="w-full sm:w-auto min-w-[180px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/50 flex items-center justify-between gap-2.5 transition cursor-pointer group">
            <div class="flex items-center gap-2 min-w-0">
              <img id="char-preview-img-${p.id}" src="${charIconUrl || ''}" alt="${activeCharVal}" class="w-7 h-7 object-contain flex-shrink-0 ${charIconUrl ? '' : 'hidden'}">
              <span id="char-preview-label-${p.id}" class="text-xs font-black text-white group-hover:text-indigo-200 truncate">${activeCharVal}</span>
            </div>
            <span class="text-[10px] font-bold text-indigo-400 group-hover:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20 whitespace-nowrap">🎭 Cambiar</span>
          </button>
        </div>
      `;
    }

    const rankInputHtml = isMK
      ? `<input type="number" name="rank_${p.id}" value="${rankVal}" readonly class="w-full text-center bg-slate-900/90 border border-indigo-500/30 rounded-lg px-2 py-1 text-xs text-indigo-300 font-black cursor-default select-none focus:outline-none">`
      : `<input type="number" name="rank_${p.id}" value="${rankVal}" min="1" max="100" class="w-full text-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold">`;

    const scoreInputHtml = isMK
      ? `<input type="number" name="score_${p.id}" value="${scoreVal}" step="any" oninput="autoRankMarioKartScores()" class="w-full text-center bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-2 py-1 text-xs text-amber-400 font-black">`
      : `<input type="number" name="score_${p.id}" value="${scoreVal}" step="any" class="w-full text-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-black">`;

    return `
      <tr class="hover:bg-slate-800/20">
        <td class="py-2.5 px-3">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${p.color_hex}"></span>
            <span class="font-bold text-white text-xs sm:text-sm">${p.nickname || p.name}</span>
          </div>
        </td>
        <td class="py-2.5 px-2 manual-score-col ${hiddenClass}">
          ${rankInputHtml}
        </td>
        <td class="py-2.5 px-2 manual-score-col ${hiddenClass}">
          ${scoreInputHtml}
        </td>
        <td class="py-2 px-2.5">
          ${metricInput}
        </td>
      </tr>
    `;
  }).join('');

  if (isMK && showManualScoresInConfig) {
    autoRankMarioKartScores();
  }
}

let activeCharModalPlayerId = null;

function openCharacterSelectorModal(playerId) {
  activeCharModalPlayerId = playerId;
  const player = (currentRecordingSession?.players || []).find(p => p.id === playerId);
  const hiddenInp = document.querySelector(`[name="metric_${playerId}"]`);
  const curChar = hiddenInp ? hiddenInp.value : '';

  const titleEl = document.getElementById('char-selector-modal-title');
  const subEl = document.getElementById('char-selector-modal-subtitle');
  if (titleEl && player) {
    titleEl.textContent = `Personaje de ${player.nickname || player.name}`;
  }
  if (subEl) {
    subEl.textContent = 'Toca cualquier icono para seleccionarlo al instante.';
  }

  const gridEl = document.getElementById('char-selector-modal-grid');
  if (gridEl && currentGameMetricsDef && currentGameMetricsDef.options) {
    gridEl.innerHTML = currentGameMetricsDef.options.map(o => {
      const ic = getCharacterIconUrl(o);
      const isSelected = o === curChar;
      const btnCls = isSelected
        ? 'bg-indigo-600/35 border-amber-400 ring-2 ring-amber-400/70 text-white font-black shadow-lg scale-105'
        : 'bg-slate-950/90 hover:bg-slate-800 border-slate-800 text-slate-200 hover:border-indigo-500/50';
      return `
        <button type="button" onclick="pickPlayerCharacterFromIcon(${playerId}, '${o.replace(/'/g, "\\'")}')" class="p-2 rounded-2xl border flex flex-col items-center justify-center gap-1 transition cursor-pointer ${btnCls}">
          ${ic ? `<img src="${ic}" alt="${o}" class="w-10 h-10 object-contain pointer-events-none">` : `<span class="text-xl">🏎️</span>`}
          <span class="text-[10px] leading-tight truncate w-full text-center pointer-events-none">${o}</span>
        </button>
      `;
    }).join('');
  }

  openModal('modal-character-selector');
}

function onPlayerCharacterSelectChange(playerId, newCharName) {
  const img = document.getElementById(`char-preview-img-${playerId}`);
  const lbl = document.getElementById(`char-preview-label-${playerId}`);
  const url = getCharacterIconUrl(newCharName);
  if (lbl) lbl.textContent = newCharName;
  if (img) {
    if (url) {
      img.src = url;
      img.alt = newCharName;
      img.classList.remove('hidden');
    } else {
      img.classList.add('hidden');
    }
  }
}

function pickPlayerCharacterFromIcon(playerId, charName) {
  const hiddenInp = document.querySelector(`[name="metric_${playerId}"]`);
  if (hiddenInp) {
    hiddenInp.value = charName;
  }
  onPlayerCharacterSelectChange(playerId, charName);
  closeModal('modal-character-selector');
}

function collectCurrentRuleValuesFromDOM() {
  const ruleInputs = document.querySelectorAll('[name^="rule_"]');
  ruleInputs.forEach(inp => {
    const key = inp.name.replace('rule_', '');
    currentRuleDraftValues[key] = inp.value;
  });
}

function onMatchTypeChange() {
  collectCurrentRuleValuesFromDOM();
  const matchTypeSelect = document.getElementById('match-type-select');
  const selectedMatchType = matchTypeSelect ? matchTypeSelect.value : '';

  // Smart defaults when switching match types in Mario Kart
  if (selectedMatchType.includes('Grand Prix')) {
    currentRuleDraftValues['pistas'] = 'Copa Definida';
    currentRuleDraftValues['carreras'] = '4 carreras';
  } else if (selectedMatchType.includes('Individual')) {
    currentRuleDraftValues['carreras'] = '1 carrera';
    if (currentRuleDraftValues['pistas'] === 'Copa Definida') {
      currentRuleDraftValues['pistas'] = 'Aleatorio';
    }
  } else if (selectedMatchType.includes('Patrulla Piraña')) {
    currentRuleDraftValues['equipos'] = 'Por equipos';
  }

  renderDynamicGameRules();
}

function onDynamicRuleChange(inputName, newValue) {
  const key = inputName.replace('rule_', '');
  currentRuleDraftValues[key] = newValue;

  if (key === 'pistas') {
    if (newValue === 'Copa Definida') {
      currentRuleDraftValues['carreras'] = '4 carreras';
    }
    renderDynamicGameRules();
  }
}

function renderDynamicGameRules(overrideValues = null) {
  if (overrideValues) {
    currentRuleDraftValues = { ...currentRuleDraftValues, ...overrideValues };
  } else {
    collectCurrentRuleValuesFromDOM();
  }

  const rulesGrid = document.getElementById('match-dynamic-rules-grid');
  const rulesSection = document.getElementById('match-game-rules-section');
  const badgeEl = document.getElementById('match-rules-mode-badge');
  const matchTypeSelect = document.getElementById('match-type-select');
  const selectedMatchType = matchTypeSelect ? matchTypeSelect.value : '';

  if (!currentMatchGame || !currentMatchGame.rule_settings || currentMatchGame.rule_settings.length === 0) {
    if (rulesSection) rulesSection.classList.add('hidden');
    if (rulesGrid) rulesGrid.innerHTML = '';
    return;
  }

  // Update informative mode badge
  if (badgeEl) {
    if (selectedMatchType.includes('Grand Prix')) {
      badgeEl.textContent = '🏆 Copa Definida (4 Carreras Automáticas)';
    } else if (selectedMatchType.includes('Individual')) {
      badgeEl.textContent = '🏎️ Carrera Única (1 Carrera)';
    } else if (selectedMatchType.includes('Batalla') || selectedMatchType.includes('Patrulla')) {
      badgeEl.textContent = '🎈 Modo Batalla por Rondas';
    } else {
      badgeEl.textContent = `🎛️ Parámetros: ${selectedMatchType}`;
    }
  }

  // Filter rules applicable to selectedMatchType and depends_on conditions
  const visibleRules = currentMatchGame.rule_settings.filter(r => {
    if (Array.isArray(r.match_types) && r.match_types.length > 0) {
      if (!r.match_types.includes(selectedMatchType)) {
        return false;
      }
    }
    if (r.depends_on) {
      const alwaysFor = r.depends_on.always_for_match_types || [];
      if (alwaysFor.includes(selectedMatchType)) {
        return true;
      }
      const depField = r.depends_on.field;
      const depRuleDef = currentMatchGame.rule_settings.find(x => x.id === depField);
      const currentDepVal = currentRuleDraftValues[depField] !== undefined
        ? currentRuleDraftValues[depField]
        : (depRuleDef ? depRuleDef.default : '');
      const allowedVals = r.depends_on.values || [];
      if (!allowedVals.includes(currentDepVal)) {
        return false;
      }
    }
    // Hide 'carreras' selector if 'pistas' is 'Copa Definida' (since a Cup is always 4 races)
    if (r.id === 'carreras' && currentRuleDraftValues['pistas'] === 'Copa Definida') {
      return false;
    }
    return true;
  });

  if (visibleRules.length === 0) {
    rulesSection.classList.add('hidden');
    rulesGrid.innerHTML = '';
    return;
  }

  rulesSection.classList.remove('hidden');
  rulesGrid.innerHTML = visibleRules.map(r => {
    const curVal = currentRuleDraftValues[r.id] !== undefined ? currentRuleDraftValues[r.id] : (r.default || '');
    currentRuleDraftValues[r.id] = curVal;

    if (r.type === 'string' || !Array.isArray(r.options)) {
      return `
        <div>
          <label class="block text-slate-400 font-semibold mb-1">${r.name}</label>
          <input type="text" name="rule_${r.id}" value="${curVal}" oninput="onDynamicRuleChange(this.name, this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-indigo-500">
        </div>
      `;
    }

    if (r.id === 'copa') {
      const cIcon = getCupIconUrl(curVal);
      return `
        <div>
          <label class="block text-slate-400 font-semibold mb-1">${r.name}</label>
          <input type="hidden" name="rule_${r.id}" value="${curVal}">
          <button type="button" onclick="openTrackSelectorModal('config_cup')" class="w-full bg-slate-900 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/50 rounded-lg px-2.5 py-1.5 text-xs text-white flex items-center justify-between gap-2 transition cursor-pointer">
            <div class="flex items-center gap-2 truncate">
              ${cIcon ? `<img src="${cIcon}" class="w-5 h-5 object-contain flex-shrink-0">` : ''}
              <span class="font-bold truncate">${curVal}</span>
            </div>
            <span class="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 whitespace-nowrap">🗺️ Ver Copas</span>
          </button>
        </div>
      `;
    }

    const optionsHtml = (r.options || []).map(opt => `
      <option value="${opt}" ${opt === curVal ? 'selected' : ''}>${opt}</option>
    `).join('');

    return `
      <div>
        <label class="block text-slate-400 font-semibold mb-1">${r.name}</label>
        <select name="rule_${r.id}" onchange="onDynamicRuleChange(this.name, this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-indigo-500">
          ${optionsHtml}
        </select>
      </div>
    `;
  }).join('');
}

async function prepareMatchModalBase(session, initialMatchType = null, initialRules = null) {
  currentRecordingSession = session;

  const gameRes = await fetch(getApiUrl(`/api/games/${session.game_id}`));
  const game = await gameRes.json();
  currentMatchGame = game;

  currentGameDefaultPoints = game.default_points_system || [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  currentGameMetricsDef = (game.player_metrics || []).find(m => m.id === 'character') || game.player_metrics?.[0];

  const extraTh = document.getElementById('match-extra-metric-th');
  if (extraTh) extraTh.textContent = currentGameMetricsDef ? currentGameMetricsDef.name : 'Detalle';

  // Reset rule drafts to game defaults
  currentRuleDraftValues = {};
  (game.rule_settings || []).forEach(r => {
    if (r.default !== undefined) currentRuleDraftValues[r.id] = r.default;
  });
  if (initialRules) {
    currentRuleDraftValues = { ...currentRuleDraftValues, ...initialRules };
  }

  // Match types dropdown
  const matchTypeSelect = document.getElementById('match-type-select');
  matchTypeSelect.innerHTML = (game.match_types || ['Partida Regular']).map(mt => `<option value="${mt}">${mt}</option>`).join('');
  if (initialMatchType && (game.match_types || []).includes(initialMatchType)) {
    matchTypeSelect.value = initialMatchType;
  }

  renderDynamicGameRules(initialRules);
  showMatchModalStep('config');

  return game;
}

async function openRecordMatchModal(sessionId) {
  try {
    const res = await fetch(getApiUrl(`/api/sessions/${sessionId}`));
    if (!res.ok) return;
    const session = await res.json();

    currentEditingMatchId = null;
    const game = await prepareMatchModalBase(session);

    document.getElementById('match-modal-title').innerHTML = `<span>🏁</span> Registrar Partida #${session.matches.length + 1}`;
    document.getElementById('match-modal-subtitle').textContent = `Juego: ${game.name} · ${session.title}`;
    document.getElementById('btn-save-match').textContent = '💾 Guardar Puntaje Manual';

    // Hide manual score columns by default to highlight Capture Mode
    toggleManualScoreTable(false);

    // Select all session players by default
    currentSelectedPlayerIds = new Set(session.players.map(p => p.id));

    const selectorGrid = document.getElementById('match-participants-selector-grid');
    if (selectorGrid) {
      selectorGrid.innerHTML = session.players.map(p => `
        <label class="flex items-center gap-1.5 p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition">
          <input type="checkbox" name="match_participant_check" value="${p.id}" checked onchange="toggleMatchPlayer(${p.id}, this.checked)" class="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0">
          <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${p.color_hex}"></span>
          <span class="text-xs text-white font-medium truncate">${p.nickname || p.name}</span>
        </label>
      `).join('');
    }

    document.getElementById('match-is-practice').checked = false;
    document.getElementById('match-notes').value = '';

    updateMatchParticipantsUI();
    openModal('modal-match');
  } catch (err) {
    console.error('Error opening match modal:', err);
  }
}

async function openEditMatchModal(matchId) {
  if (!currentRecordingSession) return;
  const match = currentRecordingSession.matches.find(m => m.id === matchId);
  if (!match) return;

  try {
    currentEditingMatchId = matchId;
    await prepareMatchModalBase(currentRecordingSession, match.match_type, match.rule_values || {});

    document.getElementById('match-modal-title').innerHTML = `<span>✏️</span> Editar Partida #${match.match_number}`;
    document.getElementById('match-modal-subtitle').textContent = `Modificando resultados de Partida #${match.match_number} (${match.match_type})`;
    document.getElementById('btn-save-match').textContent = '💾 Actualizar Puntaje Manual';

    // Show manual score columns when editing so they can edit either manually or via Capture Mode
    toggleManualScoreTable(true);

    document.getElementById('match-is-practice').checked = Boolean(match.is_practice);
    document.getElementById('match-notes').value = match.notes || '';

    const matchPlayerIds = new Set(match.scores.map(s => s.player_id));
    currentSelectedPlayerIds = matchPlayerIds;

    const selectorGrid = document.getElementById('match-participants-selector-grid');
    if (selectorGrid) {
      selectorGrid.innerHTML = currentRecordingSession.players.map(p => {
        const checked = matchPlayerIds.has(p.id) ? 'checked' : '';
        return `
          <label class="flex items-center gap-1.5 p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition">
            <input type="checkbox" name="match_participant_check" value="${p.id}" ${checked} onchange="toggleMatchPlayer(${p.id}, this.checked)" class="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0">
            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${p.color_hex}"></span>
            <span class="text-xs text-white font-medium truncate">${p.nickname || p.name}</span>
          </label>
        `;
      }).join('');
    }

    const existingScoresMap = {};
    match.scores.forEach(sc => { existingScoresMap[sc.player_id] = sc; });

    updateMatchParticipantsUI(existingScoresMap);
    openModal('modal-match');
  } catch (err) {
    console.error('Error opening edit match modal:', err);
  }
}

// -----------------------------------------------------------------------------
// MODO CAPTURA RÁPIDA (CARRERA POR CARRERA)
// -----------------------------------------------------------------------------
function computeAutoTracksForConfig(matchType, ruleValues, totalRaces) {
  const mtLower = (matchType || '').toLowerCase();
  const isBattle = mtLower.includes('batalla') || mtLower.includes('patrulla');
  const pistasMode = ruleValues.pistas || (mtLower.includes('grand prix') ? 'Copa Definida' : 'Aleatorio');
  const chosenCupName = ruleValues.copa || '🍄 Copa Champiñón';

  if (isBattle) {
    if (ruleValues.escenarios === 'En orden') {
      const battleCup = MK8_CUPS_CATALOG.find(c => c.cup.includes('Batalla')) || MK8_CUPS_CATALOG[MK8_CUPS_CATALOG.length - 1];
      const tracks = [];
      for (let i = 0; i < totalRaces; i++) {
        tracks.push({
          cup_name: battleCup.cup,
          track_name: battleCup.tracks[i % battleCup.tracks.length],
          auto: true
        });
      }
      return tracks;
    }
    return [];
  }

  if (mtLower.includes('grand prix') || pistasMode === 'Copa Definida') {
    const cupObj = MK8_CUPS_CATALOG.find(c => c.cup === chosenCupName) || MK8_CUPS_CATALOG[0];
    return cupObj.tracks.slice(0, totalRaces).map(t => ({
      cup_name: cupObj.cup,
      track_name: t,
      auto: true
    }));
  }

  if (pistasMode === 'En orden') {
    const raceCups = MK8_CUPS_CATALOG.filter(c => !c.cup.includes('Batalla'));
    let startCupIdx = raceCups.findIndex(c => c.cup === chosenCupName);
    if (startCupIdx < 0) startCupIdx = 0;

    const orderedAll = [];
    for (let cOffset = 0; cOffset < raceCups.length; cOffset++) {
      const cupObj = raceCups[(startCupIdx + cOffset) % raceCups.length];
      cupObj.tracks.forEach(t => {
        orderedAll.push({ cup_name: cupObj.cup, track_name: t, auto: true });
      });
    }
    const result = [];
    for (let i = 0; i < totalRaces; i++) {
      result.push(orderedAll[i % orderedAll.length]);
    }
    return result;
  }

  return [];
}

function startCaptureMode() {
  if (!currentRecordingSession) return;
  if (currentSelectedPlayerIds.size === 0) {
    showToast('Selecciona al menos un jugador participante antes de iniciar la captura', 'error');
    return;
  }

  collectCurrentRuleValuesFromDOM();
  const matchType = document.getElementById('match-type-select').value;
  const isPractice = document.getElementById('match-is-practice').checked;
  const notes = document.getElementById('match-notes').value;

  const ruleValues = {};
  const ruleInputs = document.querySelectorAll('[name^="rule_"]');
  ruleInputs.forEach(inp => {
    const key = inp.name.replace('rule_', '');
    ruleValues[key] = inp.value;
  });

  // Collect selected player metrics (character / kart)
  const playerMetrics = {};
  currentSelectedPlayerIds.forEach(pid => {
    const metricInp = document.querySelector(`[name="metric_${pid}"]`);
    if (metricInp && metricInp.value) {
      playerMetrics[pid] = { character: metricInp.value };
    } else {
      playerMetrics[pid] = {};
    }
  });

  // Determine number of races
  let totalRaces = 4;
  const mtLower = matchType.toLowerCase();
  if (mtLower.includes('individual')) {
    totalRaces = 1;
  } else if (mtLower.includes('grand prix') || ruleValues.pistas === 'Copa Definida') {
    totalRaces = 4;
  } else {
    const rawCarreras = ruleValues.carreras || ruleValues.rondas_batalla || '4 carreras';
    const m = String(rawCarreras).match(/\d+/);
    totalRaces = m ? parseInt(m[0], 10) : 4;
  }

  const autoTracks = computeAutoTracksForConfig(matchType, ruleValues, totalRaces);
  const isAutoCup = autoTracks.length > 0;

  // Check if editing a match that already has recorded races
  let existingRaces = [];
  if (currentEditingMatchId && currentRecordingSession) {
    const existingMatch = currentRecordingSession.matches.find(m => m.id === currentEditingMatchId);
    if (existingMatch && Array.isArray(existingMatch.races) && existingMatch.races.length > 0) {
      existingRaces = existingMatch.races;
    }
  }

  const races = [];
  for (let i = 0; i < totalRaces; i++) {
    const ex = existingRaces[i];
    const autoT = autoTracks[i];
    const positions = {};
    if (ex && Array.isArray(ex.scores)) {
      ex.scores.forEach(rs => {
        positions[rs.player_id] = rs.position;
      });
    }
    races.push({
      race_number: i + 1,
      cup_name: ex ? (ex.cup_name || '') : (autoT ? autoT.cup_name : ''),
      track_name: ex ? (ex.track_name || '') : (autoT ? autoT.track_name : ''),
      class_mode: ruleValues.clase || '150cc',
      positions
    });
  }

  const initialCup = (autoTracks[0] && autoTracks[0].cup_name) || ruleValues.copa || MK8_CUPS_CATALOG[0].cup;

  captureState = {
    totalRaces,
    currentRaceIdx: 0,
    matchType,
    ruleValues,
    isPractice,
    notes,
    playerMetrics,
    isAutoCup,
    selectedCupTab: initialCup,
    showTrackPicker: !isAutoCup,
    searchQuery: '',
    races
  };

  showMatchModalStep('capture');
  renderCaptureRaceStep();
}

function returnToMatchConfig() {
  showMatchModalStep('config');
}

function isRaceCompleted(raceObj) {
  if (!raceObj) return false;
  for (const pid of currentSelectedPlayerIds) {
    if (!raceObj.positions[pid]) return false;
  }
  return currentSelectedPlayerIds.size > 0;
}

function jumpToCaptureRace(idx) {
  if (idx < 0 || idx >= captureState.totalRaces) return;
  captureState.currentRaceIdx = idx;
  captureState.showTrackPicker = !captureState.isAutoCup && !captureState.races[idx].track_name;
  renderCaptureRaceStep();
}

let trackSelectorModalMode = 'race'; // 'race' | 'config_cup'

function openTrackSelectorModal(mode = 'race') {
  trackSelectorModalMode = mode;
  const searchInp = document.getElementById('track-selector-search-input');
  if (searchInp) searchInp.value = '';

  const titleEl = document.getElementById('track-selector-modal-title');
  const subEl = document.getElementById('track-selector-modal-subtitle');
  if (mode === 'config_cup') {
    if (titleEl) titleEl.textContent = 'Seleccionar Copa (Catálogo Visual de Copas y Pistas)';
    if (subEl) subEl.textContent = 'Toca cualquier copa o cualquiera de sus 4 pistas para seleccionar toda la copa.';
  } else {
    const rNum = (captureState.currentRaceIdx || 0) + 1;
    if (titleEl) titleEl.textContent = `Seleccionar Pista para la Carrera #${rNum}`;
    if (subEl) subEl.textContent = 'Todas las 96 pistas agrupadas por copa. Toca una pista para elegirla, o carga las 4 pistas de una copa.';
  }

  renderFullTrackSelectorBody('');
  openModal('modal-track-selector');
}

function scrollToCupInSelector(cupAnchorId) {
  const el = document.getElementById(cupAnchorId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderFullTrackSelectorBody(filterQuery = '') {
  const q = (filterQuery || '').trim().toLowerCase();
  const jumpStrip = document.getElementById('track-selector-cup-jump-strip');
  const bodyEl = document.getElementById('track-selector-all-cups-body');
  if (!bodyEl) return;

  const curRace = captureState.races[captureState.currentRaceIdx] || {};
  const activeCupInConfig = currentRuleDraftValues['copa'] || '';

  // Render quick-jump cup emblems bar
  if (jumpStrip) {
    jumpStrip.innerHTML = MK8_CUPS_CATALOG.map((c, cIdx) => {
      const cIcon = c.icon ? getApiUrl(c.icon) : '';
      const shortName = c.cup.replace(/^[^\s]+\s+Copa\s+/i, '');
      return `
        <button type="button" onclick="scrollToCupInSelector('selector-cup-sec-${cIdx}')" title="Ir a ${c.cup}" class="px-2 py-1 rounded-xl bg-slate-950 hover:bg-indigo-600/25 border border-slate-800 hover:border-indigo-500/40 text-[10px] font-bold text-slate-300 whitespace-nowrap flex items-center gap-1 flex-shrink-0 transition cursor-pointer">
          ${cIcon ? `<img src="${cIcon}" class="w-4 h-4 object-contain">` : ''}
          <span>${shortName}</span>
        </button>
      `;
    }).join('');
  }

  const sectionsHtml = MK8_CUPS_CATALOG.map((c, cIdx) => {
    // Filter tracks if search query is active
    const matchingTracks = [];
    c.tracks.forEach((tName, tIdx) => {
      const tIcon = c.trackIcons ? c.trackIcons[tIdx] : '';
      if (!q || tName.toLowerCase().includes(q) || c.cup.toLowerCase().includes(q)) {
        matchingTracks.push({ name: tName, icon: tIcon, num: tIdx + 1 });
      }
    });

    if (matchingTracks.length === 0) return '';

    const cIcon = c.icon ? getApiUrl(c.icon) : '';
    const isCupSelected = trackSelectorModalMode === 'config_cup'
      ? activeCupInConfig === c.cup
      : curRace.cup_name === c.cup;

    const cupHeaderBorder = isCupSelected
      ? 'border-indigo-500/60 bg-indigo-950/40'
      : 'border-slate-800 bg-slate-950/80';

    const tracksCardsHtml = matchingTracks.map(tr => {
      const isTrackSelected = trackSelectorModalMode === 'race' && curRace.track_name === tr.name && curRace.cup_name === c.cup;
      const cardCls = isTrackSelected
        ? 'bg-emerald-600/25 border-emerald-400 ring-2 ring-emerald-400/60 text-white font-black shadow-lg'
        : 'bg-slate-950/90 hover:bg-indigo-600/20 border-slate-800 hover:border-indigo-500/60 text-slate-200 font-semibold';
      const tIconUrl = tr.icon ? getApiUrl(tr.icon) : '';
      const clickAction = trackSelectorModalMode === 'config_cup'
        ? `selectEntireCupFromModal('${c.cup.replace(/'/g, "\\'")}')`
        : `selectSingleTrackFromModal('${c.cup.replace(/'/g, "\\'")}', '${tr.name.replace(/'/g, "\\'")}')`;

      return `
        <button type="button" onclick="${clickAction}" class="p-2 rounded-2xl border text-left transition flex flex-col gap-1.5 group cursor-pointer ${cardCls}">
          <div class="relative w-full h-16 sm:h-20 rounded-xl overflow-hidden bg-slate-900 border border-slate-800/80">
            ${tIconUrl ? `<img src="${tIconUrl}" alt="${tr.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">` : ''}
            <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-slate-950/85 text-[9px] font-black text-indigo-300 border border-slate-700/80">
              Pista ${tr.num}
            </span>
            ${isTrackSelected ? `<span class="absolute top-1 right-1 px-1.5 py-0.5 rounded-md bg-emerald-500 text-slate-950 text-[9px] font-black">✓ Activa</span>` : ''}
          </div>
          <div class="px-0.5">
            <div class="text-xs font-bold text-white group-hover:text-indigo-200 leading-tight line-clamp-1">${tr.name}</div>
            <div class="text-[10px] text-slate-400 truncate">${c.cup}</div>
          </div>
        </button>
      `;
    }).join('');

    return `
      <div id="selector-cup-sec-${cIdx}" class="rounded-2xl border ${cupHeaderBorder} p-3 space-y-2.5">
        <!-- Cup Separator Header -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <div class="flex items-center gap-2">
            ${cIcon ? `<img src="${cIcon}" alt="${c.cup}" class="w-6 h-6 object-contain">` : ''}
            <span class="text-xs sm:text-sm font-black text-white">${c.cup}</span>
            <span class="text-[10px] text-slate-400">(${c.tracks.length} pistas)</span>
          </div>
          <button type="button" onclick="selectEntireCupFromModal('${c.cup.replace(/'/g, "\\'")}')" class="px-2.5 py-1 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/30 text-[11px] font-bold transition cursor-pointer flex items-center gap-1">
            <span>🏆</span> <span>${trackSelectorModalMode === 'config_cup' ? 'Elegir esta Copa' : 'Cargar las 4 pistas de esta Copa'}</span>
          </button>
        </div>
        <!-- 4 Tracks of this Cup -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          ${tracksCardsHtml}
        </div>
      </div>
    `;
  }).filter(Boolean).join('');

  bodyEl.innerHTML = sectionsHtml || `<div class="text-center py-10 text-slate-500 text-xs">No se encontraron pistas ni copas con "${filterQuery}".</div>`;
}

function selectSingleTrackFromModal(cupName, trackName) {
  selectCaptureTrack(cupName, trackName);
  closeModal('modal-track-selector');
}

function selectEntireCupFromModal(cupName) {
  const cupObj = MK8_CUPS_CATALOG.find(c => c.cup === cupName);
  if (!cupObj) return;

  if (trackSelectorModalMode === 'config_cup') {
    currentRuleDraftValues['copa'] = cupName;
    renderDynamicGameRules();
    closeModal('modal-track-selector');
    return;
  }

  // In race Capture Mode: populate the 4 tracks of this Cup starting at currentRaceIdx
  const startIdx = captureState.currentRaceIdx || 0;
  for (let offset = 0; offset < cupObj.tracks.length; offset++) {
    const targetRace = captureState.races[startIdx + offset];
    if (targetRace) {
      targetRace.cup_name = cupObj.cup;
      targetRace.track_name = cupObj.tracks[offset];
    }
  }
  captureState.selectedCupTab = cupObj.cup;
  renderCaptureTrackSection();
  renderCapturePlayersAndStandings();
  closeModal('modal-track-selector');
  showToast(`Cargadas las ${cupObj.tracks.length} pistas de ${cupObj.cup}`, 'success');
}

function pickRandomFromTrackSelectorModal() {
  pickRandomMarioKartTrack();
  closeModal('modal-track-selector');
}

function selectCaptureTrack(cupName, trackName) {
  const curRace = captureState.races[captureState.currentRaceIdx];
  if (!curRace) return;
  curRace.cup_name = cupName;
  curRace.track_name = trackName;
  captureState.showTrackPicker = false;
  renderCaptureTrackSection();
}

function pickRandomMarioKartTrack() {
  const isBattle = captureState.matchType.toLowerCase().includes('batalla') || captureState.matchType.toLowerCase().includes('patrulla');
  const pool = isBattle
    ? MK8_CUPS_CATALOG.filter(c => c.cup.includes('Batalla'))
    : MK8_CUPS_CATALOG.filter(c => !c.cup.includes('Batalla'));
  const randCup = pool[Math.floor(Math.random() * pool.length)];
  const randTrack = randCup.tracks[Math.floor(Math.random() * randCup.tracks.length)];
  captureState.selectedCupTab = randCup.cup;
  selectCaptureTrack(randCup.cup, randTrack);
}

function renderCaptureTrackSection() {
  const curRace = captureState.races[captureState.currentRaceIdx];
  if (!curRace) return;

  const trackDisplay = document.getElementById('capture-current-track-display');
  const autoBadge = document.getElementById('capture-track-auto-badge');
  const toggleBtn = document.getElementById('btn-toggle-track-picker');

  if (trackDisplay) {
    if (curRace.track_name) {
      const tIcon = getTrackIconUrl(curRace.track_name);
      const cIcon = getCupIconUrl(curRace.cup_name);
      trackDisplay.innerHTML = `
        <div class="flex items-center gap-2.5 mt-1">
          ${tIcon ? `<img src="${tIcon}" alt="${curRace.track_name}" class="w-16 h-10 rounded-lg object-cover border border-indigo-500/40 shadow flex-shrink-0">` : ''}
          <div>
            <div class="text-sm sm:text-base font-black text-white">${curRace.track_name}</div>
            ${curRace.cup_name ? `<div class="text-xs text-indigo-400 font-bold flex items-center gap-1">${cIcon ? `<img src="${cIcon}" class="w-4 h-4 object-contain">` : ''}<span>${curRace.cup_name}</span></div>` : ''}
          </div>
        </div>
      `;
    } else {
      trackDisplay.innerHTML = `<span class="text-amber-400 underline">Haz clic aquí en "Elegir Pista" para seleccionar del catálogo →</span>`;
    }
  }

  if (autoBadge) {
    autoBadge.classList.toggle('hidden', !captureState.isAutoCup);
  }

  if (toggleBtn) {
    toggleBtn.innerHTML = `<span>🗺️</span> <span>${curRace.track_name ? 'Cambiar Pista' : 'Elegir Pista (Ver Todas)'}</span>`;
  }
}

function setPlayerRacePosition(playerId, position) {
  const curRace = captureState.races[captureState.currentRaceIdx];
  if (!curRace) return;

  // If another player already has this position in the current race (and not Por equipos), clear it to prevent accidental duplicates
  if (captureState.ruleValues.equipos !== 'Por equipos') {
    Object.keys(curRace.positions).forEach(otherPid => {
      if (Number(otherPid) !== Number(playerId) && curRace.positions[otherPid] === position) {
        delete curRace.positions[otherPid];
      }
    });
  }

  curRace.positions[playerId] = position;
  renderCapturePlayersAndStandings();
}

function renderCapturePlayersAndStandings() {
  const curRace = captureState.races[captureState.currentRaceIdx];
  if (!curRace || !currentRecordingSession) return;

  const selectedPlayers = currentRecordingSession.players.filter(p => currentSelectedPlayerIds.has(p.id));
  const listEl = document.getElementById('capture-players-positions-list');

  // Taken positions in this race
  const takenByPlayer = {};
  Object.entries(curRace.positions).forEach(([pid, pos]) => {
    takenByPlayer[pos] = Number(pid);
  });

  if (listEl) {
    listEl.innerHTML = selectedPlayers.map(p => {
      const curPos = curRace.positions[p.id] || null;
      const curPts = curPos ? getPointsForPosition(curPos) : 0;
      const charName = captureState.playerMetrics[p.id]?.character || '';

      const posButtonsHtml = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(pos => {
        const isSelected = curPos === pos;
        const isTakenByOther = takenByPlayer[pos] && takenByPlayer[pos] !== p.id;
        let btnStyle = 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700';

        if (isSelected) {
          if (pos === 1) btnStyle = 'bg-amber-500 border-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/30 scale-105';
          else if (pos === 2) btnStyle = 'bg-slate-300 border-white text-slate-950 font-black shadow-md scale-105';
          else if (pos === 3) btnStyle = 'bg-amber-700 border-amber-500 text-white font-black shadow-md scale-105';
          else btnStyle = 'bg-indigo-600 border-indigo-400 text-white font-black shadow-md shadow-indigo-600/30 scale-105';
        } else if (isTakenByOther) {
          btnStyle = 'bg-slate-950/50 border-slate-900 text-slate-600 hover:bg-slate-800 hover:text-slate-300';
        }

        return `
          <button type="button" onclick="setPlayerRacePosition(${p.id}, ${pos})" class="h-9 rounded-xl border text-xs transition flex items-center justify-center ${btnStyle}">
            ${pos}º
          </button>
        `;
      }).join('');

      const statusBadge = curPos
        ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">${curPos}º Lugar · +${curPts} pts</span>`
        : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Selecciona lugar</span>`;

      return `
        <div class="p-3 rounded-xl bg-slate-900/90 border ${curPos ? 'border-slate-800' : 'border-amber-500/30'} space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${p.color_hex}"></span>
              <span class="font-bold text-white text-xs sm:text-sm">${p.nickname || p.name}</span>
              ${charName ? renderCharacterBadgeHtml(charName) : ''}
            </div>
            ${statusBadge}
          </div>
          <div class="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
            ${posButtonsHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  // Update race pills status
  const pillsEl = document.getElementById('capture-race-pills');
  if (pillsEl) {
    pillsEl.innerHTML = captureState.races.map((r, idx) => {
      const done = isRaceCompleted(r);
      const isCurrent = idx === captureState.currentRaceIdx;
      let cls = 'bg-slate-900 text-slate-400 border-slate-800';
      if (isCurrent) {
        cls = 'bg-indigo-600 text-white border-indigo-400 font-black shadow';
      } else if (done) {
        cls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold';
      }
      return `
        <button type="button" onclick="jumpToCaptureRace(${idx})" class="px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap transition flex-shrink-0 ${cls}">
          C${idx + 1} ${done ? '✓' : ''}
        </button>
      `;
    }).join('');
  }

  // Compute live cumulative standings up to current captured races
  const totals = {};
  const winsCount = {};
  selectedPlayers.forEach(p => {
    totals[p.id] = 0;
    winsCount[p.id] = 0;
  });

  let completedRacesCount = 0;
  captureState.races.forEach(r => {
    let anyInRace = false;
    Object.entries(r.positions).forEach(([pid, pos]) => {
      const numPid = Number(pid);
      if (totals[numPid] !== undefined && pos) {
        totals[numPid] += getPointsForPosition(pos);
        if (pos === 1) winsCount[numPid] += 1;
        anyInRace = true;
      }
    });
    if (anyInRace) completedRacesCount++;
  });

  const sortedLive = [...selectedPlayers].sort((a, b) => (totals[b.id] - totals[a.id]) || (winsCount[b.id] - winsCount[a.id]));
  const leaderScore = sortedLive.length > 0 ? totals[sortedLive[0].id] : 0;

  const liveCountEl = document.getElementById('capture-live-races-completed');
  if (liveCountEl) {
    liveCountEl.textContent = `${completedRacesCount} de ${captureState.totalRaces} carreras con puntaje`;
  }

  const liveGrid = document.getElementById('capture-live-standings-grid');
  if (liveGrid) {
    liveGrid.innerHTML = sortedLive.map((p, idx) => {
      const sc = totals[p.id];
      const diff = sc - leaderScore;
      const diffText = idx === 0 ? '👑 Líder' : `${diff} pts`;
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`;
      return `
        <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-white truncate">${medal} ${p.nickname || p.name}</div>
            <div class="text-[10px] ${idx === 0 ? 'text-amber-400 font-semibold' : 'text-slate-400'}">${diffText} · ${winsCount[p.id]} vic</div>
          </div>
          <div class="text-sm font-black text-amber-400 ml-2">${sc}p</div>
        </div>
      `;
    }).join('');
  }
}

function renderCaptureRaceStep() {
  const idx = captureState.currentRaceIdx;
  const total = captureState.totalRaces;
  const curRace = captureState.races[idx];

  const counterEl = document.getElementById('capture-race-counter');
  if (counterEl) counterEl.textContent = `🏁 Carrera ${idx + 1} de ${total}`;

  const summaryEl = document.getElementById('capture-rules-summary');
  if (summaryEl) {
    const clase = captureState.ruleValues.clase || '';
    const copa = captureState.ruleValues.copa || '';
    summaryEl.textContent = [captureState.matchType, clase, captureState.isAutoCup ? copa : ''].filter(Boolean).join(' · ');
  }

  // Navigation buttons
  const prevBtn = document.getElementById('btn-capture-prev-race');
  if (prevBtn) {
    prevBtn.disabled = idx === 0;
    prevBtn.classList.toggle('opacity-40', idx === 0);
  }

  const earlyBtn = document.getElementById('btn-capture-finish-early');
  if (earlyBtn) {
    earlyBtn.classList.toggle('hidden', idx === total - 1);
  }

  const nextBtn = document.getElementById('btn-capture-next-race');
  if (nextBtn) {
    if (idx < total - 1) {
      nextBtn.innerHTML = `<span>Continuar a Carrera ${idx + 2}</span> <span>→</span>`;
      nextBtn.className = 'px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-black shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition';
    } else {
      nextBtn.innerHTML = `<span>🏁 Finalizar Partida y Guardar Resultados</span>`;
      nextBtn.className = 'px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-black shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition';
    }
  }

  if (curRace && curRace.cup_name) {
    captureState.selectedCupTab = curRace.cup_name;
  }

  renderCaptureTrackSection();
  renderCapturePlayersAndStandings();
}

function capturePrevRace() {
  if (captureState.currentRaceIdx > 0) {
    captureState.currentRaceIdx--;
    captureState.showTrackPicker = !captureState.isAutoCup && !captureState.races[captureState.currentRaceIdx].track_name;
    renderCaptureRaceStep();
  }
}

function validateCurrentCaptureRace() {
  const curRace = captureState.races[captureState.currentRaceIdx];
  if (!curRace) return false;

  const missingPlayers = [];
  currentRecordingSession.players.forEach(p => {
    if (currentSelectedPlayerIds.has(p.id) && !curRace.positions[p.id]) {
      missingPlayers.push(p.nickname || p.name);
    }
  });

  if (missingPlayers.length > 0) {
    showToast(`Falta seleccionar el lugar de: ${missingPlayers.join(', ')}`, 'error');
    return false;
  }

  if (!curRace.track_name) {
    curRace.track_name = `Pista #${curRace.race_number}`;
  }
  return true;
}

async function captureNextOrFinishRace() {
  if (!validateCurrentCaptureRace()) return;

  if (captureState.currentRaceIdx < captureState.totalRaces - 1) {
    captureState.currentRaceIdx++;
    const nextRace = captureState.races[captureState.currentRaceIdx];
    captureState.showTrackPicker = !captureState.isAutoCup && !nextRace.track_name;
    renderCaptureRaceStep();
  } else {
    await saveCapturedMatch(false);
  }
}

async function finishCaptureMatchNow() {
  // Allow finishing early with all races that have at least one position recorded
  const curRace = captureState.races[captureState.currentRaceIdx];
  const anyPosInCurrent = curRace && Object.keys(curRace.positions).length > 0;
  if (anyPosInCurrent && !validateCurrentCaptureRace()) {
    return;
  }
  await saveCapturedMatch(true);
}

async function saveCapturedMatch(finishedEarly = false) {
  if (!currentRecordingSession) return;

  const validRaces = captureState.races.filter(r => Object.keys(r.positions).length > 0);
  if (validRaces.length === 0) {
    showToast('Captura al menos una carrera antes de guardar la partida', 'error');
    return;
  }

  const racesPayload = validRaces.map((r, idx) => ({
    race_number: idx + 1,
    cup_name: r.cup_name || '',
    track_name: r.track_name || `Pista #${idx + 1}`,
    class_mode: r.class_mode || captureState.ruleValues.clase || '150cc',
    scores: Array.from(currentSelectedPlayerIds).map(pid => {
      const pos = r.positions[pid] || 12;
      return {
        player_id: pid,
        position: pos,
        points: getPointsForPosition(pos)
      };
    })
  }));

  // Sum totals per player
  const totalsByPid = {};
  currentSelectedPlayerIds.forEach(pid => { totalsByPid[pid] = 0; });
  racesPayload.forEach(r => {
    r.scores.forEach(rs => {
      totalsByPid[rs.player_id] = (totalsByPid[rs.player_id] || 0) + rs.points;
    });
  });

  const scoresPayload = Array.from(currentSelectedPlayerIds).map(pid => ({
    player_id: pid,
    score: totalsByPid[pid] || 0,
    rank_position: 1,
    metrics: captureState.playerMetrics[pid] || {}
  }));

  scoresPayload.sort((a, b) => b.score - a.score);
  scoresPayload.forEach((sc, idx) => { sc.rank_position = idx + 1; });

  const ruleValuesToSave = {
    ...captureState.ruleValues,
    carreras: `${racesPayload.length} carreras`
  };

  const nextBtn = document.getElementById('btn-capture-next-race');
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = 'Guardando partida...';
  }

  try {
    let url = `/api/sessions/${currentRecordingSession.id}/matches`;
    let method = 'POST';
    if (currentEditingMatchId) {
      url = `/api/sessions/matches/${currentEditingMatchId}`;
      method = 'PUT';
    }

    const res = await fetch(getApiUrl(url), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_type: captureState.matchType,
        rule_values: ruleValuesToSave,
        is_practice: captureState.isPractice,
        notes: captureState.notes,
        scores: scoresPayload,
        races: racesPayload
      })
    });

    if (res.ok) {
      const updatedSession = await res.json();
      currentRecordingSession = updatedSession;
      renderSessionDetail(updatedSession);

      const savedMatch = currentEditingMatchId
        ? updatedSession.matches.find(m => m.id === currentEditingMatchId)
        : updatedSession.matches[updatedSession.matches.length - 1];

      currentEditingMatchId = null;
      showToast('¡Partida y carreras guardadas con éxito!', 'success');
      showFinishedMatchStep(savedMatch, updatedSession);
    } else {
      showToast('Error al guardar la partida', 'error');
    }
  } catch (err) {
    console.error('Error saving captured match:', err);
    showToast('Error de conexión al guardar la partida', 'error');
  } finally {
    if (nextBtn) {
      nextBtn.disabled = false;
    }
  }
}

function showFinishedMatchStep(match, session) {
  showMatchModalStep('finished');

  const headline = document.getElementById('finished-match-headline');
  const subheadline = document.getElementById('finished-match-subheadline');
  const podiumCards = document.getElementById('finished-match-podium-cards');

  if (match) {
    const winner = (match.scores || [])[0];
    if (headline) {
      headline.textContent = winner
        ? `🏆 ¡${winner.player_nickname || winner.player_name} gana la Partida #${match.match_number}!`
        : `¡Partida #${match.match_number} Finalizada!`;
    }
    if (subheadline) {
      subheadline.textContent = `${match.match_type} · ${match.race_count || (match.races || []).length} carreras disputadas · ${session.title}`;
    }
    if (podiumCards) {
      podiumCards.innerHTML = (match.scores || []).map((sc, idx) => {
        const medal = idx === 0 ? '🥇 1º' : idx === 1 ? '🥈 2º' : idx === 2 ? '🥉 3º' : `${idx + 1}º`;
        const borderCls = idx === 0 ? 'border-amber-400/50 bg-amber-500/10' : 'border-slate-800 bg-slate-900/80';
        const charName = sc.metrics?.character || '';
        const charIcon = getCharacterIconUrl(charName);
        return `
          <div class="p-3 rounded-xl border ${borderCls} flex items-center justify-between">
            <div class="flex items-center gap-2">
              ${charIcon ? `<img src="${charIcon}" alt="${charName}" class="w-7 h-7 object-contain flex-shrink-0">` : ''}
              <div>
                <div class="text-xs font-black text-white">${medal} ${sc.player_nickname || sc.player_name}</div>
                <div class="text-[10px] text-slate-400">${charName || 'Sin personaje'}</div>
              </div>
            </div>
            <div class="text-base font-black text-amber-400">${sc.score} pts</div>
          </div>
        `;
      }).join('');
    }

    const burndownContainer = document.getElementById('finished-match-burndown-container');
    if (match.races && match.races.length > 0) {
      if (burndownContainer) burndownContainer.classList.remove('hidden');
      setTimeout(() => {
        renderCupBurndownChart('post-match-burndown-chart', match.races, session.players, true);
      }, 50);
    } else if (burndownContainer) {
      burndownContainer.classList.add('hidden');
    }
  }
}

function renderCupBurndownChart(canvasId, races, sessionPlayers, isPostMatchModal = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !races || races.length === 0) return;

  if (isPostMatchModal && postMatchBurndownChartInstance) {
    postMatchBurndownChartInstance.destroy();
    postMatchBurndownChartInstance = null;
  } else if (sessionMatchBurndownCharts[canvasId]) {
    sessionMatchBurndownCharts[canvasId].destroy();
    delete sessionMatchBurndownCharts[canvasId];
  }

  const labels = races.map(r => `C${r.race_number}: ${(r.track_name || '').substring(0, 14)}`);
  const playerMap = {};
  (sessionPlayers || []).forEach(p => { playerMap[p.id] = p; });

  // Identify participating players in these races
  const pids = new Set();
  races.forEach(r => (r.scores || []).forEach(rs => pids.add(rs.player_id)));

  const datasets = Array.from(pids).map(pid => {
    const pInfo = playerMap[pid] || {};
    let running = 0;
    const dataPoints = races.map(r => {
      const found = (r.scores || []).find(rs => rs.player_id === pid);
      if (found) {
        running = found.cumulative_points !== undefined ? found.cumulative_points : (running + found.points);
      }
      return running;
    });
    const firstRaceScore = (races[0].scores || []).find(rs => rs.player_id === pid);
    const color = pInfo.color_hex || (firstRaceScore && firstRaceScore.color_hex) || '#6366f1';
    const label = pInfo.nickname || pInfo.name || (firstRaceScore && (firstRaceScore.player_nickname || firstRaceScore.player_name)) || `Jugador ${pid}`;

    return {
      label,
      data: dataPoints,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2.5,
      pointRadius: 3.5,
      tension: 0.25
    };
  });

  const chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' }, boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const rIdx = items[0].dataIndex;
              const r = races[rIdx];
              return r ? `Carrera #${r.race_number}: ${r.track_name} ${r.cup_name ? '(' + r.cup_name + ')' : ''}` : '';
            },
            label: (item) => {
              const r = races[item.dataIndex];
              const pId = Array.from(pids)[item.datasetIndex];
              const rs = r && (r.scores || []).find(s => s.player_id === pId);
              const posTxt = rs ? ` (${rs.position}º lugar: +${rs.points} pts)` : '';
              return `${item.dataset.label}: ${item.formattedValue} pts acumulados${posTxt}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } }
      }
    }
  });

  if (isPostMatchModal) {
    postMatchBurndownChartInstance = chart;
  } else {
    sessionMatchBurndownCharts[canvasId] = chart;
  }
}

function toggleMatchBurndownPanel(matchId) {
  const panel = document.getElementById(`match-burndown-panel-${matchId}`);
  if (!panel) return;
  const isHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !isHidden);

  if (isHidden && currentRecordingSession) {
    const match = (currentRecordingSession.matches || []).find(m => m.id === matchId);
    if (match && match.races && match.races.length > 0) {
      setTimeout(() => {
        renderCupBurndownChart(`match-burndown-canvas-${matchId}`, match.races, currentRecordingSession.players, false);
      }, 40);
    }
  }
}

async function startAnotherMatchFromFinished() {
  if (!currentRecordingSession) return;
  await openRecordMatchModal(currentRecordingSession.id);
}

async function closeSessionFromFinished() {
  if (!currentRecordingSession) return;
  closeModal('modal-match');
  await toggleSessionStatus(currentRecordingSession.id, 'completed');
}

async function handleCreateOrUpdateMatch(e) {
  e.preventDefault();
  if (!currentRecordingSession) return;

  const match_type = document.getElementById('match-type-select').value;
  const is_practice = document.getElementById('match-is-practice').checked;
  const notes = document.getElementById('match-notes').value;

  if (currentSelectedPlayerIds.size === 0) {
    showToast('Selecciona al menos un jugador que haya participado en la partida', 'error');
    return;
  }

  // Collect dynamic rules
  const rule_values = {};
  const ruleInputs = document.querySelectorAll('[name^="rule_"]');
  ruleInputs.forEach(inp => {
    const key = inp.name.replace('rule_', '');
    rule_values[key] = inp.value;
  });

  // Collect scores only for participating players
  const scores = [];
  currentSelectedPlayerIds.forEach(playerId => {
    const rankInp = document.querySelector(`[name="rank_${playerId}"]`);
    const scoreInp = document.querySelector(`[name="score_${playerId}"]`);
    const metricInp = document.querySelector(`[name="metric_${playerId}"]`);

    const rank_position = rankInp ? parseInt(rankInp.value, 10) || 1 : 1;
    const score = scoreInp ? parseFloat(scoreInp.value) || 0 : 0;
    const metrics = {};
    if (metricInp && metricInp.value) {
      metrics['character'] = metricInp.value;
    }

    scores.push({
      player_id: playerId,
      score,
      rank_position,
      metrics
    });
  });

  if (isMarioKartGame(currentMatchGame)) {
    scores.sort((a, b) => b.score - a.score);
    scores.forEach((sc, idx) => {
      sc.rank_position = idx + 1;
    });
  }

  const submitBtn = document.getElementById('btn-save-match');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';
  }

  try {
    let url = `/api/sessions/${currentRecordingSession.id}/matches`;
    let method = 'POST';

    if (currentEditingMatchId) {
      url = `/api/sessions/matches/${currentEditingMatchId}`;
      method = 'PUT';
    }

    const res = await fetch(getApiUrl(url), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_type,
        rule_values,
        is_practice,
        notes,
        scores
      })
    });

    if (res.ok) {
      const updatedSession = await res.json();
      currentRecordingSession = updatedSession;
      renderSessionDetail(updatedSession);
      const wasEditing = Boolean(currentEditingMatchId);
      const savedMatch = wasEditing
        ? updatedSession.matches.find(m => m.id === currentEditingMatchId)
        : updatedSession.matches[updatedSession.matches.length - 1];
      currentEditingMatchId = null;

      if (wasEditing) {
        closeModal('modal-match');
        showToast('¡Partida actualizada con éxito!', 'success');
      } else {
        showToast(is_practice ? 'Partida de práctica registrada' : '¡Partida oficial guardada!', 'success');
        showFinishedMatchStep(savedMatch, updatedSession);
      }
    } else {
      showToast('Error al guardar la partida', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = currentEditingMatchId ? '💾 Actualizar Puntaje Manual' : '💾 Guardar Puntaje Manual';
    }
  }
}

// -----------------------------------------------------------------------------
// PLAYERS TAB
// -----------------------------------------------------------------------------
async function loadPlayers() {
  const container = document.getElementById('players-grid');
  const countLabel = document.getElementById('players-count-label');
  try {
    const res = await fetch(getApiUrl('/api/players'));
    if (!res.ok) return;
    const players = await res.json();
    cachedPlayers = players;

    if (countLabel) {
      countLabel.textContent = `${players.length} ${players.length === 1 ? 'jugador' : 'jugadores'}`;
    }

    if (!players || players.length === 0) {
      container.innerHTML = `<div class="col-span-full text-center py-8 text-slate-500 text-xs">Aún no hay jugadores registrados. Usa el formulario de arriba para dar de alta al primer jugador.</div>`;
      return;
    }

    container.innerHTML = players.map(p => {
      const avatarHtml = p.avatar_url
        ? `<img src="${getApiUrl(p.avatar_url)}" class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 shadow-md flex-shrink-0" style="border-color: ${p.color_hex}">`
        : `<div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-black text-lg sm:text-xl text-white shadow-md flex-shrink-0" style="background-color: ${p.color_hex}">${p.name.substring(0, 2).toUpperCase()}</div>`;

      const emailHtml = p.email
        ? `<div class="text-[11px] text-indigo-300 truncate flex items-center gap-1 mt-0.5" title="${p.email}"><span>✉️</span> <span class="truncate">${p.email}</span></div>`
        : `<div class="text-[11px] text-slate-500 italic mt-0.5">Sin correo</div>`;

      return `
        <div class="game-card-hover p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3 shadow-sm relative">
          <div class="absolute top-3 right-3 flex items-center gap-1">
            <button onclick="openEditPlayerModal(${p.id})" class="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600/30 text-indigo-300 text-xs transition" title="Editar perfil">✏️</button>
            <button onclick="handleDeletePlayer(${p.id})" class="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-500 hover:text-rose-400 text-xs transition" title="Eliminar jugador">✕</button>
          </div>

          <div class="flex items-center gap-3 pr-14">
            ${avatarHtml}
            <div class="min-w-0">
              <h4 class="font-bold text-white text-sm sm:text-base leading-tight truncate">${p.name}</h4>
              <div class="text-xs text-indigo-400 font-mono">${p.nickname ? '@' + p.nickname : 'Sin apodo'}</div>
              ${emailHtml}
            </div>
          </div>

          <div class="grid grid-cols-3 gap-1.5 pt-2.5 border-t border-slate-800/80 text-center">
            <div>
              <div class="text-[10px] text-slate-500 uppercase font-semibold">Partidas</div>
              <div class="font-bold text-slate-300 text-xs sm:text-sm">${p.total_matches}</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-500 uppercase font-semibold">Victorias</div>
              <div class="font-bold text-emerald-400 text-xs sm:text-sm">${p.wins}</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-500 uppercase font-semibold">Win Rate</div>
              <div class="font-bold text-amber-400 text-xs sm:text-sm">${p.win_rate}%</div>
            </div>
          </div>

          <button onclick="openEditPlayerModal(${p.id})" class="w-full py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition">
            <span>✏️</span> Editar Perfil
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading players:', err);
  }
}

async function handleCreatePlayer(e) {
  e.preventDefault();
  const nameInp = document.getElementById('player-name');
  const nickInp = document.getElementById('player-nickname');
  const emailInp = document.getElementById('player-email');
  const colorInp = document.getElementById('player-color');
  const fileInput = document.getElementById('player-avatar-file');
  const submitBtn = document.getElementById('btn-save-player');

  const name = nameInp ? nameInp.value.trim() : '';
  const nickname = nickInp ? nickInp.value.trim() : '';
  const email = emailInp ? emailInp.value.trim() : '';
  const color_hex = colorInp ? colorInp.value : '#6366f1';

  if (!name) {
    showToast('El nombre del jugador es requerido', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';
  }

  try {
    const res = await fetch(getApiUrl('/api/players'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, nickname, email, color_hex })
    });

    if (!res.ok) {
      showToast('Error al registrar jugador', 'error');
      return;
    }

    const newPlayer = await res.json();

    // If avatar image selected, upload it
    if (fileInput && fileInput.files.length > 0) {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      await fetch(getApiUrl(`/api/players/${newPlayer.id}/avatar`), {
        method: 'POST',
        body: formData
      });
    }

    // Reset inputs
    if (nameInp) nameInp.value = '';
    if (nickInp) nickInp.value = '';
    if (emailInp) emailInp.value = '';
    if (fileInput) fileInput.value = '';

    showToast(`¡Jugador "${newPlayer.name}" registrado con éxito!`, 'success');
    cachedPlayers = []; // invalidate cache
    await loadPlayers();
  } catch (err) {
    showToast('Error de conexión al registrar jugador', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>+</span> Guardar Jugador';
    }
  }
}

async function openEditPlayerModal(playerId) {
  try {
    const res = await fetch(getApiUrl(`/api/players/${playerId}`));
    if (!res.ok) return;
    const player = await res.json();

    document.getElementById('edit-player-id').value = player.id;
    document.getElementById('edit-player-name').value = player.name;
    document.getElementById('edit-player-nickname').value = player.nickname || '';
    document.getElementById('edit-player-email').value = player.email || '';
    document.getElementById('edit-player-color').value = player.color_hex || '#6366f1';

    const avatarPreview = document.getElementById('edit-player-avatar-preview');
    if (player.avatar_url) {
      avatarPreview.innerHTML = `<img src="${getApiUrl(player.avatar_url)}" class="w-full h-full rounded-2xl object-cover">`;
      avatarPreview.style.backgroundColor = 'transparent';
    } else {
      avatarPreview.innerHTML = player.name.substring(0, 2).toUpperCase();
      avatarPreview.style.backgroundColor = player.color_hex || '#6366f1';
    }

    const fileInp = document.getElementById('edit-player-avatar-file');
    if (fileInp) fileInp.value = '';

    openModal('modal-edit-player');
  } catch (err) {
    showToast('Error al cargar datos del jugador', 'error');
  }
}

async function handleUpdatePlayer(e) {
  e.preventDefault();
  const playerId = document.getElementById('edit-player-id').value;
  const name = document.getElementById('edit-player-name').value.trim();
  const nickname = document.getElementById('edit-player-nickname').value.trim();
  const email = document.getElementById('edit-player-email').value.trim();
  const color_hex = document.getElementById('edit-player-color').value;
  const fileInput = document.getElementById('edit-player-avatar-file');
  const submitBtn = document.getElementById('btn-update-player');

  if (!name) {
    showToast('El nombre del jugador es requerido', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando cambios...';
  }

  try {
    const res = await fetch(getApiUrl(`/api/players/${playerId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, nickname, email, color_hex })
    });

    if (!res.ok) {
      showToast('Error al actualizar jugador', 'error');
      return;
    }

    // If new avatar file uploaded
    if (fileInput && fileInput.files.length > 0) {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      await fetch(getApiUrl(`/api/players/${playerId}/avatar`), {
        method: 'POST',
        body: formData
      });
    }

    closeModal('modal-edit-player');
    showToast('Perfil de jugador actualizado con éxito', 'success');
    cachedPlayers = [];
    await loadPlayers();
  } catch (err) {
    showToast('Error de conexión al actualizar jugador', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar Cambios';
    }
  }
}

async function handleDeletePlayer(playerId) {
  if (!confirm('¿Seguro que deseas eliminar a este jugador?')) return;
  try {
    const res = await fetch(getApiUrl(`/api/players/${playerId}`), { method: 'DELETE' });
    if (res.ok) {
      showToast('Jugador eliminado', 'success');
      loadPlayers();
    }
  } catch (err) {
    showToast('Error al eliminar jugador', 'error');
  }
}

// -----------------------------------------------------------------------------
// GAMES TAB
// -----------------------------------------------------------------------------
async function loadGames() {
  const container = document.getElementById('games-grid');
  try {
    await ensureGamesLoaded(true);

    if (cachedGames.length === 0) {
      container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500">No hay videojuegos registrados.</div>`;
      return;
    }

    container.innerHTML = cachedGames.map(g => {
      const matchTypes = (g.match_types || []).map(mt => `
        <span class="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-slate-300">${mt}</span>
      `).join('');

      const rulesCount = (g.rule_settings || []).length;

      return `
        <div class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="text-3xl">${g.icon}</span>
              <div>
                <h4 class="font-bold text-white text-base">${g.name}</h4>
                <div class="text-xs text-indigo-400 font-mono">${g.id}</div>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
              ${g.scoring_type}
            </span>
          </div>

          <p class="text-xs text-slate-400 leading-relaxed">${g.description || 'Sin descripción'}</p>

          <div class="space-y-1.5 pt-2 border-t border-slate-800">
            <div class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Modos de Partida</div>
            <div class="flex flex-wrap gap-1.5">${matchTypes || '<span class="text-xs text-slate-500">Normal</span>'}</div>
          </div>

          ${rulesCount > 0 ? `
            <div class="text-[11px] text-amber-400 font-medium">
              ⚙️ ${rulesCount} parámetros de configuración (ej. ${g.rule_settings.map(r => r.name).slice(0, 3).join(', ')}...)
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading games:', err);
  }
}

function openNewGameModal() {
  document.getElementById('form-new-game').reset();
  openModal('modal-game');
}

async function handleCreateGame(e) {
  e.preventDefault();
  const icon = document.getElementById('game-icon').value;
  const id = document.getElementById('game-id').value.trim().toLowerCase().replace(/\s+/g, '_');
  const name = document.getElementById('game-name').value;
  const scoring_type = document.getElementById('game-scoring-type').value;
  const match_types_str = document.getElementById('game-match-types').value;
  const match_types = match_types_str.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const res = await fetch(getApiUrl('/api/games'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name,
        icon,
        scoring_type,
        match_types,
        default_points_system: [10, 6, 4, 2, 1]
      })
    });

    if (res.ok) {
      document.getElementById('game-id').value = '';
      document.getElementById('game-name').value = '';
      showToast('¡Videojuego agregado al catálogo!', 'success');
      cachedGames = [];
      loadGames();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Error al crear juego', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

// -----------------------------------------------------------------------------
// BACKUP & RESTORE
// -----------------------------------------------------------------------------
function downloadBackup() {
  window.location.href = getApiUrl('/api/backup/export');
}

function updateImportFileName(input) {
  const label = document.getElementById('import-file-name');
  if (input.files.length > 0) {
    label.textContent = `Archivo seleccionado: ${input.files[0].name}`;
    label.classList.add('text-indigo-400');
  }
}

async function handleImportBackup(e) {
  e.preventDefault();
  const fileInput = document.getElementById('import-file');
  if (fileInput.files.length === 0) {
    showToast('Selecciona un archivo .zip primero', 'error');
    return;
  }

  if (!confirm('Esta acción reemplazará la base de datos actual con la del respaldo. ¿Deseas continuar?')) {
    return;
  }

  const btn = document.getElementById('btn-import-submit');
  btn.disabled = true;
  btn.textContent = 'Restaurando respaldo...';

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch(getApiUrl('/api/backup/import'), {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      showToast('¡Respaldo restaurado con éxito!', 'success');
      cachedGames = [];
      cachedPlayers = [];
      setTimeout(() => {
        switchTab('dashboard');
      }, 1500);
    } else {
      const err = await res.json();
      showToast(err.detail || 'Error al restaurar respaldo', 'error');
    }
  } catch (err) {
    showToast('Error al conectar con el servidor', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Restaurar Respaldo Ahora';
  }
}

// -----------------------------------------------------------------------------
// CACHING HELPERS
// -----------------------------------------------------------------------------
async function ensureGamesLoaded(force = false) {
  if (cachedGames.length > 0 && !force) return;
  try {
    const res = await fetch(getApiUrl('/api/games'));
    if (res.ok) {
      cachedGames = await res.json();
      const select = document.getElementById('dash-game-filter');
      select.innerHTML = '<option value="">Todos los Videojuegos</option>' +
        cachedGames.map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');
    }
  } catch (err) {
    console.error('Error fetching games:', err);
  }
}

async function ensurePlayersLoaded(force = false) {
  if (cachedPlayers.length > 0 && !force) return;
  try {
    const res = await fetch(getApiUrl('/api/players'));
    if (res.ok) {
      cachedPlayers = await res.json();
    }
  } catch (err) {
    console.error('Error fetching players:', err);
  }
}

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});

// -----------------------------------------------------------------------------
// EMAIL & AUTOMATIONS SUBSYSTEM
// -----------------------------------------------------------------------------
let cachedTemplates = [];
let cachedAutomations = [];

async function loadEmailTab() {
  await loadEmailSettings();
  await loadAutomations();
  await loadTemplates();
  await loadEmailLogs();
}

async function loadEmailSettings() {
  try {
    const res = await fetch(getApiUrl('/api/settings/email'));
    if (!res.ok) return;
    const cfg = await res.json();

    const senderInp = document.getElementById('smtp-sender-email');
    const nameInp = document.getElementById('smtp-sender-name');
    const hostInp = document.getElementById('smtp-host');
    const portInp = document.getElementById('smtp-port');
    const passInp = document.getElementById('smtp-password');
    const passHint = document.getElementById('smtp-password-hint');
    const badge = document.getElementById('email-configured-badge');

    if (senderInp) senderInp.value = cfg.sender_email || '';
    if (nameInp) nameInp.value = cfg.sender_name || 'Game Scoreboard 🎮';
    if (hostInp) hostInp.value = cfg.smtp_host || 'smtp.gmail.com';
    if (portInp) portInp.value = cfg.smtp_port || 587;

    if (cfg.has_password) {
      if (passInp) passInp.placeholder = '•••••••• (Contraseña guardada)';
      if (passHint) passHint.textContent = 'Contraseña de aplicación guardada. Déjalo en blanco para no cambiarla.';
      if (badge) badge.classList.remove('hidden');
    } else {
      if (badge) badge.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error loading email settings:', err);
  }
}

async function handleSaveEmailSettings(e) {
  e.preventDefault();
  const sender_email = document.getElementById('smtp-sender-email').value.trim();
  const smtp_password = document.getElementById('smtp-password').value.trim();
  const sender_name = document.getElementById('smtp-sender-name').value.trim();
  const smtp_host = document.getElementById('smtp-host').value.trim();
  const smtp_port = parseInt(document.getElementById('smtp-port').value, 10) || 587;
  const submitBtn = document.getElementById('btn-save-email-settings');

  if (!sender_email) {
    showToast('Ingresa tu correo remitente', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';
  }

  try {
    const res = await fetch(getApiUrl('/api/settings/email'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_email,
        smtp_password: smtp_password || undefined,
        sender_name,
        smtp_host,
        smtp_port,
        is_enabled: true,
        use_tls: true
      })
    });

    if (res.ok) {
      showToast('Configuración SMTP guardada', 'success');
      document.getElementById('smtp-password').value = '';
      loadEmailSettings();
    } else {
      showToast('Error al guardar configuración', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>💾</span> Guardar Configuración SMTP';
    }
  }
}

async function handleSendDebugEmail() {
  const target_email = document.getElementById('debug-target-email').value.trim();
  const sender_email = document.getElementById('smtp-sender-email').value.trim();
  const smtp_password = document.getElementById('smtp-password').value.trim();
  const sender_name = document.getElementById('smtp-sender-name').value.trim();
  const smtp_host = document.getElementById('smtp-host').value.trim();
  const smtp_port = parseInt(document.getElementById('smtp-port').value, 10) || 587;

  const btn = document.getElementById('btn-debug-email');
  const resultBox = document.getElementById('email-debug-result-box');

  if (!target_email || !target_email.includes('@')) {
    showToast('Ingresa un correo destinatario válido en el campo de depuración', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Enviando a ' + target_email + '...';
  }

  if (resultBox) {
    resultBox.className = 'p-3 rounded-xl text-xs bg-slate-800 text-slate-300 border border-slate-700 block';
    resultBox.innerHTML = `Conectando con el servidor SMTP y enviando a <strong>${target_email}</strong>...`;
  }

  try {
    const res = await fetch(getApiUrl('/api/settings/email/test'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_email,
        sender_email: sender_email || undefined,
        smtp_password: smtp_password || undefined,
        sender_name: sender_name || undefined,
        smtp_host: smtp_host || undefined,
        smtp_port: smtp_port || undefined,
        use_tls: true
      })
    });

    const data = await res.json();

    if (res.ok) {
      resultBox.className = 'p-3 rounded-xl text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 block space-y-1';
      resultBox.innerHTML = `
        <div class="font-bold flex items-center gap-1.5"><span>✅</span> ¡Correo de prueba enviado con éxito!</div>
        <div class="text-[11px] text-slate-300">Entregado a: <strong>${data.recipient}</strong>. Revisa tu bandeja de entrada o spam.</div>
      `;
      showToast('¡Correo de prueba enviado con éxito!', 'success');
      loadEmailLogs();
    } else {
      resultBox.className = 'p-3 rounded-xl text-xs bg-rose-500/10 text-rose-300 border border-rose-500/30 block';
      resultBox.innerHTML = `<strong>⚠️ Error:</strong> ${data.detail || 'No se pudo enviar el correo.'}`;
      showToast(data.detail || 'Error al enviar correo', 'error');
      loadEmailLogs();
    }
  } catch (err) {
    if (resultBox) {
      resultBox.className = 'p-3 rounded-xl text-xs bg-rose-500/10 text-rose-300 border border-rose-500/30 block';
      resultBox.innerHTML = `<strong>⚠️ Error de conexión:</strong> ${err.message || 'No se pudo contactar con el backend.'}`;
    }
    showToast('Error de conexión', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🚀</span> Enviar Correo de Prueba (Depuración)';
    }
  }
}

// -----------------------------------------------------------------------------
// AUTOMATIONS
// -----------------------------------------------------------------------------
async function loadAutomations() {
  const container = document.getElementById('automations-list');
  if (!container) return;
  try {
    const res = await fetch(getApiUrl('/api/settings/automations'));
    if (!res.ok) return;
    const list = await res.json();
    cachedAutomations = list;

    if (list.length === 0) {
      container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">No hay automatizaciones creadas. Haz clic en "+ Nueva Automatización" para crear una.</div>`;
      return;
    }

    container.innerHTML = list.map(a => {
      const triggerBadge = a.trigger_type === 'session_finished'
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">🏁 Al Finalizar Sesión</span>`
        : (a.trigger_type === 'monthly'
          ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">📅 Mensual (1º de mes)</span>`
          : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">📆 Semanal</span>`);

      const contentLabel = a.content_type === 'session_summary' ? 'Resumen de Sesión' : (a.content_type === 'global_leaderboard' ? 'Leaderboard Global' : 'Resumen Mensual');
      const recipientsLabel = a.target_recipients === 'session_participants' ? '👥 Participantes de la sesión' : (a.target_recipients === 'all_players' ? '🌐 Todos los jugadores con correo' : `✉️ ${a.custom_emails || 'Personalizado'}`);

      const activeBadge = a.is_active
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Activa</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700">Inactiva</span>`;

      return `
        <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="space-y-1.5 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <strong class="text-white text-sm font-bold">${a.name}</strong>
              ${triggerBadge}
              ${activeBadge}
            </div>
            <div class="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>📄 Contenido: <strong class="text-slate-300">${contentLabel}</strong></span>
              <span>🎨 Plantilla: <strong class="text-indigo-300">${a.template_name || a.template_id}</strong></span>
              <span>📫 Destinatarios: <strong class="text-slate-300">${recipientsLabel}</strong></span>
            </div>
            ${a.last_triggered_at ? `<div class="text-[10px] text-slate-500">Último disparo: ${new Date(a.last_triggered_at).toLocaleString()}</div>` : ''}
          </div>

          <div class="flex items-center gap-1.5 flex-wrap flex-shrink-0">
            <button onclick="toggleAutomation(${a.id})" class="px-2.5 py-1 rounded-lg ${a.is_active ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'} text-xs font-semibold transition" title="Activar/Desactivar">
              ${a.is_active ? '🟢 Activa' : '⚪ Inactiva'}
            </button>
            <button onclick="executeAutomationNow(${a.id})" class="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition" title="Ejecutar prueba ahora">
              ▶️ Probar
            </button>
            <button onclick="openEditAutomationModal(${a.id})" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition" title="Editar automatización">
              ✏️
            </button>
            <button onclick="duplicateAutomation(${a.id})" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition" title="Duplicar/Copiar">
              📋
            </button>
            <button onclick="deleteAutomation(${a.id})" class="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 hover:text-rose-400 text-slate-500 text-xs transition" title="Eliminar automatización">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading automations:', err);
  }
}

async function populateTemplatesDropdown(selectedId = '') {
  const select = document.getElementById('automation-template');
  if (!select) return;
  await loadTemplates();
  select.innerHTML = cachedTemplates.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${t.name}</option>`).join('');
}

function toggleCustomEmailsField() {
  const select = document.getElementById('automation-recipients');
  const container = document.getElementById('automation-custom-emails-container');
  if (select && container) {
    container.className = select.value === 'custom' ? 'block' : 'hidden';
  }
}

async function openCreateAutomationModal() {
  document.getElementById('automation-id').value = '';
  document.getElementById('modal-automation-title').textContent = 'Nueva Automatización';
  document.getElementById('automation-name').value = '';
  document.getElementById('automation-trigger').value = 'session_finished';
  document.getElementById('automation-content').value = 'session_summary';
  document.getElementById('automation-recipients').value = 'session_participants';
  document.getElementById('automation-custom-emails').value = '';
  document.getElementById('automation-is-active').checked = true;
  await populateTemplatesDropdown();
  toggleCustomEmailsField();
  openModal('modal-automation');
}

async function openEditAutomationModal(id) {
  const auto = cachedAutomations.find(a => a.id === id);
  if (!auto) return;
  document.getElementById('automation-id').value = auto.id;
  document.getElementById('modal-automation-title').textContent = 'Editar Automatización';
  document.getElementById('automation-name').value = auto.name;
  document.getElementById('automation-trigger').value = auto.trigger_type;
  document.getElementById('automation-content').value = auto.content_type;
  document.getElementById('automation-recipients').value = auto.target_recipients;
  document.getElementById('automation-custom-emails').value = auto.custom_emails || '';
  document.getElementById('automation-is-active').checked = Boolean(auto.is_active);
  await populateTemplatesDropdown(auto.template_id);
  toggleCustomEmailsField();
  openModal('modal-automation');
}

async function handleSaveAutomation(e) {
  e.preventDefault();
  const id = document.getElementById('automation-id').value;
  const name = document.getElementById('automation-name').value.trim();
  const trigger_type = document.getElementById('automation-trigger').value;
  const content_type = document.getElementById('automation-content').value;
  const template_id = document.getElementById('automation-template').value;
  const target_recipients = document.getElementById('automation-recipients').value;
  const custom_emails = document.getElementById('automation-custom-emails').value.trim();
  const is_active = document.getElementById('automation-is-active').checked;

  if (!name) {
    showToast('El nombre de la automatización es requerido', 'error');
    return;
  }

  const payload = {
    name,
    trigger_type,
    content_type,
    template_id,
    target_recipients,
    custom_emails,
    is_active
  };

  try {
    const url = id ? `/api/settings/automations/${id}` : '/api/settings/automations';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(getApiUrl(url), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-automation');
      showToast(id ? 'Automatización actualizada' : 'Automatización creada', 'success');
      loadAutomations();
    } else {
      showToast('Error al guardar automatización', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

async function toggleAutomation(id) {
  try {
    const res = await fetch(getApiUrl(`/api/settings/automations/${id}/toggle`), { method: 'POST' });
    if (res.ok) {
      loadAutomations();
      showToast('Estado de automatización actualizado', 'success');
    }
  } catch (err) {
    showToast('Error al cambiar estado', 'error');
  }
}

async function duplicateAutomation(id) {
  try {
    const res = await fetch(getApiUrl(`/api/settings/automations/${id}/duplicate`), { method: 'POST' });
    if (res.ok) {
      loadAutomations();
      showToast('Automatización copiada con éxito', 'success');
    }
  } catch (err) {
    showToast('Error al duplicar automatización', 'error');
  }
}

async function deleteAutomation(id) {
  if (!confirm('¿Seguro que deseas eliminar esta automatización?')) return;
  try {
    const res = await fetch(getApiUrl(`/api/settings/automations/${id}`), { method: 'DELETE' });
    if (res.ok) {
      loadAutomations();
      showToast('Automatización eliminada', 'success');
    }
  } catch (err) {
    showToast('Error al eliminar automatización', 'error');
  }
}

async function executeAutomationNow(id) {
  showToast('Ejecutando automatización...', 'info');
  try {
    const res = await fetch(getApiUrl(`/api/settings/automations/${id}/execute`), { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('¡Automatización ejecutada con éxito!', 'success');
      loadAutomations();
      loadEmailLogs();
    } else {
      showToast(data.detail || 'Error al ejecutar', 'error');
    }
  } catch (err) {
    showToast('Error de conexión al ejecutar automatización', 'error');
  }
}

// -----------------------------------------------------------------------------
// TEMPLATES
// -----------------------------------------------------------------------------
async function loadTemplates() {
  const container = document.getElementById('templates-grid');
  try {
    const res = await fetch(getApiUrl('/api/settings/templates'));
    if (!res.ok) return;
    const list = await res.json();
    cachedTemplates = list;

    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = `<div class="col-span-2 text-center py-6 text-slate-500 text-xs">No hay plantillas registradas.</div>`;
      return;
    }

    container.innerHTML = list.map(t => {
      const badges = [];
      if (t.include_podium) badges.push('<span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 text-[10px] font-semibold">👑 Podio</span>');
      if (t.include_standings) badges.push('<span class="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 text-[10px] font-semibold">📊 Puntos</span>');
      if (t.include_matches) badges.push('<span class="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 text-[10px] font-semibold">📜 Partidas</span>');
      if (t.include_metrics) badges.push('<span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold">🏎️ Karts</span>');

      return `
        <div class="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-3 shadow-sm">
          <div class="space-y-2">
            ${t.banner_url ? `<div class="w-full h-24 rounded-xl overflow-hidden bg-slate-900 border border-slate-800/80 mb-2"><img src="${t.banner_url}" class="w-full h-full object-cover" alt="Banner" onerror="this.parentElement.style.display='none'"></div>` : ''}
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-bold text-white text-sm sm:text-base">${t.name}</h3>
              <span class="text-[10px] text-slate-500 font-mono">${t.id}</span>
            </div>
            <div class="text-xs text-slate-400 font-medium">Asunto: <span class="text-indigo-300">${t.subject_template}</span></div>
            ${t.intro_text ? `<div class="text-[11px] text-slate-500 italic truncate">${t.intro_text}</div>` : ''}
            <div class="flex flex-wrap gap-1.5 pt-1">${badges.join(' ')}</div>
          </div>

          <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span class="text-[10px] text-slate-500 truncate max-w-[170px]" title="${t.banner_url || 'Estándar'}">Banner: ${t.banner_url || 'Estándar'}</span>
            <button onclick="openEditTemplateModal('${t.id}')" class="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition flex items-center gap-1">
              <span>✏️</span> Editar Plantilla
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading templates:', err);
  }
}

function insertVariableToSubject(varName) {
  const inp = document.getElementById('template-subject');
  if (inp) {
    inp.value += ' ' + varName;
    inp.focus();
  }
}

function updateTemplateBannerPreview(url) {
  const box = document.getElementById('template-banner-preview-box');
  const img = document.getElementById('template-banner-preview-img');
  if (!box || !img) return;
  const cleanUrl = (url || '').trim();
  if (cleanUrl) {
    img.src = cleanUrl;
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
  }
}

async function openEditTemplateModal(templateId) {
  const t = cachedTemplates.find(x => x.id === templateId);
  if (!t) return;
  document.getElementById('edit-template-id').value = t.id;
  document.getElementById('template-name').value = t.name;
  document.getElementById('template-subject').value = t.subject_template;
  const bannerUrl = t.banner_url || 'static/img/banner_mario_kart.jpg';
  document.getElementById('template-banner-url').value = bannerUrl;
  updateTemplateBannerPreview(bannerUrl);
  document.getElementById('template-intro').value = t.intro_text || '';
  document.getElementById('template-include-podium').checked = Boolean(t.include_podium);
  document.getElementById('template-include-standings').checked = Boolean(t.include_standings);
  document.getElementById('template-include-matches').checked = Boolean(t.include_matches);
  document.getElementById('template-include-metrics').checked = Boolean(t.include_metrics);
  document.getElementById('template-footer').value = t.footer_text || '';
  openModal('modal-template');
}

async function handleSaveTemplate(e) {
  e.preventDefault();
  const templateId = document.getElementById('edit-template-id').value;
  const name = document.getElementById('template-name').value.trim();
  const subject_template = document.getElementById('template-subject').value.trim();
  const banner_url = document.getElementById('template-banner-url').value.trim() || 'static/img/email_banner.jpg';
  const intro_text = document.getElementById('template-intro').value.trim();
  const include_podium = document.getElementById('template-include-podium').checked;
  const include_standings = document.getElementById('template-include-standings').checked;
  const include_matches = document.getElementById('template-include-matches').checked;
  const include_metrics = document.getElementById('template-include-metrics').checked;
  const footer_text = document.getElementById('template-footer').value.trim();

  try {
    const res = await fetch(getApiUrl(`/api/settings/templates/${templateId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        subject_template,
        banner_url,
        intro_text,
        include_podium,
        include_standings,
        include_matches,
        include_metrics,
        footer_text
      })
    });

    if (res.ok) {
      closeModal('modal-template');
      showToast('Plantilla guardada con éxito', 'success');
      loadTemplates();
    } else {
      showToast('Error al guardar plantilla', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

// -----------------------------------------------------------------------------
// LOGS
// -----------------------------------------------------------------------------
async function loadEmailLogs() {
  const tbody = document.getElementById('email-logs-table-body');
  if (!tbody) return;
  try {
    const res = await fetch(getApiUrl('/api/settings/email/logs?limit=40'));
    if (!res.ok) return;
    const logs = await res.json();

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-500 font-sans">No hay registros de envío recientes.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const isOk = l.status === 'sent';
      const statusBadge = isOk
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">✔ Enviado</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30" title="${l.error_message || ''}">✖ Falló</span>`;

      return `
        <tr class="hover:bg-slate-900/60">
          <td class="py-2 px-3 text-slate-400 text-[10px]">${new Date(l.created_at).toLocaleString([], {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}</td>
          <td class="py-2 px-3 text-white font-medium truncate max-w-[140px]" title="${l.recipient}">${l.recipient}</td>
          <td class="py-2 px-3 text-slate-300 truncate max-w-[160px]" title="${l.subject}">${l.subject}</td>
          <td class="py-2 px-3 text-indigo-400 text-[10px] font-sans">${l.trigger_type}</td>
          <td class="py-2 px-3 text-right">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading email logs:', err);
  }
}

async function handleClearEmailLogs() {
  if (!confirm('¿Deseas limpiar todos los registros del historial de envíos?')) return;
  try {
    const res = await fetch(getApiUrl('/api/settings/email/logs'), { method: 'DELETE' });
    if (res.ok) {
      loadEmailLogs();
      showToast('Historial de logs limpiado', 'success');
    }
  } catch (err) {
    showToast('Error al limpiar logs', 'error');
  }
}
