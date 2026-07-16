(function installDashboardAuthentication() {
  const originalFetch = window.fetch.bind(window);

  function readCookie(name) {
    const prefix = name + '=';
    const item = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  }

  window.fetch = function authenticatedFetch(input, init) {
    const options = { ...(init || {}) };
    const method = String(options.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input?.url || '';
    const sameOrigin = !/^https?:\/\//i.test(url) || url.startsWith(window.location.origin);
    if (sameOrigin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
      const csrf = readCookie('hotel_csrf');
      if (csrf) headers.set('X-CSRF-Token', csrf);
      options.headers = headers;
    }
    return originalFetch(input, options).then(response => {
      if (response.status === 401 && !location.pathname.startsWith('/login')) location.href = '/login';
      return response;
    });
  };
})();
