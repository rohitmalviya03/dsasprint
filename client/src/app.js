import { getLearningGuide } from './learning-guide.js';

const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');
const BRAND_NAME = 'DSASprint';
const SUPPORT_EMAIL = 'help.dsasprint@outlook.com';
const COPYRIGHT_TEXT = `&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.`;
let problems = [];
let progress = {};
let analytics = null;
let studyPlans = [];
let interviewRequests = [];
let user = null;
let selectedId = null;
let view = 'learn';
let progressStream = null;
let dashboardFilter = 'all';
let authNotice = '';
let authMode = 'login';
let resetToken = '';
let expandedInterviewId = null;
let adminTab = 'overview';

const $ = (id) => document.getElementById(id);
const statusOptions = ['Not Attempted', 'Learning', 'Revision', 'Solved'];
const learnerViews = ['learn', 'plan', 'mock', 'ats', 'feedback', 'settings'];

function landingViewForRole() {
  if (user?.is_admin) return 'admin';
  if (user?.is_interviewer) return 'interviewer';
  return 'learn';
}

function roleCanOpen(targetView) {
  if (user?.is_admin) return targetView === 'admin';
  if (user?.is_interviewer) return targetView === 'interviewer';
  return learnerViews.includes(targetView);
}

function navigationForRole() {
  if (user.is_admin) return '<button data-v="admin">Admin Console</button>';
  if (user.is_interviewer) return '<button data-v="interviewer">Interviewer Workspace</button>';
  return `<button data-v="learn">Learn</button>
        <button data-v="plan">Revision Plan</button>
        <button data-v="mock" class="nav-feature">Mock Interviews <span>Person beta</span></button>
        <button data-v="ats">ATS Checker</button>
        <button data-v="feedback">Feedback</button>
        <button data-v="settings">Settings</button>`;
}

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
  const [progressData, analyticsData] = await Promise.all([
    api('/api/progress'),
    api('/api/progress/analytics').catch(() => null)
  ]);
  progress = progressData.progress || {};
  analytics = analyticsData;
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
    await refreshProgress().catch(() => {});
  } catch (error) {
    toast(error.message);
    await refreshProgress().catch(() => {});
  }
}

async function load() {
  localStorage.removeItem('token');
  const builtInProblems = await (await fetch('/assets/problems.json')).json();
  const customProblems = await api('/api/content/problems').then((data) => data.problems || []).catch(() => []);
  problems = [...builtInProblems, ...customProblems];
  const params = new URLSearchParams(location.search);
  resetToken = params.get('reset_token') || '';
  if (resetToken) authMode = 'reset';
  authNotice = params.get('auth') === 'google_unavailable'
    ? 'Google sign-in is not configured yet. Add Google OAuth credentials in the server environment and restart the API.'
    : params.get('auth') === 'failed'
      ? 'Google sign-in did not complete. Please try again.'
      : '';
  if (params.has('auth') || resetToken) history.replaceState({}, '', location.pathname);
  try {
    const session = await api('/api/auth/me');
    user = session.user;
    if (!roleCanOpen(view)) view = landingViewForRole();
    try {
      const data = await api('/api/progress');
      progress = data.progress || {};
      analytics = await api('/api/progress/analytics').catch(() => null);
      studyPlans = await api('/api/content/study-plans').then((result) => result.plans || []).catch(() => []);
    } catch (error) {
      progress = {};
      analytics = null;
      studyPlans = [];
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
  const applyingAsInterviewer = authMode === 'interviewer';
  const forgotPassword = authMode === 'forgot';
  const resettingPassword = authMode === 'reset';
  const heading = resettingPassword
    ? 'Set a new password'
    : forgotPassword
      ? 'Reset your password'
      : applyingAsInterviewer
        ? 'Apply as an interviewer'
      : signingUp
        ? 'Create your account'
        : 'Sign in to your account';
  const subtitle = resettingPassword
    ? 'Choose a secure new password for your account.'
    : forgotPassword
      ? 'We will email a password reset link to your registered email.'
      : applyingAsInterviewer
        ? 'Create an interviewer profile. Your workspace opens after admin approval.'
      : signingUp
        ? 'Set up your private learning workspace.'
        : 'Continue where you left off.';
  layout(`<main class="auth-page">
    <section class="auth-showcase">
      <div class="wordmark inverse"><span class="brand-mark">D</span><span>${BRAND_NAME}</span></div>
      <div class="showcase-copy">
        <p class="overline">DSA PREPARATION TRACKER</p>
        <h1>Prepare for DSA interviews.</h1>
        <p class="showcase-subtitle">Track coding problems, revise core patterns, and build clear interview explanations.</p>
        <p class="showcase-upcoming"><span>New</span> Request person-led mock interviews. AI mode is coming soon.</p>
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
        <p class="overline">${resettingPassword ? 'ACCOUNT RECOVERY' : forgotPassword ? 'PASSWORD HELP' : applyingAsInterviewer ? 'INTERVIEWER APPLICATION' : signingUp ? 'START PRACTICING' : 'WELCOME BACK'}</p>
        <h2>${heading}</h2>
        <p class="auth-subtitle">${subtitle}</p>
        ${authNotice ? `<p class="auth-notice">${escapeHtml(authNotice)}</p>` : ''}
        ${!forgotPassword && !resettingPassword && !applyingAsInterviewer ? `<div class="auth-tabs" role="tablist">
          <button class="${signingUp ? '' : 'active'}" id="loginTab" type="button">Sign in</button>
          <button class="${signingUp ? 'active' : ''}" id="signupTab" type="button">Create account</button>
        </div>` : ''}
        <form id="authForm" class="auth-form">
          ${!resettingPassword && (signingUp || applyingAsInterviewer) ? '<label>Full name<input id="name" name="name" autocomplete="name" placeholder="Rohit Sharma" required></label>' : ''}
          ${!resettingPassword ? '<label>Email address<input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>' : ''}
          ${!resettingPassword && (signingUp || applyingAsInterviewer) ? '<label>Contact number<input id="contactNumber" name="tel" type="tel" autocomplete="tel" inputmode="tel" placeholder="+91 98765 43210" required></label>' : ''}
          ${!forgotPassword ? `<label>${resettingPassword ? 'New password' : 'Password'}
            <div class="password-field"><input id="password" name="password" type="password" autocomplete="${signingUp || applyingAsInterviewer || resettingPassword ? 'new-password' : 'current-password'}" placeholder="${signingUp || applyingAsInterviewer || resettingPassword ? 'Minimum 8 characters' : 'Enter password'}" required><button id="togglePassword" type="button">Show</button></div>
          </label>` : ''}
          ${resettingPassword ? '<label>Confirm new password<input id="confirmPassword" name="confirm-password" type="password" autocomplete="new-password" placeholder="Re-enter new password" required></label>' : ''}
          ${applyingAsInterviewer ? `<label>Professional headline<input id="applyHeadline" placeholder="Senior Backend Engineer"></label>
            <div class="grid cols2"><label>Company<input id="applyCompany" placeholder="Company name"></label><label>Experience (years)<input id="applyExperience" type="number" min="0" max="70" value="2" required></label></div>
            <label>Expertise<input id="applyExpertise" placeholder="DSA, React, Node.js, System Design" required></label>
            <label>LinkedIn URL<input id="applyLinkedin" type="url" placeholder="https://linkedin.com/in/..."></label>
            <label>About your interviewing experience<textarea id="applyBio" rows="4" minlength="20" maxlength="2000" required placeholder="Tell us what interview rounds and topics you can conduct."></textarea></label>` : ''}
          <button class="primary auth-submit" id="submitAuth" type="submit">${resettingPassword ? 'Reset password' : forgotPassword ? 'Send reset link' : applyingAsInterviewer ? 'Submit application' : signingUp ? 'Create account' : 'Sign in'}</button>
        </form>
        ${!signingUp && !applyingAsInterviewer && !forgotPassword && !resettingPassword ? '<button class="forgot-link" id="forgotPassword" type="button">Forgot password?</button>' : ''}
        ${forgotPassword || resettingPassword || applyingAsInterviewer ? '<button class="back-login" id="backLogin" type="button">Back to sign in</button>' : `
          <div class="auth-divider"><span>or</span></div>
          <button class="google-button" id="googleBtn" type="button"><span class="google-letter">G</span>Continue with Google</button>
          <button class="interviewer-link" id="interviewerSignup" type="button">Apply as Interviewer</button>`}
        <p class="auth-foot">Secure session protection enabled</p>
        <p class="help-link">Need help? <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
        <p class="auth-copyright">${COPYRIGHT_TEXT}</p>
      </div>
    </section>
  </main>`);
  if ($('loginTab')) $('loginTab').onclick = () => { authMode = 'login'; authNotice = ''; renderAuth(); };
  if ($('signupTab')) $('signupTab').onclick = () => { authMode = 'signup'; authNotice = ''; renderAuth(); };
  if ($('forgotPassword')) $('forgotPassword').onclick = () => { authMode = 'forgot'; authNotice = ''; renderAuth(); };
  if ($('interviewerSignup')) $('interviewerSignup').onclick = () => { authMode = 'interviewer'; authNotice = ''; renderAuth(); };
  if ($('backLogin')) $('backLogin').onclick = () => { authMode = 'login'; resetToken = ''; authNotice = ''; renderAuth(); };
  $('authForm').onsubmit = (event) => {
    event.preventDefault();
    if (resettingPassword) return resetPassword();
    if (forgotPassword) return requestPasswordReset();
    if (applyingAsInterviewer) return submitInterviewerApplication();
    return signingUp ? signup() : login();
  };
  if ($('togglePassword')) $('togglePassword').onclick = () => {
    const password = $('password');
    const hidden = password.type === 'password';
    password.type = hidden ? 'text' : 'password';
    $('togglePassword').textContent = hidden ? 'Hide' : 'Show';
  };
  if ($('googleBtn')) $('googleBtn').onclick = () => { location.href = `${API}/api/auth/google`; };
}

function setAuthBusy(busy) {
  const button = $('submitAuth');
  if (!button) return;
  button.disabled = busy;
  if ($('googleBtn')) $('googleBtn').disabled = busy;
  button.textContent = busy
    ? 'Please wait...'
    : authMode === 'reset'
      ? 'Reset password'
      : authMode === 'forgot'
        ? 'Send reset link'
        : authMode === 'interviewer'
          ? 'Submit application'
        : authMode === 'signup'
          ? 'Create account'
          : 'Sign in';
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

async function submitInterviewerApplication() {
  setAuthBusy(true);
  try {
    const response = await api('/api/auth/interviewer-signup', {
      method: 'POST',
      body: JSON.stringify({
        name: $('name').value,
        email: $('email').value,
        contact_number: $('contactNumber').value,
        password: $('password').value,
        headline: $('applyHeadline').value || null,
        company: $('applyCompany').value || null,
        experience_years: Number($('applyExperience').value),
        expertise: $('applyExpertise').value,
        linkedin_url: $('applyLinkedin').value || null,
        bio: $('applyBio').value
      })
    });
    authMode = 'login';
    authNotice = response.message;
    renderAuth();
  } catch (error) {
    toast(error.message);
  } finally {
    setAuthBusy(false);
  }
}

async function requestPasswordReset() {
  setAuthBusy(true);
  try {
    const response = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: $('email').value })
    });
    authNotice = response.message;
    if (response.reset_url) {
      authNotice = `${response.message} Development reset link: ${response.reset_url}`;
    }
    renderAuth();
  } catch (error) {
    toast(error.message);
  } finally {
    setAuthBusy(false);
  }
}

