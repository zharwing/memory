const articles = [...document.querySelectorAll("[data-doc]")];
const docLinks = [...document.querySelectorAll("[data-doc-link]")];
const searchInput = document.querySelector("[data-docs-search]");
const searchStatus = document.querySelector("[data-search-status]");
const activeToc = document.querySelector("[data-active-toc]");
const editLink = document.querySelector("[data-edit-link]");
const sidebar = document.querySelector("[data-docs-sidebar]");
const sidebarToggle = document.querySelector("[data-sidebar-toggle]");
const sidebarBackdrop = document.querySelector("[data-sidebar-backdrop]");
const menuButton = document.querySelector(".menu-button");
const siteNav = document.querySelector(".site-nav");

let headingObserver;

function parseRoute() {
  let route = "";
  try {
    route = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    route = "";
  }
  const [slug = "home", section = ""] = route.split("/");
  return { slug: slug || "home", section };
}

function closeSidebar() {
  sidebar?.classList.remove("open");
  sidebarBackdrop?.classList.remove("open");
  sidebarToggle?.setAttribute("aria-expanded", "false");
  document.body.style.removeProperty("overflow");
}

function setToc(article) {
  if (!activeToc || !editLink) return;
  const template = article.querySelector("template[data-toc]");
  activeToc.innerHTML = template?.innerHTML || '<span class="toc-empty">This page is a guide index.</span>';

  const source = article.querySelector('.article-meta a[href*="github.com"]');
  editLink.href = source?.href || "https://github.com/zharwing/memory";
  editLink.textContent = source ? "View source on GitHub ↗" : "GitHub repository ↗";

  headingObserver?.disconnect();
  const headingLinks = [...activeToc.querySelectorAll("a")];
  const headings = headingLinks
    .map((link) => {
      const section = link.hash.split("/")[1];
      return section ? document.getElementById(`${article.dataset.doc}--${section}`) : null;
    })
    .filter(Boolean);

  if (!("IntersectionObserver" in window) || !headings.length) return;
  headingObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (!visible) return;
      headingLinks.forEach((link) => {
        link.classList.toggle("active", link.hash.endsWith(`/${visible.target.id.split("--")[1]}`));
      });
    },
    { rootMargin: "-110px 0px -72%", threshold: 0 }
  );
  headings.forEach((heading) => headingObserver.observe(heading));
}

function showRoute({ slug, section }, shouldScroll = true) {
  let activeArticle = articles.find((article) => article.dataset.doc === slug);
  if (!activeArticle) {
    window.history.replaceState(null, "", "#home");
    activeArticle = articles.find((article) => article.dataset.doc === "home");
    slug = "home";
    section = "";
  }

  for (const article of articles) article.hidden = article !== activeArticle;
  for (const link of docLinks) link.classList.toggle("active", link.hash === `#${slug}`);
  document.querySelector(".docs-home-link")?.classList.toggle("active", slug === "home");
  setToc(activeArticle);
  closeSidebar();

  const articleTitle = activeArticle.querySelector("h1")?.textContent?.trim();
  document.title = slug === "home" ? "Zharwing Memory documentation" : `${articleTitle} — Zharwing Memory documentation`;

  if (!shouldScroll) return;
  requestAnimationFrame(() => {
    const target = section ? document.getElementById(`${slug}--${section}`) : null;
    if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
    else window.scrollTo({ top: 0, behavior: "auto" });
  });
}

window.addEventListener("hashchange", () => showRoute(parseRoute()));
showRoute(parseRoute(), false);

searchInput?.addEventListener("input", () => {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;

  for (const link of docLinks) {
    const slug = link.hash.slice(1);
    const article = articles.find((candidate) => candidate.dataset.doc === slug);
    const haystack = `${link.dataset.title || ""} ${link.dataset.description || ""} ${article?.textContent || ""}`.toLowerCase();
    const matches = !query || haystack.includes(query);
    link.hidden = !matches;
    if (matches) visible += 1;
  }

  for (const group of document.querySelectorAll(".docs-nav-group")) {
    group.hidden = ![...group.querySelectorAll("[data-doc-link]")].some((link) => !link.hidden);
  }

  if (searchStatus) searchStatus.textContent = query ? `${visible} ${visible === 1 ? "guide" : "guides"} found` : "";
});

searchInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const firstMatch = docLinks.find((link) => !link.hidden);
  if (firstMatch) window.location.hash = firstMatch.hash;
});

sidebarToggle?.addEventListener("click", () => {
  const open = sidebarToggle.getAttribute("aria-expanded") === "true";
  sidebarToggle.setAttribute("aria-expanded", String(!open));
  sidebar?.classList.toggle("open", !open);
  sidebarBackdrop?.classList.toggle("open", !open);
  document.body.style.overflow = open ? "" : "hidden";
});
sidebarBackdrop?.addEventListener("click", closeSidebar);
sidebar?.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("a")) closeSidebar();
});

menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  siteNav?.classList.toggle("open", !open);
});
siteNav?.addEventListener("click", () => {
  menuButton?.setAttribute("aria-expanded", "false");
  siteNav.classList.remove("open");
});

for (const toc of document.querySelectorAll("[data-mobile-toc]")) {
  const button = toc.querySelector("button");
  button?.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    toc.classList.toggle("open", !open);
  });
}

for (const button of document.querySelectorAll("[data-copy-code]")) {
  button.addEventListener("click", async () => {
    const code = button.closest(".code-block")?.querySelector("code")?.textContent || "";
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select manually";
    }
    window.setTimeout(() => { button.textContent = original; }, 1600);
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput?.focus();
  }
  if (event.key === "Escape") closeSidebar();
});
