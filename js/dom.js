const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// kind : 'localStorage' ou 'sessionStorage'. Le stockage peut être indisponible
// (navigation privée, données bloquées) : on ignore silencieusement.
export function storageGet(kind, key) {
  try {
    return window[kind].getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(kind, key, value) {
  try {
    window[kind].setItem(key, value);
  } catch {
    // stockage indisponible
  }
}

export function randomId(prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return prefix + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