async function resetPassword() {
  if ($('password').value !== $('confirmPassword').value) {
    toast('Passwords do not match.');
    return;
  }
  setAuthBusy(true);
  try {
    const response = await api('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: resetToken, password: $('password').value })
    });
    resetToken = '';
    authMode = 'login';
    authNotice = response.message;
    renderAuth();
  } catch (error) {
    toast(error.message);
  } finally {
    setAuthBusy(false);
  }
}

function render() {
  if (!user) return renderAuth();
  if (!roleCanOpen(view)) view = landingViewForRole();
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
      : view === 'admin'
        ? 'Admin Console'
      : view === 'interviewer'
        ? 'Interviewer Workspace'
      : view === 'ats'
        ? 'ATS Checker'
        : view === 'feedback'
        ? 'Feedback'
        : 'Settings';

  layout(`<div class="shell">
    <aside class="side">
      <div class="wordmark inverse side-wordmark"><span class="brand-mark">D</span><span>${BRAND_NAME}</span></div>
      <div class="user-block"><div class="avatar">${escapeHtml((user.name || 'A').charAt(0).toUpperCase())}</div><p>${escapeHtml(user.name)}<br><span>${escapeHtml(user.email)}</span></p></div>
      <div class="nav">
        ${navigationForRole()}
        <button id="logout">Logout</button>
      </div>
    </aside>
    <main class="main">
      <div class="topbar"><h1>${title}</h1><div class="sync-status"><span></span>Live sync</div></div>
      ${!['admin', 'interviewer', 'ats'].includes(view) ? `<div class="grid cols5 dashboard-filters">
        <button class="card stat-filter ${dashboardFilter === 'all' ? 'active' : ''}" data-filter="all"><span class="stat">${problems.length}</span><span class="muted">Problems</span></button>
        <button class="card stat-filter ${dashboardFilter === 'Solved' ? 'active' : ''}" data-filter="Solved"><span class="stat">${solved}</span><span class="muted">Solved</span></button>
        <button class="card stat-filter ${dashboardFilter === 'Learning' ? 'active' : ''}" data-filter="Learning"><span class="stat">${learning}</span><span class="muted">Learning</span></button>
        <button class="card stat-filter ${dashboardFilter === 'Revision' ? 'active' : ''}" data-filter="Revision"><span class="stat">${revision}</span><span class="muted">Revision</span></button>
        <button class="card stat-filter ${dashboardFilter === 'due' ? 'active' : ''}" data-filter="due"><span class="stat">${due}</span><span class="muted">Due Today</span></button>
      </div>` : ''}
      ${view === 'learn' ? '<section id="analytics" class="dashboard-analytics"></section>' : ''}
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
  if (view === 'learn') {
    renderAnalytics();
    renderLearn();
  }
  if (view === 'plan') renderPlan();
  if (view === 'mock') renderMockInterviews();
  if (view === 'ats') renderAtsChecker();
  if (view === 'feedback') renderFeedback();
  if (view === 'settings') renderSettings();
  if (view === 'admin') renderAdmin();
  if (view === 'interviewer') renderInterviewer();
}

function renderAnalytics() {
  const target = $('analytics');
  if (!target) return;
  const data = analytics || {
    current_streak: 0,
    active_days_this_week: 0,
    practiced_this_week: 0,
    total_practice_days: 0,
    activity: []
  };
  const activityByDate = new Map((data.activity || []).map((entry) => [dateValue(entry.activity_date), Number(entry.problems_practiced || 0)]));
  const recentDays = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - offset));
    const key = day.toLocaleDateString('en-CA');
    return {
      label: day.toLocaleDateString(undefined, { weekday: 'short' }),
      count: activityByDate.get(key) || 0
    };
  });
  const maxActivity = Math.max(1, ...recentDays.map((day) => day.count));
  const topicStats = [...new Set(problems.map((problem) => problemTopic(problem)))].map((topic) => {
    const topicProblems = problems.filter((problem) => problemTopic(problem) === topic);
    const attempted = topicProblems.filter((problem) => getProgress(problemId(problem)).status !== 'Not Attempted').length;
    const solved = topicProblems.filter((problem) => getProgress(problemId(problem)).status === 'Solved').length;
    return { topic, attempted, solved };
  }).filter((topic) => topic.attempted > 0)
    .sort((left, right) => (left.solved / left.attempted) - (right.solved / right.attempted))
    .slice(0, 3);
  const weakTopics = topicStats.length
    ? topicStats.map((topic) => `<div class="topic-progress"><span>${escapeHtml(topic.topic)}</span><b>${topic.solved}/${topic.attempted} solved</b><progress value="${topic.solved}" max="${topic.attempted}"></progress></div>`).join('')
    : '<p class="muted">Start a problem to reveal your focus topics.</p>';

  target.innerHTML = `<div class="analytics-metrics">
      <div class="metric streak"><span>Current streak</span><b>${Number(data.current_streak || 0)} days</b></div>
      <div class="metric"><span>Active days this week</span><b>${Number(data.active_days_this_week || 0)} / 7</b></div>
      <div class="metric"><span>Problems practiced this week</span><b>${Number(data.practiced_this_week || 0)}</b></div>
      <div class="metric"><span>Total practice days</span><b>${Number(data.total_practice_days || 0)}</b></div>
    </div>
    <div class="analytics-detail">
      <div class="card activity-card">
        <div class="section-head"><h2>Last 7 days</h2><span class="muted">Problems practiced</span></div>
        <div class="activity-chart">${recentDays.map((day) => `<div class="activity-day"><span>${day.count || ''}</span><i style="height:${Math.max(day.count ? 12 : 4, Math.round((day.count / maxActivity) * 78))}px"></i><small>${day.label}</small></div>`).join('')}</div>
      </div>
      <div class="card focus-card">
        <div class="section-head"><h2>Focus next</h2><span class="muted">Weak topics</span></div>
        ${weakTopics}
      </div>
    </div>`;
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
  $('content').innerHTML = `${studyPlans.length ? `<div class="card platform-plans">
    <h2>Published Study Plans</h2>
    <div class="plan-grid">${studyPlans.map((plan) => `<section class="published-plan">
      <div class="section-head"><h3>${escapeHtml(plan.title)}</h3><span class="badge">${Number(plan.duration_days)} days</span></div>
      <p class="muted">${escapeHtml(plan.description)}</p>
      <div>${plan.items.slice(0, 8).map((item) => {
        const problem = problems.find((entry) => problemId(entry) === String(item.problem_id).toLowerCase());
        return problem ? `<button class="plan-item" data-id="${escapeHtml(problemId(problem))}"><span>Day ${Number(item.day_number)}</span>${escapeHtml(problemName(problem))}</button>` : '';
      }).join('')}</div>
    </section>`).join('')}</div>
  </div>` : ''}<div class="card">
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
  document.querySelectorAll('#content .plan-item').forEach((element) => {
    element.onclick = () => selectProblem(element.dataset.id, true);
  });
}

function renderMockInterviews() {
  $('content').innerHTML = `<div class="mock-layout">
    <div class="card mock-form">
      <p class="overline">PRACTICE UNDER PRESSURE</p>
      <h2>Request a person-led mock interview</h2>
      <p class="muted">Choose your practice track and preferred slot. An assigned interviewer and Google Meet link will appear after confirmation.</p>
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
            <label class="disabled-option"><input type="radio" name="mockMode" value="AI" disabled><span>AI - Coming Soon</span></label>
            <label><input type="radio" name="mockMode" value="Person" checked><span>Person Interview</span></label>
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
        <button class="primary" id="mockSubmit" type="submit">Request interview</button>
      </form>
    </div>
    <div class="card mock-schedule">
      <div class="mock-head">
        <div>
          <p class="overline">REQUEST STATUS</p>
          <h2>Your interview requests</h2>
        </div>
        <span class="badge soon-badge">AI Coming Soon</span>
      </div>
      <div id="interviewRequests" class="mock-request-list"><p class="muted">Loading requests...</p></div>
    </div>
  </div>`;
  document.querySelectorAll('input[name="mockTrack"]').forEach((input) => {
    input.onchange = () => drawMockFocusAreas(input.value);
  });
  drawMockFocusAreas('DSA');
  $('mockForm').onsubmit = submitInterviewRequest;
  loadInterviewRequests();
}

function drawMockFocusAreas(track) {
  const select = $('mockFocus');
  if (!select) return;
  const areas = track === 'Development'
    ? ['Frontend Development', 'Backend Development', 'Full Stack Development', 'Database and SQL', 'API Design', 'System Design', 'Testing and Debugging', 'DevOps and Deployment']
    : [...new Set(problems.map((problem) => problemTopic(problem)))];
  select.innerHTML = areas.map((area) => `<option>${escapeHtml(area)}</option>`).join('');
}

function formatDateTime(value) {
  const time = new Date(value);
  return Number.isNaN(time.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(time);
}

async function loadInterviewRequests() {
  try {
    const data = await api('/api/mock-interviews');
    interviewRequests = data.interviews || [];
    drawInterviewRequests();
  } catch (error) {
    if ($('interviewRequests')) $('interviewRequests').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

function drawInterviewRequests() {
  const list = $('interviewRequests');
  if (!list) return;
  if (!interviewRequests.length) {
    list.innerHTML = '<p class="muted">No requests submitted yet.</p>';
    return;
  }
  list.innerHTML = interviewRequests.map((request) => `<article class="request-item">
    <div class="section-head"><b>${escapeHtml(request.focus_area)}</b><span class="badge ${escapeHtml(request.status)}">${escapeHtml(request.status)}</span></div>
    <p>${escapeHtml(request.interview_track)} | ${escapeHtml(request.interview_type)} | ${Number(request.duration_minutes)} minutes</p>
    <p class="muted">Preferred slot: ${escapeHtml(formatDateTime(request.scheduled_at))}</p>
    ${request.assigned_to ? `<p><b>Interviewer:</b> ${escapeHtml(request.assigned_to)}${request.interviewer_headline ? ` | ${escapeHtml(request.interviewer_headline)}` : ''}</p>` : ''}
    ${request.assignment_status ? `<p class="muted">Interviewer response: ${escapeHtml(request.assignment_status)}</p>` : ''}
    ${request.meeting_link ? `<a class="resource-link" href="${escapeHtml(request.meeting_link)}" target="_blank" rel="noopener noreferrer">Join Google Meet</a>` : `<p class="muted">${escapeHtml(interviewWaitingMessage(request))}</p>`}
    ${request.recommendation ? `<section class="scorecard">
      <div class="section-head"><b>Interview Scorecard</b><span class="badge">${escapeHtml(request.recommendation)}</span></div>
      <div class="score-grid"><span>Problem solving <b>${Number(request.problem_solving_score)}/5</b></span><span>Communication <b>${Number(request.communication_score)}/5</b></span><span>Coding quality <b>${Number(request.coding_quality_score)}/5</b></span><span>Fundamentals <b>${Number(request.fundamentals_score)}/5</b></span></div>
      <p><b>Strengths:</b> ${escapeHtml(request.strengths)}</p>
      <p><b>Improve:</b> ${escapeHtml(request.improvement_areas)}</p>
      <p><b>Practice next:</b> ${escapeHtml(request.recommended_practice)}</p>
    </section>` : ''}
    ${['Requested', 'Scheduled'].includes(request.status) ? `<button class="secondary cancel-request" data-id="${Number(request.id)}">Cancel request</button>` : ''}
  </article>`).join('');
  list.querySelectorAll('.cancel-request').forEach((button) => {
    button.onclick = async () => {
      try {
        await api(`/api/mock-interviews/${button.dataset.id}/cancel`, { method: 'PATCH' });
        toast('Interview request cancelled');
        await loadInterviewRequests();
      } catch (error) {
        toast(error.message);
      }
    };
  });
}

function interviewWaitingMessage(request) {
  if (request.status === 'Scheduled' && request.assignment_status === 'Pending') {
    return 'Waiting for the interviewer to confirm this scheduled slot.';
  }
  if (request.status === 'Scheduled' && request.assignment_status === 'Accepted') {
    return 'Meeting link is being prepared. Please refresh shortly.';
  }
  if (request.assignment_status === 'Declined') {
    return 'The interviewer declined. Admin will assign another matching slot.';
  }
  return 'Waiting for interviewer assignment and meeting link.';
}

async function submitInterviewRequest(event) {
  event.preventDefault();
  const scheduledAt = new Date(`${$('mockDate').value}T${$('mockTime').value}`);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    toast('Choose a future preferred time.');
    return;
  }
  const button = $('mockSubmit');
  button.disabled = true;
  button.textContent = 'Submitting...';
  try {
    const result = await api('/api/mock-interviews', {
      method: 'POST',
      body: JSON.stringify({
        interview_track: document.querySelector('input[name="mockTrack"]:checked').value,
        focus_area: $('mockFocus').value,
        interview_type: $('mockType').value,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: Number($('mockDuration').value),
        notes: $('mockNotes').value || null
      })
    });
    $('mockForm').reset();
    drawMockFocusAreas('DSA');
    toast(result.message);
    await loadInterviewRequests();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Request interview';
  }
}

async function renderAdmin() {
  $('content').innerHTML = '<div class="card"><p class="muted">Loading admin console...</p></div>';
  try {
    const [overview, usersData, problemsData, plansData, interviewsData, interviewerData] = await Promise.all([
      api('/api/admin/overview'),
      api('/api/admin/users'),
      api('/api/admin/problems'),
      api('/api/admin/study-plans'),
      api('/api/admin/mock-interviews'),
      api('/api/admin/interviewers')
    ]);
    if (view !== 'admin') return;
    drawAdmin(overview, usersData.users || [], problemsData.problems || [], plansData.plans || [], interviewsData.requests || [], interviewerData.interviewers || []);
  } catch (error) {
    $('content').innerHTML = `<div class="card"><p class="muted">${escapeHtml(error.message)}</p></div>`;
  }
}

function adminTabButton(id, label, count) {
  return `<button class="${adminTab === id ? 'active' : ''}" data-admin-tab="${id}" type="button">${label}${count !== undefined ? `<span>${Number(count)}</span>` : ''}</button>`;
}

function adminMetrics(overview) {
  return `<div class="admin-metrics">
      <div class="metric"><span>Registered users</span><b>${Number(overview.users)}</b></div>
      <div class="metric"><span>Active interviewers</span><b>${Number(overview.interviewers)}</b></div>
      <div class="metric"><span>Pending approvals</span><b>${Number(overview.pending_interviewers)}</b></div>
      <div class="metric"><span>Added problems</span><b>${Number(overview.added_problems)}</b></div>
      <div class="metric"><span>Study plans</span><b>${Number(overview.study_plans)}</b></div>
      <div class="metric"><span>Open interviews</span><b>${Number(overview.open_interviews)}</b></div>
    </div>`;
}

function adminProblemForm() {
  return `<div class="card admin-form">
    <h2>Add Problem</h2>
    <form id="adminProblemForm" class="grid">
      <div class="grid cols2"><label>Name<input id="newProblemName" required></label><label>Category<input id="newProblemCategory" required placeholder="Arrays"></label></div>
      <div class="grid cols2"><label>Difficulty<select id="newProblemDifficulty"><option>Easy</option><option>Medium</option><option>Hard</option></select></label><label>Rating<input id="newProblemRating" required placeholder="*****"></label></div>
      <label>Initial status<select id="newProblemStatus">${statusOptions.map((status) => `<option>${status}</option>`).join('')}</select></label>
      <label>Companies<input id="newProblemCompanies" required placeholder="Amazon, Google, Microsoft"></label>
      <label>Article link<input id="newProblemArticle" type="url" required></label>
      <label>Video link<input id="newProblemVideo" type="url" required></label>
      <button class="primary" type="submit">Publish problem</button>
    </form>
  </div>`;
}

function adminPlanForm() {
  return `<div class="card admin-form">
    <h2>Add Study Plan</h2>
    <form id="adminPlanForm" class="grid">
      <label>Plan title<input id="planTitle" required placeholder="30-Day Arrays to Graphs"></label>
      <label>Description<textarea id="planDescription" rows="3" required></textarea></label>
      <label>Duration in days<input id="planDuration" type="number" min="1" max="365" value="30" required></label>
      <label>Plan items <span class="muted">one per line: day | problem id</span><textarea id="planItems" rows="5" required placeholder="1 | 1&#10;2 | custom-problem-id"></textarea></label>
      <button class="primary" type="submit">Publish study plan</button>
    </form>
  </div>`;
}

function adminUsersTable(users) {
  return `<div class="card admin-table"><h2>Registered Users</h2><div class="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Provider</th><th>Joined</th><th>Solved</th></tr></thead><tbody>${users.map((account) => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.email)}</td><td>${escapeHtml(account.account_role)}</td><td>${escapeHtml(account.provider)}</td><td>${escapeHtml(dateValue(account.created_at))}</td><td>${Number(account.solved_problems || 0)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function adminInterviewerTable(interviewers) {
  return `<div class="card admin-table"><div class="section-head"><h2>Interviewer Applications</h2><span class="muted">Approve candidates before they can sign in</span></div>${interviewers.length ? `<div class="table-scroll"><table><thead><tr><th>Applicant</th><th>Expertise</th><th>Availability</th><th>Sessions</th><th>Status</th><th></th></tr></thead><tbody>${interviewers.map((interviewer) => {
    const approvalStatus = interviewer.is_active ? 'Active' : interviewer.approved_at ? 'Suspended' : 'Pending';
    const action = interviewer.is_active ? 'Suspend' : interviewer.approved_at ? 'Reactivate' : 'Approve';
    return `<tr><td>${escapeHtml(interviewer.name)}<br><span class="muted">${escapeHtml(interviewer.email)}</span></td><td>${escapeHtml(interviewer.expertise)}${interviewer.company ? `<br><span class="muted">${escapeHtml(interviewer.company)}</span>` : ''}${interviewer.bio ? `<br><span class="muted">${escapeHtml(interviewer.bio)}</span>` : ''}</td><td>${Number(interviewer.available_slots || 0)} slot(s)${interviewer.next_available_at ? `<br><span class="muted">Next: ${escapeHtml(formatDateTime(interviewer.next_available_at))}</span>` : ''}</td><td>${Number(interviewer.active_assignments || 0)}</td><td>${escapeHtml(approvalStatus)}</td><td><button class="secondary interviewer-status" data-id="${escapeHtml(interviewer.id)}" data-active="${interviewer.is_active ? 'true' : 'false'}">${action}</button></td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="muted">No interviewer applications submitted yet.</p>'}</div>`;
}

function adminProblemCatalog() {
  return `<div class="card admin-table"><div class="section-head"><h2>Problem Catalog IDs</h2><span class="muted">Use these ids in study plans</span></div><div class="table-scroll catalog-scroll"><table><thead><tr><th>ID</th><th>Problem</th><th>Topic</th><th>Difficulty</th></tr></thead><tbody>${problems.map((problem) => `<tr><td class="key-cell">${escapeHtml(problemId(problem))}</td><td>${escapeHtml(problemName(problem))}</td><td>${escapeHtml(problemTopic(problem))}</td><td>${escapeHtml(problemDifficulty(problem))}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function adminStudyPlans(plans) {
  return `<div class="card admin-table"><h2>Published Study Plans</h2>${plans.length ? plans.map((plan) => `<div class="admin-plan-row"><b>${escapeHtml(plan.title)}</b><span>${Number(plan.duration_days)} days</span><p class="muted">${escapeHtml(plan.description)}</p></div>`).join('') : '<p class="muted">No admin study plans published yet.</p>'}</div>`;
}

function adminInterviewRequests(requests, interviewers) {
  return `<div class="card interview-admin"><div class="section-head"><h2>Mock Interview Requests</h2><span class="muted">Admin assigns, interviewer schedules</span></div><p class="muted">Choose an interviewer for the request. The interviewer confirms the schedule, then Google Calendar creates the Meet link for the learner.</p>${requests.length ? requests.map((request) => `<form class="assignment" data-id="${Number(request.id)}">
      <div class="assignment-title"><b>${escapeHtml(request.user_name)}</b><span>${escapeHtml(request.user_email)} | ${escapeHtml(request.interview_track)} | ${escapeHtml(request.focus_area)} | ${escapeHtml(formatDateTime(request.scheduled_at))}</span></div>
      <div class="assignment-fields">
        <select name="interviewer_id"><option value="">Assign interviewer</option>${interviewers.filter((interviewer) => interviewer.is_active).map((interviewer) => `<option value="${escapeHtml(interviewer.id)}" ${request.interviewer_id === interviewer.id ? 'selected' : ''}>${escapeHtml(interviewer.name)} | ${escapeHtml(interviewer.expertise)}</option>`).join('')}</select>
        <button class="primary" type="submit">Assign interviewer</button>
      </div>
      <p class="muted">Status: ${escapeHtml(request.status)}${request.assignment_status ? ` | Interviewer response: ${escapeHtml(request.assignment_status)}` : ''}${request.meeting_link ? ' | Meet link ready' : ''}</p>
    </form>`).join('') : '<p class="muted">No mock interview requests yet.</p>'}</div>`;
}

function adminTabContent(overview, users, plans, requests, interviewers) {
  if (adminTab === 'users') return adminUsersTable(users);
  if (adminTab === 'content') return `<section class="admin-grid">${adminProblemForm()}${adminPlanForm()}</section>${adminProblemCatalog()}${adminStudyPlans(plans)}`;
  if (adminTab === 'interviewers') return adminInterviewerTable(interviewers);
  if (adminTab === 'interviews') return adminInterviewRequests(requests, interviewers);
  return `${adminMetrics(overview)}<section class="admin-grid">
      <div class="card admin-form">
        <h2>Quick Actions</h2>
        <p class="muted">Use the content tab to publish problems and study plans. Use mock interviews to schedule requests.</p>
        <div class="admin-action-list">
          <button class="secondary" data-admin-tab="content" type="button">Open content tools</button>
          <button class="secondary" data-admin-tab="interviews" type="button">Open mock interviews</button>
        </div>
      </div>
      <div class="card admin-form">
        <h2>Attention</h2>
        <p class="muted">${Number(overview.pending_interviewers)} interviewer approval(s) and ${Number(overview.open_interviews)} open interview request(s) need review.</p>
        <div class="admin-action-list">
          <button class="secondary" data-admin-tab="interviewers" type="button">Review interviewers</button>
          <button class="secondary" data-admin-tab="users" type="button">View users</button>
        </div>
      </div>
    </section>`;
}

function drawAdmin(overview, users, addedProblems, plans, requests, interviewers) {
  const pendingInterviewers = interviewers.filter((interviewer) => !interviewer.approved_at || !interviewer.is_active).length;
  $('content').innerHTML = `<div class="admin-tabs" role="tablist" aria-label="Admin sections">
      ${adminTabButton('overview', 'Overview')}
      ${adminTabButton('users', 'Users', users.length)}
      ${adminTabButton('content', 'Content', addedProblems.length + plans.length)}
      ${adminTabButton('interviewers', 'Interviewers', pendingInterviewers)}
      ${adminTabButton('interviews', 'Mock Interviews', requests.length)}
    </div>
    <div class="admin-panel">${adminTabContent(overview, users, plans, requests, interviewers)}</div>`;
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.onclick = () => {
      adminTab = button.dataset.adminTab;
      drawAdmin(overview, users, addedProblems, plans, requests, interviewers);
    };
  });
  if ($('adminProblemForm')) $('adminProblemForm').onsubmit = submitAdminProblem;
  if ($('adminPlanForm')) $('adminPlanForm').onsubmit = submitAdminPlan;
  document.querySelectorAll('.assignment').forEach((form) => {
    form.onsubmit = saveInterviewAssignment;
  });
  document.querySelectorAll('.interviewer-status').forEach((button) => {
    button.onclick = () => setInterviewerStatus(button);
  });
}

async function submitAdminProblem(event) {
  event.preventDefault();
  try {
    await api('/api/admin/problems', {
      method: 'POST',
      body: JSON.stringify({
        name: $('newProblemName').value,
        category: $('newProblemCategory').value,
        difficulty: $('newProblemDifficulty').value,
        rating: $('newProblemRating').value,
        companies: $('newProblemCompanies').value,
        article: $('newProblemArticle').value,
        video: $('newProblemVideo').value,
        status: $('newProblemStatus').value
      })
    });
    toast('Problem published');
    const custom = await api('/api/content/problems');
    problems = [...problems.filter((problem) => !String(problem.id || '').startsWith('custom-')), ...(custom.problems || [])];
    renderAdmin();
  } catch (error) {
    toast(error.message);
  }
}

async function submitAdminPlan(event) {
  event.preventDefault();
  const items = $('planItems').value.split('\n').filter((line) => line.trim()).map((line) => {
    const [day, id] = line.split('|').map((part) => part.trim());
    return { day_number: Number(day), problem_id: id };
  });
  const invalidItem = items.find((item) => !item.problem_id || item.day_number < 1 || item.day_number > Number($('planDuration').value)
    || !problems.some((problem) => problemId(problem) === item.problem_id.toLowerCase()));
  if (invalidItem) {
    toast('Use a valid catalog problem id and a day within the plan duration.');
    return;
  }
  try {
    await api('/api/admin/study-plans', {
      method: 'POST',
      body: JSON.stringify({
        title: $('planTitle').value,
        description: $('planDescription').value,
        duration_days: Number($('planDuration').value),
        items
      })
    });
    studyPlans = await api('/api/content/study-plans').then((result) => result.plans || []);
    toast('Study plan published');
    renderAdmin();
  } catch (error) {
    toast(error.message);
  }
}

async function saveInterviewAssignment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await api(`/api/admin/mock-interviews/${form.dataset.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        interviewer_id: form.elements.interviewer_id.value || null,
        admin_notes: null
      })
    });
    toast(result.message);
    renderAdmin();
  } catch (error) {
    toast(error.message);
  }
}

async function setInterviewerStatus(button) {
  try {
    const activating = button.dataset.active !== 'true';
    await api(`/api/admin/interviewers/${button.dataset.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: activating })
    });
    toast(activating ? 'Interviewer approved and activated' : 'Interviewer suspended');
    renderAdmin();
  } catch (error) {
    toast(error.message);
  }
}

