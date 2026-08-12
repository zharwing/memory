const searchInput = document.querySelector("[data-docs-search]");
const searchStatus = document.querySelector("[data-search-status]");
const searchResults = document.querySelector("[data-search-results]");
const searchIndexUrl = document.body.dataset.searchIndex;
let searchIndexPromise;

function loadSearchIndex() {
  if (!searchIndexUrl) return Promise.reject(new Error("Search index is unavailable."));
  searchIndexPromise ??= fetch(searchIndexUrl, {
    credentials: "omit",
    headers: { accept: "application/json" }
  }).then((response) => {
    if (!response.ok) throw new Error("Search index is unavailable.");
    return response.json();
  }).then((value) => {
    if (value?.schema !== "zharwing.public-doc-search.v1" || !Array.isArray(value.guides)) {
      throw new Error("Search index is invalid.");
    }
    return value.guides;
  });
  return searchIndexPromise;
}

async function updateSearch() {
  if (!searchInput || !searchStatus || !searchResults) return;
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    searchStatus.textContent = "";
    searchResults.replaceChildren();
    searchResults.hidden = true;
    return;
  }

  searchStatus.textContent = "Searching public guides…";
  try {
    const guides = await loadSearchIndex();
    const matches = guides.filter((guide) => [
      guide.title,
      guide.description,
      guide.group,
      ...(Array.isArray(guide.headings) ? guide.headings : [])
    ].join(" ").toLowerCase().includes(query)).slice(0, 12);

    const fragment = document.createDocumentFragment();
    for (const guide of matches) {
      const link = document.createElement("a");
      link.href = guide.path;
      const title = document.createElement("strong");
      title.textContent = guide.title;
      const description = document.createElement("span");
      description.textContent = guide.description;
      link.append(title, description);
      fragment.append(link);
    }
    searchResults.replaceChildren(fragment);
    searchResults.hidden = false;
    searchStatus.textContent = `${matches.length} ${matches.length === 1 ? "guide" : "guides"} found`;
  } catch {
    searchResults.replaceChildren();
    searchResults.hidden = true;
    searchStatus.textContent = "Search is unavailable. All guides remain linked below.";
  }
}

searchInput?.addEventListener("input", updateSearch);
searchInput?.addEventListener("focus", () => { void loadSearchIndex().catch(() => undefined); }, { once: true });

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

const tocLinks = [...document.querySelectorAll(".docs-toc a[href^='#']")];
const headings = tocLinks.map((link) => document.querySelector(link.hash)).filter(Boolean);
if ("IntersectionObserver" in window && headings.length) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.find((entry) => entry.isIntersecting);
    if (!visible) return;
    tocLinks.forEach((link) => link.classList.toggle("active", link.hash === `#${visible.target.id}`));
  }, { rootMargin: "-110px 0px -72%", threshold: 0 });
  headings.forEach((heading) => observer.observe(heading));
}

window.addEventListener("keydown", (event) => {
  if (event.key === "/" && searchInput && !event.metaKey && !event.ctrlKey && !event.altKey && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});

// Styling enhancements are activated only after their interactions exist.
document.documentElement.classList.add("js");
