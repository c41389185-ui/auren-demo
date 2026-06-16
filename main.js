/* ==========================================================================
   Auren Landing — Interactions & Chat
   ========================================================================== */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isFinePointer = window.matchMedia("(pointer: fine)").matches;

/* --------------------------------------------------------------------------
   Smooth scroll anchors
   -------------------------------------------------------------------------- */

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (window.lenis) {
    window.lenis.scrollTo(el, { offset: -72 });
  } else {
    el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
  }
}

document.querySelectorAll("[data-scroll]").forEach((link) => {
  link.addEventListener("click", (e) => {
    const target = link.getAttribute("data-scroll");
    if (target === "top") {
      e.preventDefault();
      if (window.lenis) window.lenis.scrollTo(0);
      else window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
      return;
    }
    e.preventDefault();
    scrollToSection(target);
  });
});

/* --------------------------------------------------------------------------
   Custom cursor
   -------------------------------------------------------------------------- */

function initCursor() {
  if (!isFinePointer || prefersReducedMotion) return;

  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  if (!dot || !ring) return;

  let mouseX = 0;
  let mouseY = 0;
  let ringX = 0;
  let ringY = 0;
  const lerp = 0.15;

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = mouseX + "px";
    dot.style.top = mouseY + "px";
  });

  function animateRing() {
    ringX += (mouseX - ringX) * lerp;
    ringY += (mouseY - ringY) * lerp;
    ring.style.left = ringX + "px";
    ring.style.top = ringY + "px";
    requestAnimationFrame(animateRing);
  }
  animateRing();

  const interactives = "a, button, input, textarea, .chip, [data-scroll]";
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest(interactives)) ring.classList.add("is-hover");
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest(interactives)) ring.classList.remove("is-hover");
  });
}

/* --------------------------------------------------------------------------
   Lenis + GSAP ScrollTrigger
   -------------------------------------------------------------------------- */

function initScroll() {
  const nav = document.getElementById("nav");
  let lenis = null;

  if (!prefersReducedMotion && typeof Lenis !== "undefined") {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    window.lenis = lenis;

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  gsap.registerPlugin(ScrollTrigger);

  if (nav) {
    ScrollTrigger.create({
      start: "top -80",
      onUpdate: (self) => {
        nav.classList.toggle("is-scrolled", self.scroll() > 40);
      },
    });
  }

  initHeroAnimations();
  initHowSteps();
  initSectionReveals();
}

function initHeroAnimations() {
  const words = document.querySelectorAll(".hero__word");
  const sub = document.querySelector(".hero__sub");
  const actions = document.querySelector(".hero__actions");
  const headline = document.querySelector(".hero__headline");

  if (prefersReducedMotion) {
    gsap.set([words, sub, actions], { opacity: 1, y: 0 });
    return;
  }

  gsap.set(words, { opacity: 0, y: 28 });
  gsap.set([sub, actions], { opacity: 0, y: 16 });

  const tl = gsap.timeline({ delay: 0.15 });
  tl.to(words, {
    opacity: 1,
    y: 0,
    duration: 0.7,
    stagger: 0.06,
    ease: "power3.out",
  })
    .to(sub, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "-=0.35")
    .to(actions, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "-=0.4");

  if (headline) {
    gsap.to(headline, {
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: true,
      },
      scale: 0.92,
      opacity: 0.35,
      fontVariationSettings: '"opsz" 144, "wght" 600',
      ease: "none",
    });
  }
}

function initHowSteps() {
  const steps = document.querySelectorAll(".how__step");
  const lineFill = document.getElementById("howLineFill");
  const track = document.querySelector(".how__track");

  if (!track || !steps.length) return;

  if (prefersReducedMotion) {
    steps.forEach((s) => s.classList.add("is-active"));
    if (lineFill) gsap.set(lineFill, { height: "100%" });
    return;
  }

  ScrollTrigger.create({
    trigger: track,
    start: "top 70%",
    end: "bottom 30%",
    scrub: true,
    onUpdate: (self) => {
      const progress = self.progress;
      if (lineFill) {
        gsap.set(lineFill, { height: progress * 100 + "%" });
      }
      const activeIndex = Math.min(
        steps.length - 1,
        Math.floor(progress * steps.length)
      );
      steps.forEach((step, i) => {
        step.classList.toggle("is-active", i <= activeIndex);
      });
    },
  });
}

