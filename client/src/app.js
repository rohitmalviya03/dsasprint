import { getLearningGuide } from './learning-guide.js';

const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');
const BRAND_NAME = 'DSASprint';
const SUPPORT_EMAIL = 'help.dsasprint@outlook.com';
const COPYRIGHT_TEXT = `&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.`;
let problems = [];
let progress = {};
let user = null;
let selectedId = null;
let view = 'learn';
let progressStream = null;
let dashboardFilter = 'all';
let authNotice = '';
let authMode = 'login';

const $ = (id) => document.getElementById(id);
const statusOptions = ['Not Attempted', 'Learning', 'Revision', 'Solved'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function dateValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

function todayValue() {
  const now = new Date();
  const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function matchesDashboardFilter(item) {
  if (dashboardFilter === 'all') return true;
  if (dashboardFilter === 'due') {
    return dateValue(item.revision_due_on) && dateValue(item.revision_due_on) <= todayValue() && item.status !== 'Solved';
  }
  return item.status === dashboardFilter;
}

function setDashboardFilter(filter) {
  dashboardFilter = filter;
  view = 'learn';
  selectedId = null;
  render();
}

function toast(message) {
  const element = document.createElement('div');
  element.className = 'toast';
  element.textContent = message;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 2500);
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    let error = { message: 'Request failed' };
    try {
      error = await response.json();
    } catch {
      // Keep the fallback message for non-JSON failures.
    }
    throw new Error(error.message || 'Request failed');
  }
  return response.json();
}