async function renderInterviewer() {
  $('content').innerHTML = '<div class="card"><p class="muted">Loading interviewer workspace...</p></div>';
  try {
    const data = await api('/api/interviewer/dashboard');
    if (view !== 'interviewer') return;
    drawInterviewer(data.profile, data.availability || [], data.interviews || []);
  } catch (error) {
    $('content').innerHTML = `<div class="card"><p class="muted">${escapeHtml(error.message)}</p></div>`;
  }
}

function scoreSelect(name, label, selected) {
  return `<label>${label}<select name="${name}" required><option value="">Select score</option>${[1, 2, 3, 4, 5].map((score) => `<option value="${score}" ${Number(selected) === score ? 'selected' : ''}>${score} / 5</option>`).join('')}</select></label>`;
}

function statusBadgeClass(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function feedbackForm(interview) {
  return `<form class="scorecard-form grid" data-id="${Number(interview.id)}">
    <h3>${interview.recommendation ? 'Update submitted feedback' : 'Submit feedback'}</h3>
    <div class="grid cols4">${scoreSelect('problem_solving_score', 'Problem solving', interview.problem_solving_score)}${scoreSelect('communication_score', 'Communication', interview.communication_score)}${scoreSelect('coding_quality_score', 'Coding quality', interview.coding_quality_score)}${scoreSelect('fundamentals_score', 'Fundamentals', interview.fundamentals_score)}</div>
    <div class="grid cols2"><label>Strengths<textarea name="strengths" rows="3" required minlength="10">${escapeHtml(interview.strengths || '')}</textarea></label><label>Improvement areas<textarea name="improvement_areas" rows="3" required minlength="10">${escapeHtml(interview.improvement_areas || '')}</textarea></label></div>
    <label>Recommended practice<textarea name="recommended_practice" rows="2" required minlength="5">${escapeHtml(interview.recommended_practice || '')}</textarea></label>
    <label>Recommendation<select name="recommendation" required><option ${interview.recommendation === 'Needs Practice' ? 'selected' : ''}>Needs Practice</option><option ${interview.recommendation === 'Interview Ready' ? 'selected' : ''}>Interview Ready</option><option ${interview.recommendation === 'Strong Candidate' ? 'selected' : ''}>Strong Candidate</option></select></label>
    <button class="primary" type="submit">${interview.recommendation ? 'Update feedback' : 'Share feedback with learner'}</button>
  </form>`;
}

function interviewDetail(interview) {
  if (interview.assignment_status === 'Pending') {
    const acceptLabel = interview.status === 'Scheduled' ? 'Confirm schedule' : 'Accept assignment';
    return `<div class="interview-action-panel"><p class="muted">Review the request, then accept or decline the assignment.</p><div class="row session-response"><button class="primary interview-response" data-id="${Number(interview.id)}" data-response="Accepted">${acceptLabel}</button><button class="secondary interview-response" data-id="${Number(interview.id)}" data-response="Declined">Decline assignment</button></div></div>`;
  }
  if (interview.assignment_status === 'Accepted' && interview.status === 'Requested') {
    return '<div class="interview-action-panel"><p class="muted">Accepted. Waiting for admin to schedule and attach the meeting link.</p></div>';
  }
  if (interview.assignment_status === 'Accepted' && interview.status === 'Scheduled') {
    return `<div class="interview-action-panel"><div class="row session-response"><button class="primary interview-complete" data-id="${Number(interview.id)}">Mark interview completed</button></div></div>${feedbackForm(interview)}`;
  }
  if (interview.assignment_status === 'Accepted' && interview.status === 'Completed') {
    return feedbackForm(interview);
  }
  if (interview.assignment_status === 'Declined') {
    return '<div class="interview-action-panel"><p class="muted">You declined this assignment.</p></div>';
  }
  return '<div class="interview-action-panel"><p class="muted">No activity is available for this interview yet.</p></div>';
}
function drawInterviewer(profile, availability, interviews) {
  $('content').innerHTML = `<div class="interviewer-grid">
    <div class="card admin-form">
      <p class="overline">YOUR INTERVIEWER PROFILE</p>
      <h2>${escapeHtml(profile.name)}</h2>
      <form id="interviewerProfileForm" class="grid">
        <div class="grid cols2"><label>Headline<input name="headline" value="${escapeHtml(profile.headline || '')}"></label><label>Company<input name="company" value="${escapeHtml(profile.company || '')}"></label></div>
        <div class="grid cols2"><label>Experience (years)<input name="experience_years" type="number" min="0" max="70" required value="${Number(profile.experience_years || 0)}"></label><label>LinkedIn URL<input name="linkedin_url" type="url" value="${escapeHtml(profile.linkedin_url || '')}"></label></div>
        <label>Expertise<input name="expertise" required value="${escapeHtml(profile.expertise || '')}"></label>
        <label>Bio<textarea name="bio" rows="3">${escapeHtml(profile.bio || '')}</textarea></label>
        <button class="primary" type="submit">Save profile</button>
      </form>
    </div>
    <div class="card admin-form">
      <p class="overline">AVAILABILITY</p>
      <h2>Share open slots</h2>
      <form id="availabilityForm" class="grid">
        <div class="grid cols2"><label>Available from<input name="available_from" type="datetime-local" required></label><label>Available to<input name="available_to" type="datetime-local" required></label></div>
        <label>Note<input name="notes" maxlength="200" placeholder="Example: DSA rounds preferred"></label>
        <button class="primary" type="submit">Add available slot</button>
      </form>
      <div class="slot-list">${availability.length ? availability.map((slot) => `<div class="slot-row"><div><b>${escapeHtml(formatDateTime(slot.available_from))}</b><span>to ${escapeHtml(formatDateTime(slot.available_to))}${slot.notes ? ` | ${escapeHtml(slot.notes)}` : ''}</span></div>${slot.status === 'Available' ? `<button class="secondary remove-slot" data-id="${Number(slot.id)}">Remove</button>` : `<span class="badge">${escapeHtml(slot.status)}</span>`}</div>`).join('') : '<p class="muted">No future availability added yet.</p>'}</div>
    </div>
  </div>
  <div class="card interviewer-assignments">
    <div class="section-head"><h2>Assigned Mock Interviews</h2><span class="muted">Accept assigned requests. Admin schedules the booking after assignment and availability are confirmed.</span></div>
    ${interviews.length ? interviews.map((interview) => {
      const interviewId = String(interview.id);
      const expanded = expandedInterviewId === interviewId;
      return `<article class="interviewer-session ${expanded ? 'expanded' : ''}">
        <button class="interviewer-session-toggle" type="button" data-id="${escapeHtml(interviewId)}" aria-expanded="${expanded}">
          <span class="interview-main"><b>${escapeHtml(interview.candidate_name)} | ${escapeHtml(interview.focus_area)}</b><small>${escapeHtml(interview.candidate_email)}</small></span>
          <span class="interview-meta"><span>${escapeHtml(interview.interview_track)} | ${escapeHtml(interview.interview_type)}</span><span>${escapeHtml(formatDateTime(interview.scheduled_at))}</span></span>
          <span class="interview-statuses"><span class="badge ${escapeHtml(interview.status)} status-${statusBadgeClass(interview.status)}">${escapeHtml(interview.status)}</span>${interview.assignment_status ? `<span class="badge status-${statusBadgeClass(interview.assignment_status)}">${escapeHtml(interview.assignment_status)}</span>` : ''}${interview.recommendation ? '<span class="badge status-feedback">Feedback added</span>' : ''}</span>
          <span class="toggle-indicator">${expanded ? 'Collapse' : 'Open'}</span>
        </button>
        ${expanded ? `<div class="interviewer-session-detail">
          <div class="interview-detail-grid">
            <p><b>Candidate</b><span>${escapeHtml(interview.candidate_name)}<br>${escapeHtml(interview.candidate_email)}</span></p>
            <p><b>Session</b><span>${escapeHtml(interview.interview_track)} | ${escapeHtml(interview.interview_type)}<br>${escapeHtml(formatDateTime(interview.scheduled_at))}</span></p>
            <p><b>Status</b><span>${escapeHtml(interview.status)}${interview.assignment_status ? ` | ${escapeHtml(interview.assignment_status)}` : ''}</span></p>
          </div>
          ${interview.meeting_link ? `<a class="resource-link" href="${escapeHtml(interview.meeting_link)}" target="_blank" rel="noopener noreferrer">Join Google Meet</a>` : ''}
          ${interview.notes ? `<p class="candidate-note"><b>Candidate note</b><span>${escapeHtml(interview.notes)}</span></p>` : ''}
          ${interviewDetail(interview)}
        </div>` : ''}
      </article>`;
    }).join('') : '<p class="muted">No assignments yet. Your admin can assign matching interview requests to you.</p>'}  </div>`;
  $('interviewerProfileForm').onsubmit = submitInterviewerProfile;
  $('availabilityForm').onsubmit = submitAvailability;
  document.querySelectorAll('.remove-slot').forEach((button) => {
    button.onclick = () => removeAvailability(button.dataset.id);
  });
  document.querySelectorAll('.interviewer-session-toggle').forEach((button) => {
    button.onclick = () => {
      expandedInterviewId = expandedInterviewId === button.dataset.id ? null : button.dataset.id;
      drawInterviewer(profile, availability, interviews);
    };
  });
  document.querySelectorAll('.interview-response').forEach((button) => {
    button.onclick = () => respondToInterview(button.dataset.id, button.dataset.response);
  });
  document.querySelectorAll('.interview-complete').forEach((button) => {
    button.onclick = () => completeInterview(button.dataset.id);
  });
  document.querySelectorAll('.scorecard-form').forEach((form) => {
    form.onsubmit = submitInterviewFeedback;
  });
}

async function submitInterviewerProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await api('/api/interviewer/profile', {
      method: 'PUT',
      body: JSON.stringify({
        headline: form.elements.headline.value || null,
        company: form.elements.company.value || null,
        experience_years: Number(form.elements.experience_years.value),
        expertise: form.elements.expertise.value,
        linkedin_url: form.elements.linkedin_url.value || null,
        bio: form.elements.bio.value || null
      })
    });
    toast(result.message);
    renderInterviewer();
  } catch (error) {
    toast(error.message);
  }
}

