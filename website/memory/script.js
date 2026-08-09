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
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("visible"));
}

const tourContent = {
  graph: {
    src: "assets/context-graph-v2.jpg",
    alt: "Zharwing Memory context graph focused on the fictional EchoDesk transcription service",
    caption:
      "Focus a graph on one service to inspect the decisions, specifications, diagrams, and repository evidence connected to it."
  },
  docs: {
    src: "assets/docs-library.png",
    alt: "Zharwing Memory documentation library for the fictional EchoDesk project",
    caption:
      "Keep architecture decisions, technical specifications, runbooks, user flows, and privacy rules in one searchable project library."
  },
  sessions: {
    src: "assets/sessions.png",
    alt: "Zharwing Memory session history for the fictional EchoDesk project",
    caption:
      "Review active and completed work sessions with agent, branch, status, goals, checkpoints, and concrete handoff information."
  },
  architecture: {
    src: "assets/architecture.png",
    alt: "A rendered architecture diagram for the fictional EchoDesk project inside Zharwing Memory",
    caption:
      "Store Mermaid diagrams as Markdown and render them inside the same project memory used by agents and humans."
  }
};

const tourButtons = [...document.querySelectorAll("[data-tour]")];
const tourImage = document.querySelector("[data-tour-image]");
const tourCaption = document.querySelector("[data-tour-caption]");

for (const button of tourButtons) {
  button.addEventListener("click", () => {
    const key = button.dataset.tour;
    const selected = key ? tourContent[key] : undefined;
    if (!selected || !(tourImage instanceof HTMLImageElement) || !tourCaption) return;

    tourButtons.forEach((candidate) => candidate.setAttribute("aria-selected", String(candidate === button)));
    tourImage.classList.add("changing");

    const preload = new Image();
    preload.onload = () => {
      tourImage.src = selected.src;
      tourImage.alt = selected.alt;
      tourCaption.textContent = selected.caption;
      requestAnimationFrame(() => tourImage.classList.remove("changing"));
    };
    preload.onerror = () => tourImage.classList.remove("changing");
    preload.src = selected.src;
  });
}

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
