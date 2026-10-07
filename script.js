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
    desynchronized: true,
  });

  if (!context) {
    console.error("Unable to create the sequence canvas context.");
  } else {
    const mobileViewport = window.matchMedia(
      "(max-width: 767px), (pointer: coarse)"
    );

    let isMobile = mobileViewport.matches;
    let frameCount = isMobile ? 100 : 300;
    let frameFolder = isMobile ? "images/mobile" : "images/desktop";
    let maxCachedFrames = isMobile ? 12 : 20;
    let maxConcurrentLoads = isMobile ? 3 : 4;
    let framesAhead = isMobile ? 4 : 8;
    let framesBehind = isMobile ? 3 : 7;
    let frameCache = new Map();
    let activeLoads = 0;
    let sequenceVersion = 0;
    let cacheClock = 0;
    let targetFrame = 0;
    let lastTargetFrame = -1;
    let lastDrawnFrame = -1;
    let currentImage = null;
    let currentImageIndex = -1;
    let scrollUpdatePending = false;
    let resizeUpdatePending = false;
    let scrollDirection = 1;

    function getFramePath(index) {
      const frameNumber = String(index + 1).padStart(3, "0");
      return `${frameFolder}/ezgif-frame-${frameNumber}.jpg`;
    }

    function touchFrame(entry) {
      entry.lastUsed = ++cacheClock;
    }

    function trimFrameCache() {
      const keepDistance = framesAhead + framesBehind;
      let loadedFrames = Array.from(frameCache.entries())
        .filter(([, entry]) => entry.status === "loaded");

      for (const [index, entry] of frameCache) {
        if (
          (entry.status === "queued" || entry.status === "error") &&
          Math.abs(index - targetFrame) > keepDistance
        ) {
          frameCache.delete(index);
        }
      }

      loadedFrames = Array.from(frameCache.entries())
        .filter(([, entry]) => entry.status === "loaded")
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

      while (loadedFrames.length > maxCachedFrames) {
        const removableIndex = loadedFrames.findIndex(
          ([index]) =>
            index !== targetFrame && index !== currentImageIndex
        );

        if (removableIndex === -1) {
          break;
        }

        const [[index]] = loadedFrames.splice(removableIndex, 1);
        frameCache.delete(index);
      }
    }

    function framePriority(index) {
      const distance = Math.abs(index - targetFrame);
      const isAhead = (index - targetFrame) * scrollDirection >= 0;
      return distance + (isAhead ? 0 : framesAhead * 0.25);
    }

    function pumpFrameLoads() {
      while (activeLoads < maxConcurrentLoads) {
        let nextIndex = -1;
        let bestPriority = Infinity;

        for (const [index, entry] of frameCache) {
          if (entry.status !== "queued") {
            continue;
          }

          const priority = framePriority(index);
          if (priority < bestPriority) {
            bestPriority = priority;
            nextIndex = index;
          }
        }

        if (nextIndex === -1) {
          return;
        }

        const entry = frameCache.get(nextIndex);
        const image = new Image();
        const requestVersion = sequenceVersion;

        entry.status = "loading";
        entry.image = image;
        entry.attempts += 1;
        touchFrame(entry);
        activeLoads += 1;
        image.decoding = "async";
        if ("fetchPriority" in image) {
          image.fetchPriority = "high";
        }

        image.onload = async () => {
          if (
            requestVersion !== sequenceVersion ||
            frameCache.get(nextIndex) !== entry
          ) {
            return;
          }

          if (typeof image.decode === "function") {
            try {
              await image.decode();
            } catch {
              // Some browsers reject decode() even though the loaded image is drawable.
            }
          }

          if (
            requestVersion !== sequenceVersion ||
            frameCache.get(nextIndex) !== entry
          ) {
            return;
          }

          activeLoads -= 1;

          if (image.naturalWidth && image.naturalHeight) {
            entry.status = "loaded";
            touchFrame(entry);
            drawBestAvailableFrame();
          } else {
            entry.status = "error";
            entry.image = null;
            entry.failedAt = Date.now();
            console.warn(`Loaded animation frame ${nextIndex + 1} has no drawable image data.`);
          }

          trimFrameCache();
          pumpFrameLoads();
        };

        image.onerror = () => {
          if (
            requestVersion !== sequenceVersion ||
            frameCache.get(nextIndex) !== entry
          ) {
            return;
          }

          activeLoads -= 1;
          entry.status = "error";
          entry.image = null;
          entry.failedAt = Date.now();
          console.warn(`Failed to load animation frame ${nextIndex + 1}: ${getFramePath(nextIndex)}`);
          trimFrameCache();
          pumpFrameLoads();
        };

        image.src = getFramePath(nextIndex);
      }
    }

    function ensureFrame(index) {
      index = Math.max(0, Math.min(frameCount - 1, Math.round(index)));

      let entry = frameCache.get(index);
      if (entry) {
        touchFrame(entry);

        if (entry.status === "error") {
          if (entry.attempts >= 2 || Date.now() - entry.failedAt < 1000) {
            return;
          }

          entry.status = "queued";
        } else {
          return;
        }
      } else {
        entry = {
          status: "queued",
          image: null,
          attempts: 0,
          failedAt: 0,
          lastUsed: ++cacheClock,
        };
        frameCache.set(index, entry);
      }

      trimFrameCache();
      pumpFrameLoads();
    }

    function drawImageCover(image) {
      if (
        !image ||
        !image.complete ||
        !image.naturalWidth ||
        !image.naturalHeight ||
        !canvas.width ||
        !canvas.height
      ) {
        return false;
      }

      const scale = Math.max(
        canvas.width / image.naturalWidth,
        canvas.height / image.naturalHeight
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;

      context.drawImage(image, x, y, width, height);
      canvas.classList.add("is-ready");
      return true;
    }

    function renderFrame(index, image, force = false) {
      if (
        !force &&
        index === lastDrawnFrame &&
        image === currentImage
      ) {
        return;
      }

      if (!drawImageCover(image)) {
        return;
      }

      currentImage = image;
      currentImageIndex = index;
      lastDrawnFrame = index;

      const entry = frameCache.get(index);
      if (entry) {
        touchFrame(entry);
      }
    }

    function drawBestAvailableFrame() {
      const requestedEntry = frameCache.get(targetFrame);
      if (requestedEntry?.status === "loaded") {
        renderFrame(targetFrame, requestedEntry.image);
        return;
      }

      if (currentImage) {
        return;
      }

      let closestIndex = -1;
      let closestImage = null;
      let closestDistance = Infinity;

      for (const [index, entry] of frameCache) {
        if (entry.status !== "loaded") {
          continue;
        }

        const distance = Math.abs(index - targetFrame);
        if (distance < closestDistance) {
          closestIndex = index;
          closestImage = entry.image;
          closestDistance = distance;
        }
      }

      if (closestImage) {
        renderFrame(closestIndex, closestImage);
      }
    }

    function preloadNearbyFrames() {
      ensureFrame(targetFrame);

      for (let distance = 1; distance <= framesAhead; distance += 1) {
        const index = targetFrame + distance * scrollDirection;
        if (index >= 0 && index < frameCount) {
          ensureFrame(index);
        }
      }

      for (let distance = 1; distance <= framesBehind; distance += 1) {
        const index = targetFrame - distance * scrollDirection;
        if (index >= 0 && index < frameCount) {
          ensureFrame(index);
        }
      }

      trimFrameCache();
      pumpFrameLoads();
    }

    function resizeCanvas() {
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        isMobile ? 1 : 2
      );
      const width = Math.round(window.innerWidth * dpr);
      const height = Math.round(window.innerHeight * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = isMobile ? "medium" : "high";

      if (currentImage) {
        renderFrame(currentImageIndex, currentImage, true);
      }
    }

    function updateScrollPosition() {
      const scrollableHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollableHeight > 0
        ? window.scrollY / scrollableHeight
        : 0;
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const nextFrame = Math.round(clampedProgress * (frameCount - 1));

      document.documentElement.style.setProperty(
        "--scroll-progress",
        String(clampedProgress)
      );

      if (nextFrame !== targetFrame) {
        if (lastTargetFrame >= 0 && nextFrame !== lastTargetFrame) {
          scrollDirection = nextFrame > lastTargetFrame ? 1 : -1;
        }

        lastTargetFrame = nextFrame;
        targetFrame = nextFrame;
        drawBestAvailableFrame();
        preloadNearbyFrames();
      } else {
        ensureFrame(targetFrame);
      }

      scrollUpdatePending = false;
    }

    function requestProgressUpdate() {
      if (scrollUpdatePending) {
        return;
      }

      scrollUpdatePending = true;
      window.requestAnimationFrame(updateScrollPosition);
    }

    function updateDeviceProfile() {
      const nextIsMobile = mobileViewport.matches;
      if (nextIsMobile === isMobile) {
        return;
      }

      isMobile = nextIsMobile;
      frameCount = isMobile ? 100 : 300;
      frameFolder = isMobile ? "images/mobile" : "images/desktop";
      maxCachedFrames = isMobile ? 12 : 20;
      maxConcurrentLoads = isMobile ? 3 : 4;
      framesAhead = isMobile ? 4 : 8;
      framesBehind = isMobile ? 3 : 7;
      sequenceVersion += 1;
      activeLoads = 0;
      frameCache.clear();
      lastDrawnFrame = -1;
      lastTargetFrame = -1;
    }

    function requestResizeUpdate() {
      if (resizeUpdatePending) {
        return;
      }

      resizeUpdatePending = true;
      window.requestAnimationFrame(() => {
        updateDeviceProfile();
        resizeCanvas();
        resizeUpdatePending = false;
        requestProgressUpdate();
      });
    }

    window.addEventListener("scroll", requestProgressUpdate, {
      passive: true,
    });
    window.addEventListener("resize", requestResizeUpdate, {
      passive: true,
    });
    window.addEventListener("orientationchange", requestResizeUpdate, {
      passive: true,
    });

    resizeCanvas();
    ensureFrame(0);
    updateScrollPosition();
    preloadNearbyFrames();
  }
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