async function submitAvailability(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await api('/api/interviewer/availability', {
      method: 'POST',
      body: JSON.stringify({
        available_from: new Date(form.elements.available_from.value).toISOString(),
        available_to: new Date(form.elements.available_to.value).toISOString(),
        notes: form.elements.notes.value || null
      })
    });
    toast(result.message);
    renderInterviewer();
  } catch (error) {
    toast(error.message);
  }
}

async function removeAvailability(id) {
  try {
    const result = await api(`/api/interviewer/availability/${id}`, { method: 'DELETE' });
    toast(result.message);
    renderInterviewer();
  } catch (error) {
    toast(error.message);
  }
}

async function respondToInterview(id, response) {
  try {
    const result = await api(`/api/interviewer/interviews/${id}/respond`, {
      method: 'PATCH',
      body: JSON.stringify({ response })
    });
    toast(result.message);
    renderInterviewer();
  } catch (error) {
    toast(error.message);
  }
}

async function completeInterview(id) {
  try {
    const result = await api(`/api/interviewer/interviews/${id}/complete`, { method: 'PATCH' });
    toast(result.message);
    renderInterviewer();
  } catch (error) {
    toast(error.message);
  }
}

async function submitInterviewFeedback(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await api(`/api/interviewer/interviews/${form.dataset.id}/feedback`, {
      method: 'PUT',
      body: JSON.stringify({
        problem_solving_score: Number(form.elements.problem_solving_score.value),
        communication_score: Number(form.elements.communication_score.value),
        coding_quality_score: Number(form.elements.coding_quality_score.value),
        fundamentals_score: Number(form.elements.fundamentals_score.value),
        strengths: form.elements.strengths.value,
        improvement_areas: form.elements.improvement_areas.value,
        recommended_practice: form.elements.recommended_practice.value,
        recommendation: form.elements.recommendation.value
      })
    });
    toast(result.message);
    renderInterviewer();
  } catch (error) {
    toast(error.message);
  }
}

