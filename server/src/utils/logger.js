const secretKeys = ['authorization', 'cookie', 'client_secret', 'refresh_token', 'access_token', 'password', 'token'];

function maskValue(key, value) {
  if (value == null) return value;
  const normalized = String(key).toLowerCase();
  if (!secretKeys.some((secret) => normalized.includes(secret))) return value;
  const text = String(value);
  if (text.length <= 8) return '[redacted]';
  return `${text.slice(0, 4)}...[redacted]...${text.slice(-4)}`;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, typeof entry === 'object' ? sanitize(entry) : maskValue(key, entry)])
  );
}

function write(level, message, meta = {}) {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...sanitize(meta)
  };
  const line = JSON.stringify(payload);
  if (level === 'error') return console.error(line);
  if (level === 'warn') return console.warn(line);
  return console.log(line);
}

export const logger = {
  info(message, meta) {
    write('info', message, meta);
  },
  warn(message, meta) {
    write('warn', message, meta);
  },
  error(message, meta) {
    write('error', message, meta);
  }
};
