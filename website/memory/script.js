const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-button");
const siteNav = document.querySelector(".site-nav");

const updateHeader = () => {
  header?.classList.toggle("scrolled", window.scrollY > 12);
};

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  siteNav?.classList.toggle("open", !open);
});

siteNav?.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLAnchorElement)) return;
  menuButton?.setAttribute("aria-expanded", "false");
  siteNav.classList.remove("open");
});

const revealItems = [...document.querySelectorAll(".reveal")];
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8%", threshold: 0.08 }
  );
  revealItems.forEach((item) => {
    item.dataset.revealReady = "true";
    revealObserver.observe(item);
  });
} else {
  revealItems.forEach((item) => item.classList.add("visible"));
}

const tourSelect = document.querySelector("[data-tour-select]");
const tourPanels = [...document.querySelectorAll("[data-tour-panel]")];
const selectTourPanel = () => {
  if (!tourSelect) return;
  const selected = tourSelect.value;
  for (const panel of tourPanels) {
    panel.dataset.active = String(panel.dataset.tourPanel === selected);
  }
};
tourSelect?.addEventListener("change", selectTourPanel);
selectTourPanel();

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const id = button.getAttribute("data-copy");
    const target = id ? document.getElementById(id) : null;
    if (!target) return;

    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(target.textContent || "");
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select manually";
    }
    window.setTimeout(() => {
      button.textContent = original;
    }, 1800);
  });
}

const sectionLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
const sections = sectionLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window && sections.length) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) return;
      sectionLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`);
      });
    },
    { rootMargin: "-25% 0px -62%", threshold: [0.01, 0.2, 0.5] }
  );
  sections.forEach((section) => navObserver.observe(section));
}

// Capability styling is activated only after every essential interaction has
// been wired. If this script is blocked or fails earlier, navigation, content,
// screenshots, and reveal items remain visible in their usable HTML defaults.
document.documentElement.classList.add("js");
