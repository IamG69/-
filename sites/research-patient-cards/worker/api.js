'use strict';
async function api(url, options = {}) {
  const target = new URL(url, window.location.href);
  if (target.origin !== window.location.origin) throw new Error('API должен использовать адрес текущего приложения.');
  let response;
  try {
    response = await fetch(target.href, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...options.headers } });
  } catch {
    throw new Error('Нет связи с приложением. Сохранение не подтверждено: проверьте список записей перед повтором.');
  }
  const json = (response.headers.get('content-type') || '').includes('application/json');
  if (response.redirected || response.status === 401 || response.status === 403) {
    throw new Error(`Сессия приложения недоступна (HTTP ${response.status}). Войдите в ChatGPT и откройте приложение заново; введённые данные остаются в форме.`);
  }
  let body;
  if (json) {
    try { body = await response.json(); } catch { throw new Error(`Некорректный ответ API (HTTP ${response.status}). Сохранение не подтверждено.`); }
  }
  if (!response.ok) {
    const detail = body && body.detail;
    throw new Error(typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : `Сервер вернул HTTP ${response.status}. Сохранение не подтверждено: проверьте список записей перед повтором.`);
  }
  if (!json) throw new Error(`Сервер вернул страницу вместо ответа API (HTTP ${response.status}). Войдите в ChatGPT и откройте приложение заново; введённые данные остаются в форме.`);
  return body;
}
