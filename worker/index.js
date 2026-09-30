export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Serve index.html for root path
    if (path === "/" || path === "") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    // Deep scan page
    if (path === "/deep-scan" || path === "/deep-scan/") {
      return env.ASSETS.fetch(new Request(new URL("/deep-scan.html", url), request));
    }

    // Serve blog.html for /blog or /blog/
    if (path === "/blog" || path === "/blog/") {
      return env.ASSETS.fetch(new Request(new URL("/blog.html", url), request));
    }

    // Serve contact.html for /contact or /contact/
    if (path === "/contact" || path === "/contact/") {
      return env.ASSETS.fetch(new Request(new URL("/contact.html", url), request));
    }

    // Everything else: serve as-is from assets
    return env.ASSETS.fetch(request);
  }
};
