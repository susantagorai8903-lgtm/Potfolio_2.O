document.documentElement.classList.add("js");

const revealElements = document.querySelectorAll(".reveal");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if ("IntersectionObserver" in window && !prefersReducedMotion.matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}

const year = document.getElementById("current-year");
year.textContent = String(new Date().getFullYear());

const canvas = document.getElementById("sequence");
const context = canvas.getContext("2d", { alpha: false });
const frameCount = 300;
const frameCache = new Map();
const maxCachedFrames = 12;
let targetFrame = 0;
let displayedFrame = 0;
let lastRequestedFrame = -1;
let animationId = 0;
let progressUpdatePending = false;

function loadFrame(index) {
  const frameIndex = Math.max(0, Math.min(frameCount - 1, index));
  let image = frameCache.get(frameIndex);

  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = `images/ezgif-frame-${String(frameIndex + 1).padStart(3, "0")}.jpg`;
    image.onload = drawFrame;
    image.onerror = () => frameCache.delete(frameIndex);
    frameCache.set(frameIndex, image);
  } else {
    frameCache.delete(frameIndex);
    frameCache.set(frameIndex, image);
  }

  while (frameCache.size > maxCachedFrames) {
    frameCache.delete(frameCache.keys().next().value);
  }

  return image;
}

function drawImageCover(image, alpha = 1) {
  if (!image?.naturalWidth) return;

  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.globalAlpha = alpha;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  context.globalAlpha = 1;
}

function drawFrame() {
  const frame = Math.max(0, Math.min(frameCount - 1, displayedFrame));
  const firstIndex = Math.floor(frame);
  const fraction = frame - firstIndex;
  const first = loadFrame(firstIndex);
  const second = firstIndex < frameCount - 1 ? loadFrame(firstIndex + 1) : null;

  if (lastRequestedFrame !== firstIndex) {
    lastRequestedFrame = firstIndex;
    loadFrame(firstIndex + 2);
  }

  context.fillStyle = "#08050a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (first.naturalWidth) {
    drawImageCover(first);
    if (second?.naturalWidth && fraction > 0) drawImageCover(second, fraction);
  } else if (second?.naturalWidth) {
    drawImageCover(second);
  } else {
    for (const cached of frameCache.values()) {
      if (cached.naturalWidth) {
        drawImageCover(cached);
        break;
      }
    }
  }
}

function resizeCanvas() {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * scale);
  canvas.height = Math.round(window.innerHeight * scale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  drawFrame();
}

function updateScrollPosition() {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  document.documentElement.style.setProperty("--scroll-progress", String(clampedProgress));
  targetFrame = clampedProgress * (frameCount - 1);
  if (!animationId) animationId = window.requestAnimationFrame(animate);
  progressUpdatePending = false;
}

function requestProgressUpdate() {
  if (!progressUpdatePending) {
    progressUpdatePending = true;
    window.requestAnimationFrame(updateScrollPosition);
  }
}

function animate() {
  const distance = targetFrame - displayedFrame;
  displayedFrame = prefersReducedMotion.matches || Math.abs(distance) < 0.1
    ? targetFrame
    : displayedFrame + distance * 0.16;

  drawFrame();
  if (displayedFrame !== targetFrame) {
    animationId = window.requestAnimationFrame(animate);
  } else {
    animationId = 0;
  }
}

window.addEventListener("scroll", requestProgressUpdate, { passive: true });
window.addEventListener("resize", requestProgressUpdate);
resizeCanvas();
loadFrame(0);
updateScrollPosition();

document.getElementById("contact-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const subject = encodeURIComponent(`Portfolio enquiry from ${form.get("name")}`);
  const message = [
    `Name: ${form.get("name")}`,
    `Email: ${form.get("email")}`,
    `Phone: ${form.get("phone") || "Not provided"}`,
    "",
    form.get("message")
  ].join("\n");

  window.location.href = `mailto:susantagorai8903@gmail.com?subject=${subject}&body=${encodeURIComponent(message)}`;
});