function initSectionReveals() {
  const fadeUp = (targets, trigger, start = "top 82%") => {
    const els = gsap.utils.toArray(targets);
    if (!els.length) return;

    if (prefersReducedMotion) {
      gsap.set(els, { opacity: 1, y: 0 });
      return;
    }

    gsap.from(els, {
      scrollTrigger: {
        trigger,
        start,
        toggleActions: "play none none reverse",
      },
      opacity: 0,
      y: 32,
      duration: 0.7,
      stagger: 0.08,
      ease: "power2.out",
    });
  };

  fadeUp(
    [".problem__label", ".problem__title", ".problem__body"],
    ".problem"
  );

  fadeUp(".how__header", ".how");

  fadeUp(
    [".demo__header .section-label", ".demo__title", ".demo__hint"],
    ".demo__header"
  );

  fadeUp(
    [".capture .section-label", ".capture__title"],
    ".capture"
  );

  const cells = document.querySelectorAll(".bento__cell");
  if (cells.length) {
    if (prefersReducedMotion) {
      gsap.set(cells, { opacity: 1, y: 0 });
    } else {
      gsap.from(cells, {
        scrollTrigger: {
          trigger: ".bento",
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
        opacity: 0,
        y: 24,
        duration: 0.6,
        stagger: 0.07,
        ease: "power2.out",
      });
    }
  }

  fadeUp(
    [".closing__title", ".closing__body", ".closing .btn"],
    ".closing"
  );
}

/* --------------------------------------------------------------------------
   Chat logic (ported from auren-demo.html)
   -------------------------------------------------------------------------- */

const WEBHOOK_URL = "/webhook/auren-chat";

let chatReady = false;
const sessionId =
  sessionStorage.getItem("aurenSession") ||
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "sess-" + Date.now());
sessionStorage.setItem("aurenSession", sessionId);

const messagesEl = document.getElementById("messages");
const chatWindow = document.getElementById("chatWindow");
const chipsEl = document.getElementById("chips");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

const conversation = [];
let isLoading = false;
let chipsHidden = false;

function scrollToBottom() {
  if (chatWindow) chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideChips() {
  if (!chipsHidden && chipsEl) {
    chipsEl.classList.add("hidden");
    chipsHidden = true;
  }
}

function appendMessage(role, text) {
  const row = document.createElement("div");
  row.className = "message-row " + role;

  const avatar = document.createElement("div");
  avatar.className = "avatar " + role;
  avatar.textContent = role === "bot" ? "A" : "U";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollToBottom();
}

function showTyping() {
  const row = document.createElement("div");
  row.className = "typing-row";
  row.id = "typingIndicator";

  const avatar = document.createElement("div");
  avatar.className = "avatar bot";
  avatar.textContent = "A";

  const bubble = document.createElement("div");
  bubble.className = "typing-bubble";
  bubble.innerHTML = "<span></span><span></span><span></span>";

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollToBottom();
}

function hideTyping() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}

function setLoading(loading) {
  isLoading = loading;
  sendBtn.disabled = loading;
  userInput.disabled = loading;
}

async function sendToAuren() {
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: conversation,
      sessionId,
    }),
  });

  if (!response.ok) {
    throw new Error("Webhook request failed");
  }

  const data = await response.json();
  return typeof data.reply === "string" ? data.reply.trim() : "";
}

async function handleUserMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || isLoading || !chatReady) return;

  hideChips();
  appendMessage("user", trimmed);
  conversation.push({ role: "user", content: trimmed });

  setLoading(true);
  showTyping();

  try {
    const reply = await sendToAuren();
    hideTyping();
    if (reply) {
      appendMessage("bot", reply);
      conversation.push({ role: "assistant", content: reply });
    }
  } catch {
    hideTyping();
    appendMessage("bot", "Let me connect you with our team directly.");
  } finally {
    setLoading(false);
    userInput.focus();
  }
}

if (chatForm) {
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = userInput.value;
    userInput.value = "";
    handleUserMessage(text);
  });
}

if (userInput) {
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });
}

if (chipsEl) {
  chipsEl.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      handleUserMessage(chip.dataset.text);
    });
  });
}

async function initChat() {
  if (!messagesEl) return;

  userInput.disabled = true;
  sendBtn.disabled = true;
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("server not ready");
    const data = await res.json();
    if (!data.ok) throw new Error("server not ready");
    chatReady = true;
  } catch {
    appendMessage(
      "bot",
      "I'm having trouble connecting right now — try refreshing in a moment."
    );
    return;
  }
  userInput.disabled = false;
  sendBtn.disabled = false;
  const WELCOME =
    "Hey — I'm Auren. I handle intake for our listings and match buyers to what's actually on the market. What are you looking for?";
  conversation.push({ role: "assistant", content: WELCOME });
  appendMessage("bot", WELCOME);
}

/* --------------------------------------------------------------------------
   Boot — lazy init after first paint
   -------------------------------------------------------------------------- */

function boot() {
  requestAnimationFrame(() => {
    initCursor();
    initScroll();
    initChat();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