function problemId(problem) {
  return String(problem.id || problem.problem_id || problem.serial || problem.title || problem.problem || problem.name)
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function problemName(problem) {
  return problem.title || problem.problem || problem.name || 'Untitled problem';
}

function problemTopic(problem) {
  return problem.topic || problem.category || 'General';
}

function problemDifficulty(problem) {
  return problem.difficulty || 'Practice';
}

function externalLink(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function getProgress(id) {
  return progress[id] || {
    status: 'Not Attempted',
    notes: '',
    bookmarked: false,
    revision_count: 0,
    revision_due_on: null
  };
}

async function refreshProgress() {
  const data = await api('/api/progress');
  progress = data.progress || {};
  render();
}

function connectProgressStream() {
  progressStream?.close();
  if (!user) return;
  progressStream = new EventSource(`${API}/api/progress/events`, { withCredentials: true });
  progressStream.addEventListener('progress', () => {
    refreshProgress().catch(() => progressStream?.close());
  });
}

async function saveProgress(id, patch) {
  progress[id] = { ...getProgress(id), ...patch };
  render();
  try {
    await api(`/api/progress/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
    toast('Progress saved');
  } catch (error) {
    toast(error.message);
    await refreshProgress().catch(() => {});
  }
}

async function load() {
  localStorage.removeItem('token');
  problems = await (await fetch('/assets/problems.json')).json();
  const params = new URLSearchParams(location.search);
  authNotice = params.get('auth') === 'google_unavailable'
    ? 'Google sign-in is not configured yet. Add Google OAuth credentials in the server environment and restart the API.'
    : params.get('auth') === 'failed'
      ? 'Google sign-in did not complete. Please try again.'
      : '';
  if (params.has('auth')) history.replaceState({}, '', location.pathname);
  try {
    const session = await api('/api/auth/me');
    user = session.user;
    try {
      const data = await api('/api/progress');
      progress = data.progress || {};
    } catch (error) {
      progress = {};
      toast(`Progress unavailable: ${error.message}`);
    }
    connectProgressStream();
  } catch {
    user = null;
    progressStream?.close();
  }
  render();
}

function layout(content) {
  document.body.innerHTML = content;
}

function renderAuth() {
  const signingUp = authMode === 'signup';
  layout(`<main class="auth-page">
    <section class="auth-showcase">
      <div class="wordmark inverse"><span class="brand-mark">D</span><span>${BRAND_NAME}</span></div>
      <div class="showcase-copy">
        <p class="overline">DSA PREPARATION TRACKER</p>
        <h1>Prepare for DSA interviews.</h1>
        <p class="showcase-subtitle">Track coding problems, revise core patterns, and build clear interview explanations.</p>
        <p class="showcase-upcoming"><span>Coming soon</span> Mock interview practice with AI and person modes.</p>
      </div>
      <div class="session-preview" aria-hidden="true">
        <div class="preview-head"><span>Today's focus</span><span class="preview-date">3 due</span></div>
        <div class="preview-row active"><span class="preview-dot medium"></span><div><b>Sliding Window</b><small>Arrays | Medium</small></div><strong>Learning</strong></div>
        <div class="preview-row"><span class="preview-dot easy"></span><div><b>Two Sum</b><small>Arrays | Easy</small></div><strong class="complete">Solved</strong></div>
        <div class="preview-row"><span class="preview-dot hard"></span><div><b>Word Ladder</b><small>Graphs | Hard</small></div><strong class="review">Review</strong></div>
      </div>
    </section>
    <section class="auth-panel">
      <div class="wordmark compact"><span class="brand-mark">D</span><span>${BRAND_NAME}</span></div>
      <div class="auth-box">
        <p class="overline">${signingUp ? 'START PRACTICING' : 'WELCOME BACK'}</p>
        <h2>${signingUp ? 'Create your account' : 'Sign in to your account'}</h2>
        <p class="auth-subtitle">${signingUp ? 'Set up your private learning workspace.' : 'Continue where you left off.'}</p>
        ${authNotice ? `<p class="auth-notice">${escapeHtml(authNotice)}</p>` : ''}
        <div class="auth-tabs" role="tablist">
          <button class="${signingUp ? '' : 'active'}" id="loginTab" type="button">Sign in</button>
          <button class="${signingUp ? 'active' : ''}" id="signupTab" type="button">Create account</button>
        </div>
        <form id="authForm" class="auth-form">
          ${signingUp ? '<label>Full name<input id="name" name="name" autocomplete="name" placeholder="Rohit Sharma" required></label>' : ''}
          <label>Email address<input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>
          ${signingUp ? '<label>Contact number<input id="contactNumber" name="tel" type="tel" autocomplete="tel" inputmode="tel" placeholder="+91 98765 43210" required></label>' : ''}
          <label>Password
            <div class="password-field"><input id="password" name="password" type="password" autocomplete="${signingUp ? 'new-password' : 'current-password'}" placeholder="${signingUp ? 'Minimum 8 characters' : 'Enter password'}" required><button id="togglePassword" type="button">Show</button></div>
          </label>
          <button class="primary auth-submit" id="submitAuth" type="submit">${signingUp ? 'Create account' : 'Sign in'}</button>
        </form>
        <div class="auth-divider"><span>or</span></div>
        <button class="google-button" id="googleBtn" type="button"><span class="google-letter">G</span>Continue with Google</button>
        <p class="auth-foot">Secure session protection enabled</p>
        <p class="help-link">Need help? <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
        <p class="auth-copyright">${COPYRIGHT_TEXT}</p>
      </div>
    </section>
  </main>`);
  $('loginTab').onclick = () => { authMode = 'login'; authNotice = ''; renderAuth(); };
  $('signupTab').onclick = () => { authMode = 'signup'; authNotice = ''; renderAuth(); };
  $('authForm').onsubmit = (event) => {
    event.preventDefault();
    return signingUp ? signup() : login();
  };
  $('togglePassword').onclick = () => {
    const password = $('password');
    const hidden = password.type === 'password';
    password.type = hidden ? 'text' : 'password';
    $('togglePassword').textContent = hidden ? 'Hide' : 'Show';
  };
  $('googleBtn').onclick = () => { location.href = `${API}/api/auth/google`; };
}

function setAuthBusy(busy) {
  const button = $('submitAuth');
  if (!button) return;
  button.disabled = busy;
  $('googleBtn').disabled = busy;
  button.textContent = busy ? 'Please wait...' : (authMode === 'signup' ? 'Create account' : 'Sign in');
}

async function login() {
  setAuthBusy(true);
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('email').value, password: $('password').value })
    });
    await load();
  } catch (error) {
    toast(error.message);
  } finally {
    setAuthBusy(false);
  }
}

async function signup() {
  setAuthBusy(true);
  try {
    await api('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        name: $('name').value,
        email: $('email').value,
        contact_number: $('contactNumber').value,
        password: $('password').value
      })
    });
    await load();
  } catch (error) {
    toast(error.message);
  } finally {
    setAuthBusy(false);
  }
}

function render() {
  if (!user) return renderAuth();
  const entries = Object.values(progress);
  const solved = entries.filter((item) => item.status === 'Solved').length;
  const learning = entries.filter((item) => item.status === 'Learning').length;
  const revision = entries.filter((item) => item.status === 'Revision').length;
  const due = entries.filter((item) => dateValue(item.revision_due_on) && dateValue(item.revision_due_on) <= todayValue() && item.status !== 'Solved').length;
  const title = view === 'learn'
    ? 'Learn Problems'
    : view === 'plan'
      ? 'Revision Plan'
      : view === 'mock'
        ? 'Mock Interviews'
      : view === 'feedback'
        ? 'Feedback'
        : 'Settings';

  layout(`<div class="shell">
    <aside class="side">
      <div class="wordmark inverse side-wordmark"><span class="brand-mark">D</span><span>${BRAND_NAME}</span></div>
      <div class="user-block"><div class="avatar">${escapeHtml((user.name || 'A').charAt(0).toUpperCase())}</div><p>${escapeHtml(user.name)}<br><span>${escapeHtml(user.email)}</span></p></div>
      <div class="nav">
        <button data-v="learn">Learn</button>
        <button data-v="plan">Revision Plan</button>
        <button data-v="mock" class="nav-feature">Mock Interviews <span>Coming Soon</span></button>
        <button data-v="feedback">Feedback</button>
        <button data-v="settings">Settings</button>
        <button id="logout">Logout</button>
      </div>
    </aside>
    <main class="main">
      <div class="topbar"><h1>${title}</h1><div class="sync-status"><span></span>Live sync</div></div>
      <div class="grid cols5 dashboard-filters">
        <button class="card stat-filter ${dashboardFilter === 'all' ? 'active' : ''}" data-filter="all"><span class="stat">${problems.length}</span><span class="muted">Problems</span></button>
        <button class="card stat-filter ${dashboardFilter === 'Solved' ? 'active' : ''}" data-filter="Solved"><span class="stat">${solved}</span><span class="muted">Solved</span></button>
        <button class="card stat-filter ${dashboardFilter === 'Learning' ? 'active' : ''}" data-filter="Learning"><span class="stat">${learning}</span><span class="muted">Learning</span></button>
        <button class="card stat-filter ${dashboardFilter === 'Revision' ? 'active' : ''}" data-filter="Revision"><span class="stat">${revision}</span><span class="muted">Revision</span></button>
        <button class="card stat-filter ${dashboardFilter === 'due' ? 'active' : ''}" data-filter="due"><span class="stat">${due}</span><span class="muted">Due Today</span></button>
      </div>
      <section id="content"></section>
      <footer class="app-footer"><span>${COPYRIGHT_TEXT}</span><a href="mailto:${SUPPORT_EMAIL}">Help Center: ${SUPPORT_EMAIL}</a></footer>
    </main>
  </div>`);

  document.querySelectorAll('.nav button[data-v]').forEach((button) => {
    button.classList.toggle('active', button.dataset.v === view);
    button.onclick = () => {
      view = button.dataset.v;
      render();
    };
  });
  document.querySelectorAll('.stat-filter').forEach((button) => {
    button.onclick = () => setDashboardFilter(button.dataset.filter);
  });
  $('logout').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    progressStream?.close();
    location.reload();
  };
  if (view === 'learn') renderLearn();
  if (view === 'plan') renderPlan();
  if (view === 'mock') renderMockInterviews();
  if (view === 'feedback') renderFeedback();
  if (view === 'settings') renderSettings();
}

function renderLearn() {
  const topics = [...new Set(problems.map((problem) => problemTopic(problem)))];
  const difficulties = [...new Set(problems.map((problem) => problemDifficulty(problem)))];
  $('content').innerHTML = `<div class="card row">
    <input id="q" placeholder="Search problem">
    <select id="topic"><option value="">All topics</option>${topics.map((topic) => `<option>${escapeHtml(topic)}</option>`).join('')}</select>
    <select id="difficulty"><option value="">All difficulty</option>${difficulties.map((difficulty) => `<option>${escapeHtml(difficulty)}</option>`).join('')}</select>
    <select id="status"><option value="">All status</option>${statusOptions.map((status) => `<option>${status}</option>`).join('')}</select>
    ${dashboardFilter === 'due' ? '<span class="filter-chip">Due Today</span>' : ''}
  </div>
  <div class="grid cols2">
    <div class="card"><h2>Problem List</h2><div id="list" class="problem-list"></div></div>
    <div class="card"><h2>Learn Section</h2><div id="detail" class="muted">Select a problem to save progress and schedule revision.</div></div>
  </div>`;
  if (statusOptions.includes(dashboardFilter)) $('status').value = dashboardFilter;
  $('q').oninput = () => drawList();
  $('topic').oninput = () => drawList();
  $('difficulty').oninput = () => drawList();
  $('status').oninput = () => {
    dashboardFilter = $('status').value || 'all';
    render();
  };
  drawList();
}

function drawList(scrollToId = null) {
  const query = ($('q')?.value || '').toLowerCase();
  const topic = $('topic')?.value || '';
  const difficulty = $('difficulty')?.value || '';
  const status = $('status')?.value || '';
  const list = $('list');
  if (!list) return;
  const filtered = problems.filter((problem) => {
    const name = problemName(problem);
    return (!query || name.toLowerCase().includes(query))
      && (!topic || problemTopic(problem) === topic)
      && (!difficulty || problemDifficulty(problem) === difficulty)
      && (!status || getProgress(problemId(problem)).status === status)
      && matchesDashboardFilter(getProgress(problemId(problem)));
  });
  list.innerHTML = filtered.map((problem) => {
    const id = problemId(problem);
    const item = getProgress(id);
    const dueText = dateValue(item.revision_due_on) ? ` | Due ${dateValue(item.revision_due_on)}` : '';
    return `<div class="problem ${selectedId === id ? 'selected' : ''}" data-id="${escapeHtml(id)}">
      <div class="row"><b>${escapeHtml(problemName(problem))}</b><span class="badge difficulty-${escapeHtml(problemDifficulty(problem).toLowerCase())}">${escapeHtml(problemDifficulty(problem))}</span><span class="badge ${item.status.replace(' ', '')}">${item.status}</span></div>
      <div class="muted">${escapeHtml(problemTopic(problem))}${escapeHtml(dueText)}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('.problem').forEach((element) => {
    element.onclick = () => selectProblem(element.dataset.id, false);
  });
  if (scrollToId) {
    const element = list.querySelector(`[data-id="${CSS.escape(scrollToId)}"]`);
    if (element) {
      element.classList.add('pulse');
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function selectProblem(id, fromPlan = false) {
  selectedId = id;
  const problem = problems.find((candidate) => problemId(candidate) === id);
  if (!problem) return;
  if (view !== 'learn') {
    view = 'learn';
    render();
    setTimeout(() => {
      selectedId = id;
      drawList(id);
      showDetail(problem, id);
    }, 60);
    return;
  }
  drawList(fromPlan ? id : null);
  showDetail(problem, id);
}

function showDetail(problem, id) {
  const item = getProgress(id);
  const guide = getLearningGuide(problem);
  const article = externalLink(problem.article);
  const video = externalLink(problem.video);
  const resources = [
    article ? `<a class="resource-link" href="${escapeHtml(article)}" target="_blank" rel="noopener noreferrer">Read Article</a>` : '',
    video ? `<a class="resource-link video" href="${escapeHtml(video)}" target="_blank" rel="noopener noreferrer">Watch Video</a>` : ''
  ].filter(Boolean).join('');
  $('detail').innerHTML = `<h2>${escapeHtml(problemName(problem))}</h2>
    <p><span class="badge">${escapeHtml(problemTopic(problem))}</span> <span class="badge difficulty-${escapeHtml(problemDifficulty(problem).toLowerCase())}">${escapeHtml(problemDifficulty(problem))}</span></p>
    ${resources ? `<div class="row resources">${resources}</div>` : ''}
    <div class="learning-grid">
      <section class="learning-card"><h3>Core pattern</h3><p>${escapeHtml(guide.pattern)}</p></section>
      <section class="learning-card"><h3>Solving method</h3><p>${escapeHtml(guide.method)}</p></section>
      <section class="learning-card"><h3>Interview explanation method</h3><ol>${guide.interviewSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol></section>
      <section class="learning-card"><h3>Important points</h3><ul>${guide.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul></section>
      <section class="learning-card"><h3>Common mistakes</h3><ul>${guide.mistakes.map((mistake) => `<li>${escapeHtml(mistake)}</li>`).join('')}</ul></section>
    </div>
    <div class="grid">
      <label>Status
        <select id="pstatus">${statusOptions.map((status) => `<option ${item.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select>
      </label>
      <div class="row controls">
        <label><input id="bookmarked" type="checkbox" ${item.bookmarked ? 'checked' : ''}> Bookmarked</label>
        <label>Revision Count <input id="revisionCount" type="number" min="0" value="${Number(item.revision_count || 0)}"></label>
        <label>Next Revision <input id="revisionDue" type="date" value="${escapeHtml(dateValue(item.revision_due_on))}"></label>
      </div>
      <label>Notes<textarea id="notes" rows="8" style="width:100%">${escapeHtml(item.notes || '')}</textarea></label>
      <button class="primary" id="save">Save Progress</button>
    </div>`;
  $('save').onclick = () => saveProgress(id, {
    status: $('pstatus').value,
    notes: $('notes').value,
    bookmarked: $('bookmarked').checked,
    revision_count: Number($('revisionCount').value || 0),
    revision_due_on: $('revisionDue').value || null,
    last_visited: true
  });
}

function renderPlan() {
  const dueProblems = problems
    .filter((problem) => {
      const item = getProgress(problemId(problem));
      return dateValue(item.revision_due_on) && item.status !== 'Solved';
    })
    .sort((left, right) => dateValue(getProgress(problemId(left)).revision_due_on).localeCompare(dateValue(getProgress(problemId(right)).revision_due_on)));
  const perDay = Math.ceil(problems.length / 28);
  $('content').innerHTML = `<div class="card">
    <h2>Revision Queue</h2>
    <div id="dueList" class="due-list">${dueProblems.length ? '' : '<p class="muted">No revisions scheduled yet.</p>'}</div>
  </div>
  <div class="card"><h2>28 Day Study Plan</h2><div id="days"></div></div>`;
  if (dueProblems.length) {
    $('dueList').innerHTML = dueProblems.map((problem) => {
      const id = problemId(problem);
      const item = getProgress(id);
      return `<div class="problem" data-id="${escapeHtml(id)}">
        <div class="row"><b>${escapeHtml(problemName(problem))}</b><span class="badge difficulty-${escapeHtml(problemDifficulty(problem).toLowerCase())}">${escapeHtml(problemDifficulty(problem))}</span><span class="badge Revision">${escapeHtml(dateValue(item.revision_due_on))}</span></div>
        <div class="muted">${escapeHtml(problemTopic(problem))} | ${escapeHtml(item.status)}</div>
      </div>`;
    }).join('');
  }
  $('days').innerHTML = Array.from({ length: 28 }, (_, index) => {
    const chunk = problems.slice(index * perDay, (index + 1) * perDay);
    return `<details class="day" ${index === 0 ? 'open' : ''}><summary><b>Day ${index + 1}</b> | ${chunk.length} problems</summary>${chunk.map((problem) => {
      const id = problemId(problem);
      const item = getProgress(id);
      return `<div class="problem" data-id="${escapeHtml(id)}"><div class="row"><b>${escapeHtml(problemName(problem))}</b><span class="badge difficulty-${escapeHtml(problemDifficulty(problem).toLowerCase())}">${escapeHtml(problemDifficulty(problem))}</span><span class="badge ${item.status.replace(' ', '')}">${item.status}</span></div></div>`;
    }).join('')}</details>`;
  }).join('');
  document.querySelectorAll('#content .problem').forEach((element) => {
    element.onclick = () => selectProblem(element.dataset.id, true);
  });
}

function renderMockInterviews() {
  $('content').innerHTML = `<div class="mock-layout">
    <div class="card mock-form">
      <p class="overline">PRACTICE UNDER PRESSURE <span class="soon-tag">COMING SOON</span></p>
      <h2>Mock interviews are coming soon</h2>
      <p class="muted">Soon you will be able to practice DSA problem solving or development discussions with an AI or a person.</p>
      <form id="mockForm" class="grid">
        <fieldset class="choice-field">
          <legend>Interview track</legend>
          <div class="choice-switch">
            <label><input type="radio" name="mockTrack" value="DSA" checked><span>DSA</span></label>
            <label><input type="radio" name="mockTrack" value="Development"><span>Development</span></label>
          </div>
        </fieldset>
        <fieldset class="choice-field">
          <legend>Conducted by</legend>
          <div class="choice-switch">
            <label><input type="radio" name="mockMode" value="AI" checked><span>AI Interview</span></label>
            <label><input type="radio" name="mockMode" value="Person"><span>Person Interview</span></label>
          </div>
        </fieldset>
        <label>Round type
          <select id="mockType" required>
            <option>Technical</option>
            <option>Behavioral</option>
            <option>Mixed</option>
          </select>
        </label>
        <label>Focus area
          <select id="mockFocus" required></select>
        </label>
        <div class="grid cols2 mock-fields">
          <label>Date<input id="mockDate" type="date" min="${todayValue()}" required></label>
          <label>Time<input id="mockTime" type="time" required></label>
        </div>
        <label>Duration
          <select id="mockDuration" required>
            <option value="30">30 minutes</option>
            <option value="45" selected>45 minutes</option>
            <option value="60">60 minutes</option>
            <option value="90">90 minutes</option>
          </select>
        </label>
        <label>Preparation notes
          <textarea id="mockNotes" rows="4" maxlength="500" placeholder="Topics, questions, or points to practice explaining."></textarea>
        </label>
        <button class="primary" id="mockSubmit" type="submit" disabled>Schedule interview - Coming Soon</button>
      </form>
    </div>
    <div class="card mock-schedule">
      <div class="mock-head">
        <div>
          <p class="overline">ON THE WAY</p>
          <h2>What this feature will include</h2>
        </div>
        <span class="badge soon-badge">Coming Soon</span>
      </div>
      <div class="mock-preview-list">
        <p><b>DSA Interviews</b><span>Practice patterns, problem-solving explanations, and complexity analysis.</span></p>
        <p><b>Development Interviews</b><span>Prepare frontend, backend, database, API, and system design discussions.</span></p>
        <p><b>AI or Person Mode</b><span>Choose guided AI practice or schedule a person-led session when launched.</span></p>
      </div>
    </div>
  </div>`;
  document.querySelectorAll('input[name="mockTrack"]').forEach((input) => {
    input.onchange = () => drawMockFocusAreas(input.value);
  });
  drawMockFocusAreas('DSA');
  $('mockForm').onsubmit = (event) => {
    event.preventDefault();
    toast('Mock interviews are coming soon.');
  };
}

function drawMockFocusAreas(track) {
  const select = $('mockFocus');
  if (!select) return;
  const areas = track === 'Development'
    ? ['Frontend Development', 'Backend Development', 'Full Stack Development', 'Database and SQL', 'API Design', 'System Design', 'Testing and Debugging', 'DevOps and Deployment']
    : [...new Set(problems.map((problem) => problemTopic(problem)))];
  select.innerHTML = areas.map((area) => `<option>${escapeHtml(area)}</option>`).join('');
}

function renderFeedback() {
  $('content').innerHTML = `<div class="feedback-layout">
    <div class="card feedback-form">
      <p class="overline">HELP SHAPE DSASPRINT</p>
      <h2>Tell us what would improve your practice</h2>
      <p class="muted">Your feedback is tied to your account so product issues can be followed up accurately.</p>
      <form id="feedbackForm" class="grid">
        <label>Feedback type
          <select id="feedbackCategory" required>
            <option>Feature request</option>
            <option>Bug report</option>
            <option>Experience</option>
            <option>Other</option>
          </select>
        </label>
        <fieldset class="rating-field">
          <legend>How is your experience?</legend>
          <div class="rating-choice">
            ${[1, 2, 3, 4, 5].map((rating) => `<label><input type="radio" name="rating" value="${rating}" ${rating === 5 ? 'checked' : ''}><span>${rating}</span></label>`).join('')}
          </div>
        </fieldset>
        <label>Your feedback
          <textarea id="feedbackMessage" rows="7" maxlength="2000" placeholder="Tell us what happened or what you would like to see next." required></textarea>
        </label>
        <div class="feedback-actions">
          <span class="muted" id="feedbackCount">0 / 2000</span>
          <button class="primary" id="feedbackSubmit" type="submit">Send feedback</button>
        </div>
      </form>
      <div class="feedback-success hidden" id="feedbackSuccess">Thank you. Your feedback has been recorded.</div>
    </div>
    <div class="card feedback-aside">
      <h2>We value practical ideas</h2>
      <div class="feedback-topic"><b>Feature requests</b><span>New tracking, planning, or practice workflows</span></div>
      <div class="feedback-topic"><b>Bug reports</b><span>Anything that blocks progress or feels incorrect</span></div>
      <div class="feedback-topic"><b>Experience</b><span>Clarity, speed, design, and everyday usability</span></div>
      <div class="support-card"><b>Help Center</b><span>Need direct assistance?</span><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></div>
    </div>
  </div>`;
  $('feedbackMessage').oninput = () => {
    $('feedbackCount').textContent = `${$('feedbackMessage').value.length} / 2000`;
  };
  $('feedbackForm').onsubmit = submitFeedback;
}

async function submitFeedback(event) {
  event.preventDefault();
  const rating = Number(document.querySelector('input[name="rating"]:checked')?.value || 0);
  const button = $('feedbackSubmit');
  button.disabled = true;
  button.textContent = 'Sending...';
  try {
    await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        category: $('feedbackCategory').value,
        rating,
        message: $('feedbackMessage').value
      })
    });
    $('feedbackForm').reset();
    $('feedbackCount').textContent = '0 / 2000';
    $('feedbackSuccess').classList.remove('hidden');
    toast('Feedback sent');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Send feedback';
  }
}

function renderSettings() {
  const json = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), progress }, null, 2);
  $('content').innerHTML = `<div class="grid cols2">
    <div class="card"><h2>Export / Import</h2>
      <button class="primary" id="export">Export JSON</button>
      <textarea id="importBox" rows="10" style="width:100%" placeholder="Paste exported JSON here"></textarea>
      <div class="row"><button class="secondary" id="import">Import JSON</button><button class="secondary" id="reset">Reset Stats</button></div>
    </div>
    <div class="card"><h2>Account</h2><p><b>${escapeHtml(user.name)}</b><br>${escapeHtml(user.email)}${user.contact_number ? `<br>${escapeHtml(user.contact_number)}` : ''}</p><p class="muted">Your progress and revision plan are stored securely per account.</p></div>
  </div>`;
  $('export').onclick = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'dsa-progress-backup.json';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };
  $('import').onclick = async () => {
    try {
      const data = JSON.parse($('importBox').value);
      await api('/api/progress/bulk-import', { method: 'POST', body: JSON.stringify({ progress: data.progress || data }) });
      await refreshProgress();
      toast('Import completed');
    } catch (error) {
      toast(error.message);
    }
  };
  $('reset').onclick = async () => {
    if (!confirm('Reset all your saved status, notes, and revision dates?')) return;
    await api('/api/progress/reset', { method: 'DELETE' });
    progress = {};
    toast('Stats reset');
    render();
  };
}

load();