function normalizeWords(value) {
  return String(value || '').toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}/g) || [];
}

function topKeywords(text, limit = 28) {
  const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'that', 'this', 'you', 'your', 'are', 'will', 'have', 'has', 'was', 'were', 'our', 'their', 'role', 'work', 'team', 'using', 'use', 'including', 'such', 'into', 'about', 'must', 'should', 'years', 'experience']);
  const counts = new Map();
  for (const word of normalizeWords(text)) {
    if (word.length < 3 || stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit).map(([word]) => word);
}

function sectionCheck(resume, label, patterns) {
  const found = patterns.some((pattern) => pattern.test(resume));
  return { label, found };
}

function analyzeAtsResume(resumeText, jobText) {
  const resume = resumeText.toLowerCase();
  const jobKeywords = topKeywords(jobText || resumeText, 32);
  const resumeWords = new Set(normalizeWords(resumeText));
  const matched = jobKeywords.filter((keyword) => resumeWords.has(keyword));
  const missing = jobKeywords.filter((keyword) => !resumeWords.has(keyword));
  const sections = [
    sectionCheck(resume, 'Contact details', [/@/, /\+?\d[\d\s-]{7,}/, /linkedin\.com/i]),
    sectionCheck(resume, 'Skills', [/\bskills\b/, /technical skills/, /technologies/]),
    sectionCheck(resume, 'Experience', [/\bexperience\b/, /employment/, /work history/]),
    sectionCheck(resume, 'Projects', [/\bprojects?\b/, /portfolio/]),
    sectionCheck(resume, 'Education', [/\beducation\b/, /degree/, /university/, /college/])
  ];
  const actionVerbs = ['built', 'developed', 'designed', 'optimized', 'implemented', 'deployed', 'improved', 'reduced', 'increased', 'automated', 'led'];
  const hasMetrics = /\b\d+%|\b\d+x|\b\d+\+|\b\d+ users|\b\d+ ms|\b\d+ seconds|\b\d+ projects/i.test(resumeText);
  const verbCount = actionVerbs.filter((verb) => resumeWords.has(verb)).length;
  const keywordScore = jobKeywords.length ? Math.round((matched.length / jobKeywords.length) * 45) : 28;
  const sectionScore = sections.filter((section) => section.found).length * 7;
  const impactScore = Math.min(20, (hasMetrics ? 10 : 0) + Math.min(10, verbCount * 2));
  const lengthScore = resumeText.length > 1200 && resumeText.length < 9000 ? 10 : resumeText.length >= 600 ? 6 : 2;
  const score = Math.min(100, keywordScore + sectionScore + impactScore + lengthScore);
  const suggestions = [];
  if (missing.length) suggestions.push(`Add important job keywords naturally: ${missing.slice(0, 8).join(', ')}.`);
  if (!hasMetrics) suggestions.push('Add measurable impact: percentages, user count, latency, revenue, time saved, or scale.');
  if (verbCount < 4) suggestions.push('Start more bullet points with strong action verbs like built, optimized, deployed, improved, or automated.');
  for (const section of sections.filter((item) => !item.found)) suggestions.push(`Add a clear ${section.label} section heading.`);
  if (resumeText.length < 1200) suggestions.push('Resume text looks short. Add project details, responsibilities, tools, and outcomes.');
  return { score, matched, missing, sections, suggestions: suggestions.slice(0, 7), keywordCount: jobKeywords.length };
}

