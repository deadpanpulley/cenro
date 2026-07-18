const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");

function setMenu(open) {
  nav?.classList.toggle("is-open", open);
  menuToggle?.setAttribute("aria-expanded", String(open));
  menuToggle?.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
}

menuToggle?.addEventListener("click", () => setMenu(!nav?.classList.contains("is-open")));
nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));

window.addEventListener("scroll", () => header?.classList.toggle("is-scrolled", window.scrollY > 8), { passive: true });

document.documentElement.classList.add("motion-ready");
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("is-visible");
    observer.unobserve(entry.target);
  });
}, { threshold: 0.14 });
document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));

const parallax = document.querySelectorAll("[data-parallax]");
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  window.addEventListener("mousemove", (event) => {
    const x = event.clientX / window.innerWidth - .5;
    const y = event.clientY / window.innerHeight - .5;
    parallax.forEach((element) => {
      const strength = Number(element.dataset.parallax || 0);
      element.style.marginLeft = `${x * strength * 80}px`;
      element.style.marginTop = `${y * strength * 80}px`;
    });
  }, { passive: true });
}

const playbooks = {
  build: {
    title: "Build a polished app",
    summary: "Turn an idea into a bounded implementation brief with repository evidence, acceptance checks, and reviewable files.",
    rows: [["Goal", "Build {{project_name}}"], ["Context", "Relevant symbols, paths, tests, provenance"], ["Quality bar", "Accessible, responsive, reviewable"], ["Deliver", "Plan, context capsule, diff, verification steps"]]
  },
  debug: {
    title: "Debug and verify",
    summary: "Trace the actual failure through the call path, gather the smallest relevant evidence set, and prove the fix with focused checks.",
    rows: [["Target", "{{issue_or_file}}"], ["Evidence", "Logs, call path, expected behavior, tests"], ["Fix", "Smallest reviewable change"], ["Verify", "Focused checks, diff review, remaining risks"]]
  },
  research: {
    title: "Research with sources",
    summary: "Build a clear answer from evidence, distinguish facts from inference, and keep workspace context local unless you approve a connected route.",
    rows: [["Question", "{{research_question}}"], ["Sources", "Primary sources first"], ["Return", "Claims, citations, uncertainty"], ["Boundary", "Show provider, scope, and reason before use"]]
  },
  review: {
    title: "Review security",
    summary: "Inspect meaningful trust boundaries with code and configuration evidence, then propose prioritized, reviewable next steps.",
    rows: [["Scope", "{{project_or_change}}"], ["Inspect", "Trust boundaries, data flow, secret handling"], ["Return", "Risk, evidence, recommendation"], ["Fix", "Reviewable changes only"]]
  }
};

const preview = document.querySelector("[data-playbook-preview]");
document.querySelectorAll("[data-playbook]").forEach((button) => {
  button.addEventListener("click", () => {
    const data = playbooks[button.dataset.playbook];
    if (!data || !preview) return;
    document.querySelectorAll("[data-playbook]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-selected", String(item === button));
    });
    preview.querySelector("h3").textContent = data.title;
    preview.querySelector(".preview-summary").textContent = data.summary;
    preview.querySelector(".prompt-code").innerHTML = data.rows.map(([label, value]) => `<p><em>${label}</em><span>${value}</span></p>`).join("");
  });
});

const routePreview = document.querySelector("[data-demo-route]");
const receipt = document.querySelector("[data-receipt]");
const receiptAction = document.querySelector("[data-receipt-action]");

function toggleRouteReceipt() {
  if (!receipt) return;
  const isCloud = receipt.classList.toggle("show-cloud");
  receipt.querySelector(".receipt-title b").textContent = isCloud ? "Provider handoff needs approval" : "Context Pack ready";
  receipt.querySelector(".confidence").textContent = isCloud ? "Consent required" : "Still local";
  receipt.querySelector("dl").innerHTML = isCloud
    ? "<div><dt>Provider</dt><dd>Your selected model</dd></div><div><dt>Context Pack</dt><dd>5 selected slices · 3 source paths</dd></div><div><dt>Boundary</dt><dd><span class=\"pill cloud-pill\">Approval required</span></dd></div><div><dt>Next</dt><dd>Send only after you approve.</dd></div>"
    : "<div><dt>Project map</dt><dd>Structure · symbols · tests</dd></div><div><dt>Context Pack</dt><dd>5 selected slices · reasons attached</dd></div><div><dt>Boundary</dt><dd><span class=\"pill local-pill\">Local only</span></dd></div><div><dt>Next</dt><dd>Review the pack before provider use.</dd></div>";
  if (receiptAction) receiptAction.innerHTML = isCloud ? "Back to Context Pack <span>→</span>" : "Preview provider handoff <span>→</span>";
  if (routePreview) routePreview.innerHTML = isCloud ? "Back to Context Pack <span aria-hidden=\"true\">→</span>" : "Preview a provider handoff <span aria-hidden=\"true\">→</span>";
}

routePreview?.addEventListener("click", toggleRouteReceipt);
receiptAction?.addEventListener("click", toggleRouteReceipt);

document.querySelector(".approve-command")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  button.textContent = "Waiting for your terminal";
  button.disabled = true;
});
