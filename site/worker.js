export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/privacy' || path === '/privacy/') {
      return env.ASSETS.fetch(new Request(new URL('/privacy.html', url.origin)));
    }

    // Let assets handle everything else (index.html, etc.)
    return env.ASSETS.fetch(request);
  }
};
