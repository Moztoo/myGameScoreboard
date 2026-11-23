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
        navBtn.className = 'nav-tab flex-shrink-0 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 text-indigo-300 bg-slate-800 border border-indigo-500/30 shadow';
      }
    } else {
      if (section) {
        section.classList.add('hidden');
        section.style.display = 'none';
      }
      if (navBtn) {
        navBtn.className = 'nav-tab flex-shrink-0 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50';
      }
    }
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
      document.getElementById('kpi-practice-sub').textContent = `${ov.competitive_matches} comp. · ${ov.practice_matches} práct.`;
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
  if (charPlayerEl) {
    if (topChar) {
      charPlayerEl.textContent = topChar.character;
      charWinsEl.textContent = `${topChar.wins} victorias (${topChar.picks} carreras)`;
      charWinrateEl.textContent = `Efectividad: ${topChar.win_rate}%`;
    } else {
      charPlayerEl.textContent = 'Sin personaje registrado';
      charWinsEl.textContent = '0 victorias';
      charWinrateEl.textContent = 'Efectividad: 0%';
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
          <div class="text-[11px] font-semibold text-amber-400">${it.wins} victorias</div>
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
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-500">Aún no hay partidas registradas con los filtros seleccionados.</td></tr>`;
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

        const scoresTable = m.scores.map(sc => `
          <tr class="border-b border-slate-800/60 last:border-0">
            <td class="py-2 px-3 font-bold text-slate-300 w-16">${sc.rank_position}º</td>
            <td class="py-2 px-3 font-semibold text-white">${sc.player_nickname || sc.player_name}</td>
            <td class="py-2 px-3 text-right font-black text-amber-400">${sc.score} pts</td>
            <td class="py-2 px-3 text-right text-slate-400">${sc.metrics?.character || sc.metrics?.kart || '-'}</td>
          </tr>
        `).join('');

        return `
          <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <div class="flex items-center gap-2">
                <span class="font-black text-indigo-400 text-sm">Partida #${m.match_number}</span>
                <span class="text-xs text-slate-300 font-semibold">(${m.match_type})</span>
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
        <span class="text-xs text-slate-400">${s.matches.length} partidas registradas</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs text-slate-300">
          <thead class="bg-slate-950/60 uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th class="py-2.5 px-4 w-12 text-center">Pos</th>
              <th class="py-2.5 px-4">Jugador</th>
              <th class="py-2.5 px-4 text-center">Victorias 🥇</th>
              <th class="py-2.5 px-4 text-center">Partidas</th>
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
// RECORD & EDIT MATCH MODAL (DYNAMIC MARIO KART 8 / RULES & PLAYER CONFIG)
// -----------------------------------------------------------------------------
let currentRecordingSession = null;
let currentEditingMatchId = null;
let currentSelectedPlayerIds = new Set();
let currentMatchGame = null;
let currentGameMetricsDef = null;
let currentGameDefaultPoints = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

function isMarioKartGame(game) {
  if (!game) return false;
  const id = (game.id || '').toLowerCase();
  const name = (game.name || '').toLowerCase();
  return id.includes('mario_kart') || id.includes('mariokart') || name.includes('mario kart');
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

  // Sort descending by score (highest points = 1st place)
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

  const countBadge = document.getElementById('match-participants-count');
  if (countBadge) {
    const total = currentRecordingSession.players.length;
    const selected = currentSelectedPlayerIds.size;
    countBadge.textContent = `${selected} de ${total} jugadores`;
  }

  const scoresBody = document.getElementById('match-players-scores-body');
  if (!scoresBody) return;

  const isMK = isMarioKartGame(currentMatchGame);

  // Toggle Mario Kart auto-ranking banner in modal
  const autoRankBanner = document.getElementById('mk-auto-rank-banner');
  if (autoRankBanner) {
    if (isMK) {
      autoRankBanner.classList.remove('hidden');
    } else {
      autoRankBanner.classList.add('hidden');
    }
  }

  const selectedPlayers = currentRecordingSession.players.filter(p => currentSelectedPlayerIds.has(p.id));

  if (selectedPlayers.length === 0) {
    scoresBody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-amber-400 font-medium text-xs">⚠️ Selecciona arriba los jugadores que participan en esta partida.</td></tr>`;
    return;
  }

  scoresBody.innerHTML = selectedPlayers.map((p, idx) => {
    let rankVal = idx + 1;
    let scoreVal = currentGameDefaultPoints[idx] !== undefined ? currentGameDefaultPoints[idx] : 0;
    let metricVal = '';

    if (existingScoresMap && existingScoresMap[p.id]) {
      rankVal = existingScoresMap[p.id].rank_position;
      scoreVal = existingScoresMap[p.id].score;
      metricVal = existingScoresMap[p.id].metrics?.character || existingScoresMap[p.id].metrics?.kart || '';
    }

    let metricInput = `<input type="text" name="metric_${p.id}" value="${metricVal}" placeholder="ej. Mario / Yoshi" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white">`;
    if (currentGameMetricsDef && currentGameMetricsDef.type === 'select' && currentGameMetricsDef.options) {
      const opts = currentGameMetricsDef.options.map(o => `
        <option value="${o}" ${o === metricVal ? 'selected' : ''}>${o}</option>
      `).join('');
      metricInput = `<select name="metric_${p.id}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white">${opts}</select>`;
    }

    // Rank input: readonly if Mario Kart (auto-ranked), editable if other game
    const rankInputHtml = isMK
      ? `<input type="number" name="rank_${p.id}" value="${rankVal}" readonly class="w-full text-center bg-slate-900/90 border border-indigo-500/30 rounded-lg px-2 py-1 text-xs text-indigo-300 font-black cursor-default select-none focus:outline-none" title="Calculado automáticamente por puntaje">`
      : `<input type="number" name="rank_${p.id}" value="${rankVal}" min="1" max="100" class="w-full text-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold">`;

    // Score input: oninput triggers autoRankMarioKartScores if Mario Kart
    const scoreInputHtml = isMK
      ? `<input type="number" name="score_${p.id}" value="${scoreVal}" step="any" oninput="autoRankMarioKartScores()" class="w-full text-center bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-2 py-1 text-xs text-amber-400 font-black">`
      : `<input type="number" name="score_${p.id}" value="${scoreVal}" step="any" class="w-full text-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-black">`;

    return `
      <tr class="hover:bg-slate-800/30">
        <td class="py-2.5 px-3 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${p.color_hex}"></span>
          <span class="font-bold text-white">${p.nickname || p.name}</span>
        </td>
        <td class="py-2.5 px-3">
          ${rankInputHtml}
        </td>
        <td class="py-2.5 px-3">
          ${scoreInputHtml}
        </td>
        <td class="py-2.5 px-3">
          ${metricInput}
        </td>
      </tr>
    `;
  }).join('');

  if (isMK) {
    autoRankMarioKartScores();
  }
}

