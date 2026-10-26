// Small fetch wrapper shared by the public site and the admin panel.
// All requests go to /api (proxied to PHP in development, same origin in production).
const BASE = '/api';
let csrf = null;

export class ApiError extends Error {
  constructor(status, message, fields = {}, code = '') {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

export const setCsrf = (t) => { csrf = t; };

async function parse(res, path = '') {
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    if (res.status === 404 && body === null && path.startsWith('/auth/')) {
      throw new ApiError(404, 'The admin needs the PHP backend, which is not available on this site.');
    }
    const fallback = res.status >= 500 ? 'The server had a problem. Please try again.' : 'The request could not be completed.';
    throw new ApiError(res.status, body?.error?.message || fallback, body?.error?.fields || {}, body?.error?.code || '');
  }
  return body;
}

async function request(path, { method = 'GET', body, signal, retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: payload, signal, credentials: 'same-origin', cache: 'no-store' });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Could not reach the server. Check your connection and that the backend is running.');
  }
  try {
    return await parse(res, path);
  } catch (e) {
    if (e.code === 'csrf' && retry) {
      const me = await request('/auth/me', { retry: false });
      setCsrf(me.csrf);
      return request(path, { method, body, signal, retry: false });
    }
    throw e;
  }
}

export const api = {
  get: (p, o) => request(p, o),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body }),
  patch: (p, body, o) => request(p, { ...o, method: 'PATCH', body }),
  put: (p, body, o) => request(p, { ...o, method: 'PUT', body }),
  del: (p, o) => request(p, { ...o, method: 'DELETE' }),
  /** multipart upload with progress (XHR, because fetch cannot report upload progress) */
  upload(path, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', BASE + path);
      xhr.setRequestHeader('Accept', 'application/json');
      if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
      xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection and try again.'));
      xhr.onload = () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new ApiError(xhr.status, body?.error?.message || 'Upload failed.', body?.error?.fields || {}, body?.error?.code || ''));
      };
      xhr.send(formData);
    });
  },
};
