export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Homepage
    if (path === "/" || path === "") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    // Deep Scan page
    if (path === "/deep-scan" || path === "/deep-scan/") {
      return env.ASSETS.fetch(new Request(new URL("/deep-scan.html", url), request));
    }

    // Blog index
    if (path === "/blog" || path === "/blog/") {
      return env.ASSETS.fetch(new Request(new URL("/blog.html", url), request));
    }

    // Contact
    if (path === "/contact" || path === "/contact/") {
      return env.ASSETS.fetch(new Request(new URL("/contact.html", url), request));
    }

    // About
    if (path === "/about" || path === "/about/") {
      return env.ASSETS.fetch(new Request(new URL("/about.html", url), request));
    }

    // Privacy Policy
    if (path === "/privacy-policy" || path === "/privacy-policy/") {
      return env.ASSETS.fetch(new Request(new URL("/privacy-policy.html", url), request));
    }

    // Terms of Service
    if (path === "/terms" || path === "/terms/") {
      return env.ASSETS.fetch(new Request(new URL("/terms.html", url), request));
    }

    // Delete History
    if (path === "/delete-history" || path === "/delete-history/") {
      return env.ASSETS.fetch(new Request(new URL("/delete-history.html", url), request));
    }

    // Blog articles: /blog/slug -> /blog/slug.html
    if (path.startsWith("/blog/") && !path.endsWith(".html")) {
      const htmlPath = path + ".html";
      return env.ASSETS.fetch(new Request(new URL(htmlPath, url), request));
    }

    // Everything else: serve as-is from assets
    return env.ASSETS.fetch(request);
  }
};