async function prepareMatchModalBase(session) {
  currentRecordingSession = session;

  const gameRes = await fetch(getApiUrl(`/api/games/${session.game_id}`));
  const game = await gameRes.json();
  currentMatchGame = game;

  currentGameDefaultPoints = game.default_points_system || [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  currentGameMetricsDef = (game.player_metrics || []).find(m => m.id === 'character') || game.player_metrics?.[0];

  const extraTh = document.getElementById('match-extra-metric-th');
  if (extraTh) extraTh.textContent = currentGameMetricsDef ? currentGameMetricsDef.name : 'Detalle';

  // Match types dropdown
  const matchTypeSelect = document.getElementById('match-type-select');
  matchTypeSelect.innerHTML = (game.match_types || ['Partida Regular']).map(mt => `<option value="${mt}">${mt}</option>`).join('');

  // Dynamic Game Rules (e.g. Mario Kart 8 fields: Clase, Equipos, Objetos, CPU, etc.)
  const rulesGrid = document.getElementById('match-dynamic-rules-grid');
  const rulesSection = document.getElementById('match-game-rules-section');

  if (game.rule_settings && game.rule_settings.length > 0) {
    rulesSection.classList.remove('hidden');
    rulesGrid.innerHTML = game.rule_settings.map(r => {
      const optionsHtml = (r.options || []).map(opt => `
        <option value="${opt}" ${opt === r.default ? 'selected' : ''}>${opt}</option>
      `).join('');

      return `
        <div>
          <label class="block text-slate-400 font-semibold mb-1">${r.name}</label>
          <select name="rule_${r.id}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-indigo-500">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');
  } else {
    rulesSection.classList.add('hidden');
    rulesGrid.innerHTML = '';
  }

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
    document.getElementById('btn-save-match').textContent = 'Guardar Partida';

    // Select all session players by default
    currentSelectedPlayerIds = new Set(session.players.map(p => p.id));

    // Render player selection checkboxes
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
    const game = await prepareMatchModalBase(currentRecordingSession);

    document.getElementById('match-modal-title').innerHTML = `<span>✏️</span> Editar Partida #${match.match_number}`;
    document.getElementById('match-modal-subtitle').textContent = `Modificando resultados de Partida #${match.match_number} (${match.match_type})`;
    document.getElementById('btn-save-match').textContent = 'Actualizar Partida';

    // Set match type
    const matchTypeSelect = document.getElementById('match-type-select');
    if (matchTypeSelect) matchTypeSelect.value = match.match_type;

    // Set practice
    document.getElementById('match-is-practice').checked = Boolean(match.is_practice);
    document.getElementById('match-notes').value = match.notes || '';

    // Set dynamic rules
    Object.entries(match.rule_values || {}).forEach(([k, v]) => {
      const el = document.querySelector(`[name="rule_${k}"]`);
      if (el) el.value = v;
    });

    // Populate players that were in this match
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

    // Map existing scores
    const existingScoresMap = {};
    match.scores.forEach(sc => { existingScoresMap[sc.player_id] = sc; });

    updateMatchParticipantsUI(existingScoresMap);
    openModal('modal-match');
  } catch (err) {
    console.error('Error opening edit match modal:', err);
  }
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

  // For Mario Kart, strictly enforce rank_position by score descending
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
      closeModal('modal-match');
      showToast(currentEditingMatchId ? '¡Partida actualizada con éxito!' : (is_practice ? 'Partida de práctica registrada' : '¡Partida oficial guardada!'), 'success');
      currentEditingMatchId = null;
      viewSession(currentRecordingSession.id);
    } else {
      showToast('Error al guardar la partida', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = currentEditingMatchId ? 'Actualizar Partida' : 'Guardar Partida';
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
