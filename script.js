document.documentElement.classList.add("js");

const revealElements = document.querySelectorAll(".reveal");
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

// --------------------------------------------------
// Reveal animations
// --------------------------------------------------

if ("IntersectionObserver" in window && !prefersReducedMotion.matches) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -40px 0px",
    }
  );

  revealElements.forEach((element) => {
    revealObserver.observe(element);
  });
} else {
  revealElements.forEach((element) => {
    element.classList.add("is-visible");
  });
}


// --------------------------------------------------
// Current year
// --------------------------------------------------

const year = document.getElementById("current-year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}


// --------------------------------------------------
// Canvas
// --------------------------------------------------

const canvas = document.getElementById("sequence");

if (!canvas) {
  console.error("Sequence canvas not found.");
} else {

  const context = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true
  });

  // ------------------------------------------------
  // Device detection
  // ------------------------------------------------

  const isMobile =
    window.matchMedia("(max-width: 767px)").matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  // Desktop = 300 frames
  // Mobile  = 100 frames
  const frameCount = isMobile ? 100 : 300;

  const frameFolder = isMobile
    ? "images/mobile"
    : "images/desktop";

  // Mobile needs much less memory.
  const maxCachedFrames = isMobile ? 8 : 14;

  // Mobile canvas should NOT render at 2x DPR.
  const maxDPR = isMobile ? 1 : 2;

  let frameCache = new Map();

  let targetFrame = 0;
  let displayedFrame = 0;

  let animationId = 0;
  let scrollUpdatePending = false;

  let lastDrawnFrame = -1;
  let lastPreloadedFrame = -1;


  // ------------------------------------------------
  // Frame path
  // ------------------------------------------------

  function getFramePath(index) {
    const frameNumber = String(index + 1).padStart(3, "0");

    return `${frameFolder}/ezgif-frame-${frameNumber}.jpg`;
  }


  // ------------------------------------------------
  // Load frame
  // ------------------------------------------------

  function loadFrame(index) {

    index = Math.max(
      0,
      Math.min(frameCount - 1, Math.round(index))
    );

    let image = frameCache.get(index);

    if (image) {
      // Refresh LRU position
      frameCache.delete(index);
      frameCache.set(index, image);

      return image;
    }

    image = new Image();

    image.decoding = "async";

    image.src = getFramePath(index);

    image.onload = () => {

      // Only redraw if this is the frame currently needed.
      if (
        Math.abs(displayedFrame - index) < 2
      ) {
        drawFrame();
      }
    };

    image.onerror = () => {
      console.warn(
        `Failed to load animation frame ${index + 1}`
      );

      frameCache.delete(index);
    };

    frameCache.set(index, image);


    // Keep cache small
    while (frameCache.size > maxCachedFrames) {

      const oldestKey =
        frameCache.keys().next().value;

      frameCache.delete(oldestKey);
    }

    return image;
  }


  // ------------------------------------------------
  // Preload nearby frames
  // ------------------------------------------------

  function preloadNearbyFrames(frame) {

    const center = Math.round(frame);

    if (center === lastPreloadedFrame) {
      return;
    }

    lastPreloadedFrame = center;

    // Number of frames loaded ahead/behind.
    const range = isMobile ? 3 : 5;

    for (
      let offset = -range;
      offset <= range;
      offset++
    ) {

      const index = center + offset;

      if (
        index >= 0 &&
        index < frameCount
      ) {
        loadFrame(index);
      }
    }
  }


  // ------------------------------------------------
  // Draw image
  // ------------------------------------------------

  function drawImageCover(image) {

    if (
      !image ||
      !image.naturalWidth ||
      !image.naturalHeight
    ) {
      return false;
    }

    const scale = Math.max(
      canvas.width / image.naturalWidth,
      canvas.height / image.naturalHeight
    );

    const width =
      image.naturalWidth * scale;

    const height =
      image.naturalHeight * scale;

    const x =
      (canvas.width - width) / 2;

    const y =
      (canvas.height - height) / 2;

    context.drawImage(
      image,
      x,
      y,
      width,
      height
    );

    return true;
  }


  // ------------------------------------------------
  // Draw frame
  // ------------------------------------------------

  function drawFrame() {

    const frame = Math.max(
      0,
      Math.min(
        frameCount - 1,
        displayedFrame
      )
    );

    const frameIndex =
      Math.round(frame);


    // Avoid unnecessary redraws.
    if (
      frameIndex === lastDrawnFrame
    ) {
      return;
    }

    lastDrawnFrame = frameIndex;

    const image =
      loadFrame(frameIndex);


    // Background
    context.fillStyle = "#08050a";

    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    // Draw current frame
    if (image?.complete && image.naturalWidth) {

      drawImageCover(image);

    } else {

      // Try nearby cached frame while loading.
      let fallback = null;

      for (
        const cached of frameCache.values()
      ) {

        if (
          cached.complete &&
          cached.naturalWidth
        ) {
          fallback = cached;
          break;
        }
      }

      if (fallback) {
        drawImageCover(fallback);
      }
    }

    preloadNearbyFrames(frameIndex);
  }


  // ------------------------------------------------
  // Resize canvas
  // ------------------------------------------------

  function resizeCanvas() {

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      maxDPR
    );

    canvas.width =
      Math.round(
        window.innerWidth * dpr
      );

    canvas.height =
      Math.round(
        window.innerHeight * dpr
      );

    canvas.style.width = "100%";
    canvas.style.height = "100%";

    context.imageSmoothingEnabled = true;

    // Mobile: faster
    // Desktop: higher quality
    context.imageSmoothingQuality =
      isMobile ? "medium" : "high";

    lastDrawnFrame = -1;

    drawFrame();
  }


  // ------------------------------------------------
  // Scroll → target frame
  // ------------------------------------------------

  function updateScrollPosition() {

    const scrollableHeight =
      document.documentElement.scrollHeight -
      window.innerHeight;

    const progress =
      scrollableHeight > 0
        ? window.scrollY / scrollableHeight
        : 0;

    const clampedProgress =
      Math.max(
        0,
        Math.min(1, progress)
      );


    // CSS scroll progress
    document.documentElement.style.setProperty(
      "--scroll-progress",
      String(clampedProgress)
    );


    // Convert scroll percentage → frame
    targetFrame =
      clampedProgress *
      (frameCount - 1);


    if (!animationId) {

      animationId =
        window.requestAnimationFrame(
          animate
        );
    }

    scrollUpdatePending = false;
  }


  // ------------------------------------------------
  // Scroll listener
  // ------------------------------------------------

  function requestProgressUpdate() {

    if (scrollUpdatePending) {
      return;
    }

    scrollUpdatePending = true;

    window.requestAnimationFrame(
      updateScrollPosition
    );
  }


  // ------------------------------------------------
  // Smooth animation
  // ------------------------------------------------

  function animate() {

    const distance =
      targetFrame -
      displayedFrame;


    // Mobile responds slightly faster.
    const easing =
      isMobile ? 0.22 : 0.16;


    if (
      prefersReducedMotion.matches ||
      Math.abs(distance) < 0.05
    ) {

      displayedFrame =
        targetFrame;

    } else {

      displayedFrame +=
        distance * easing;
    }


    drawFrame();


    if (
      Math.abs(
        targetFrame -
        displayedFrame
      ) > 0.05
    ) {

      animationId =
        window.requestAnimationFrame(
          animate
        );

    } else {

      displayedFrame =
        targetFrame;

      animationId = 0;

      drawFrame();
    }
  }


  // ------------------------------------------------
  // Events
  // ------------------------------------------------

  window.addEventListener(
    "scroll",
    requestProgressUpdate,
    {
      passive: true
    }
  );

  window.addEventListener(
    "resize",
    () => {
      resizeCanvas();
      requestProgressUpdate();
    }
  );


  // ------------------------------------------------
  // Initial setup
  // ------------------------------------------------

  resizeCanvas();

  loadFrame(0);

  updateScrollPosition();
}


// --------------------------------------------------
// Contact form
// --------------------------------------------------

const contactForm =
  document.getElementById("contact-form");

if (contactForm) {

  contactForm.addEventListener(
    "submit",
    (event) => {

      event.preventDefault();

      const form =
        new FormData(
          event.currentTarget
        );

      const subject =
        encodeURIComponent(
          `Portfolio enquiry from ${form.get("name")}`
        );

      const message = [
        `Name: ${form.get("name")}`,
        `Email: ${form.get("email")}`,
        `Phone: ${
          form.get("phone") ||
          "Not provided"
        }`,
        "",
        form.get("message")
      ].join("\n");

      window.location.href =
        `mailto:susantagorai@gmail.com?subject=${subject}&body=${encodeURIComponent(message)}`;
    }
  );
}