function ratioPercent(item) {
  return Math.min(100, Math.round((Number(item.score || 0) / Math.max(1, Number(item.max || 1))) * 100));
}

function atsStatus(value) {
  return value ? 'Found' : 'Missing';
}

function atsResultMarkup(result) {
  const breakdown = result.breakdown || [];
  const contacts = result.contacts || {};
  const readability = result.readability || {};
  const targetRoles = result.targetRoles || [];
  const roleMatches = result.roleMatches || [];
  const matched = (result.matched || []).map((item) => typeof item === 'string' ? { word: item, importance: 'Medium' } : item);
  const missing = (result.missing || []).map((item) => typeof item === 'string' ? { word: item, importance: 'Medium' } : item);
  return `<div class="ats-score-card ${result.score >= 72 ? 'strong' : result.score >= 58 ? 'average' : 'risk'}">
    <div><span>${escapeHtml(result.rating || 'ATS Score')}</span><b>${Number(result.score || 0)}</b><small>/ 100</small></div>
    <p>${escapeHtml(result.summary || 'ATS report generated.')}</p>
  </div>
  <div class="ats-panel"><h3>Score Breakdown</h3><div class="ats-breakdown">${breakdown.map((item) => `<div class="ats-breakdown-row"><div><b>${escapeHtml(item.label)}</b><span>${Number(item.score || 0)} / ${Number(item.max || 0)}</span></div><progress value="${ratioPercent(item)}" max="100"></progress></div>`).join('')}</div></div>
  <div class="ats-grid">
    <div class="ats-panel"><h3>Target Role Match</h3>${targetRoles.length ? `<p>${roleMatches.length} of ${targetRoles.length} target role signals found.</p><div class="chip-list">${targetRoles.map((role) => `<span class="${roleMatches.includes(role) ? '' : 'missing-chip'}">${escapeHtml(role)}</span>`).join('')}</div>` : '<p class="muted">Paste a job description to detect role alignment.</p>'}</div>
    <div class="ats-panel"><h3>Resume Signals</h3><div class="ats-metrics"><span><b>${Number(readability.wordCount || 0)}</b> words</span><span><b>${Number(readability.bulletCount || 0)}</b> bullets</span><span><b>${Number(readability.metricCount || 0)}</b> metrics</span><span><b>${Number(readability.actionVerbCount || 0)}</b> action verbs</span></div></div>
  </div>
  <div class="ats-grid">
    <div class="ats-panel"><h3>Matched Keywords</h3><p><b>${matched.length}</b> matched from ${Number(result.keywordCount || 0)} tracked keywords</p><div class="chip-list">${matched.length ? matched.map((item) => `<span>${escapeHtml(item.word)} <small>${escapeHtml(item.importance || '')}</small></span>`).join('') : '<em>No strong keyword matches yet.</em>'}</div></div>
    <div class="ats-panel"><h3>Missing Keywords</h3><p>Add these only where they are truthful.</p><div class="chip-list warning">${missing.length ? missing.map((item) => `<span>${escapeHtml(item.word)} <small>${escapeHtml(item.importance || '')}</small></span>`).join('') : '<em>No major keyword gaps found.</em>'}</div></div>
  </div>
  <div class="ats-grid">
    <div class="ats-panel"><h3>Contact & Profiles</h3><div class="section-checks">${Object.entries(contacts).map(([label, found]) => `<span class="${found ? 'ok' : 'missing'}">${atsStatus(found)} ${escapeHtml(label)}</span>`).join('')}</div></div>
    <div class="ats-panel"><h3>Parser & Formatting</h3><div class="ats-check-list">${(result.formatting || []).map((item) => `<div class="${item.ok ? 'ok' : 'missing'}"><b>${item.ok ? 'OK' : 'Fix'} ${escapeHtml(item.label)}</b><span>${escapeHtml(item.message)}</span></div>`).join('')}</div></div>
  </div>
  <div class="ats-panel"><h3>Resume Sections</h3><div class="section-checks">${(result.sections || []).map((section) => `<span class="${section.found ? 'ok' : 'missing'}">${section.found ? 'Found' : 'Missing'} ${escapeHtml(section.label)}</span>`).join('')}</div></div>
  <div class="ats-panel"><h3>Priority Fixes</h3><div class="ats-fixes">${(result.suggestions || []).map((item) => `<article class="ats-fix ${String(item.priority || '').toLowerCase()}"><span>${escapeHtml(item.priority || 'Fix')}</span><div><b>${escapeHtml(item.title || '')}</b><p>${escapeHtml(item.detail || item)}</p></div></article>`).join('')}</div></div>`;
}
function renderAtsChecker() {
  $('content').innerHTML = `<div class="ats-layout">
    <div class="card ats-form-card">
      <p class="overline">RESUME OPTIMIZATION</p>
      <h2>Upload resume for ATS stats</h2>
      <p class="muted">Upload a PDF or text resume, paste the target job description, and get a production-style ATS report with match score, parsing checks, role alignment, and priority fixes.</p>
      <form id="atsForm" class="grid">
        <label>Resume file
          <input id="resumeFile" type="file" accept=".pdf,.txt,.md,.text,application/pdf,text/plain">
        </label>
        <label>Resume text
          <textarea id="resumeText" rows="10" placeholder="Text appears here after upload when readable. You can also paste or edit it manually." required></textarea>
        </label>
        <label>Job description / target role
          <textarea id="jobText" rows="8" placeholder="Paste the full job description. The ATS score is most accurate when this is included."></textarea>
        </label>
        <button class="primary" type="submit">Check ATS Stats</button>
      </form>
    </div>
    <div class="card ats-result-card" id="atsResult">
      <h2>ATS report</h2>
      <p class="muted">Upload a resume and paste a job description to see ATS score, role match, parsing quality, contact signals, keyword gaps, and priority fixes.</p>
    </div>
  </div>`;
  $('resumeFile').onchange = () => {
    const file = $('resumeFile').files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isText = file.type.startsWith('text/') || /\.(txt|md|text)$/i.test(file.name);
    if (!isPdf && !isText) {
      toast('Please upload a PDF, TXT, or MD resume file.');
      $('resumeFile').value = '';
      return;
    }
    if (isPdf) {
      $('resumeText').value = '';
      $('resumeText').placeholder = 'PDF selected. Text will be extracted when you check ATS stats.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { $('resumeText').value = String(reader.result || ''); };
    reader.onerror = () => toast('Could not read resume file.');
    reader.readAsText(file);
  };
  $('atsForm').onsubmit = async (event) => {
    event.preventDefault();
    const file = $('resumeFile').files?.[0];
    const resumeText = $('resumeText').value.trim();
    if (!file && resumeText.length < 300) {
      toast('Upload a resume file or paste fuller resume text before checking ATS stats.');
      return;
    }
    const button = $('atsForm').querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Checking...';
    try {
      const formData = new FormData();
      if (file) formData.append('resume', file);
      formData.append('resume_text', resumeText);
      formData.append('job_text', $('jobText').value.trim());
      const response = await fetch(`${API}/api/ats/check`, { method: 'POST', credentials: 'include', body: formData });
      const payload = await response.json().catch(() => ({ message: 'ATS check failed' }));
      if (!response.ok) throw new Error(payload.message || 'ATS check failed');
      if (payload.extracted_text && !resumeText) $('resumeText').value = payload.extracted_text;
      $('atsResult').innerHTML = atsResultMarkup(payload.result);
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Check ATS Stats';
    }
  };
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
