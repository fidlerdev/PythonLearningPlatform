export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить действие. Попробуй ещё раз.';
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(describe).join(' ');
  if (value && typeof value === 'object') return Object.entries(value).map(([k, v]) => k === 'detail' || k === 'non_field_errors' ? describe(v) : `${k}: ${describe(v)}`).join('\n');
  return 'Ошибка запроса';
}

export async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1];
  const response = await fetch(`/api/${path}`, {
    method, credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRFToken': decodeURIComponent(token) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) throw new Error(describe(await response.json()));
    if (response.status === 403) throw new Error('Сервер отклонил запрос при проверке доступа или безопасности. Обнови страницу и попробуй снова.');
    if (response.status === 401) throw new Error('Нужно войти в учётную запись заново.');
    throw new Error(`Сервер вернул ошибку (${response.status}). Попробуй ещё раз.`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
