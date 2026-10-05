document.documentElement.classList.add("js");

/* =========================================================
   REVEAL ANIMATIONS
========================================================= */

const revealElements = document.querySelectorAll(".reveal");
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

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


/* =========================================================
   CURRENT YEAR
========================================================= */

const year = document.getElementById("current-year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}


/* =========================================================
   CANVAS SEQUENCE ANIMATION
========================================================= */

const canvas = document.getElementById("sequence");

if (canvas) {
  const context = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true,
  });

  /* -------------------------------------------------------
     DEVICE DETECTION
  ------------------------------------------------------- */

  const isMobile =
    window.matchMedia("(max-width: 768px)").matches;

  /*
    Desktop:
      300 frames

    Mobile:
      Every 3rd frame
      300 / 3 = approximately 100 frames

    This dramatically reduces image requests and memory usage.
  */

  const TOTAL_SOURCE_FRAMES = 300;

  const FRAME_STEP = isMobile ? 3 : 1;

  const frameCount = Math.ceil(
    TOTAL_SOURCE_FRAMES / FRAME_STEP
  );

  /*
    Cache size

    Desktop:
      Keep more frames because desktop devices usually
      have more memory and processing power.

    Mobile:
      Keep fewer frames to reduce memory pressure.
  */

  const maxCachedFrames = isMobile ? 6 : 12;

  const frameCache = new Map();

  let targetFrame = 0;
  let displayedFrame = 0;

  let lastDrawnFrame = -1;
  let lastRequestedFrame = -1;

  let animationId = 0;
  let progressUpdatePending = false;
  let resizePending = false;


/* =========================================================
   FRAME INDEX
========================================================= */

  function getSourceFrameIndex(index) {
    const safeIndex = Math.max(
      0,
      Math.min(frameCount - 1, index)
    );

    return Math.min(
      TOTAL_SOURCE_FRAMES - 1,
      safeIndex * FRAME_STEP
    );
  }


/* =========================================================
   LOAD FRAME
========================================================= */

  function loadFrame(index) {
    const frameIndex = Math.max(
      0,
      Math.min(frameCount - 1, Math.round(index))
    );

    let image = frameCache.get(frameIndex);

    if (image) {
      /*
        Move recently used frame to the end of the cache.
      */

      frameCache.delete(frameIndex);
      frameCache.set(frameIndex, image);

      return image;
    }

    const sourceIndex = getSourceFrameIndex(frameIndex);

    image = new Image();

    /*
      Async decoding helps prevent image decoding
      from blocking the main thread as much as possible.
    */

    image.decoding = "async";

    image.src =
      `images/ezgif-frame-${String(sourceIndex + 1).padStart(3, "0")}.jpg`;

    image.onload = () => {
      /*
        Only redraw if this is still the frame
        we're interested in.
      */

      if (
        Math.abs(displayedFrame - frameIndex) < 2 ||
        lastDrawnFrame === frameIndex
      ) {
        drawFrame(true);
      }
    };

    image.onerror = () => {
      frameCache.delete(frameIndex);
    };

    frameCache.set(frameIndex, image);

    /*
      Remove oldest frames from cache.
    */

    while (frameCache.size > maxCachedFrames) {
      const oldestKey = frameCache.keys().next().value;

      if (oldestKey !== undefined) {
        frameCache.delete(oldestKey);
      } else {
        break;
      }
    }

    return image;
  }


/* =========================================================
   DRAW IMAGE
========================================================= */

  function drawImageCover(image, alpha = 1) {
    if (!image || !image.naturalWidth) {
      return false;
    }

    const scale = Math.max(
      canvas.width / image.naturalWidth,
      canvas.height / image.naturalHeight
    );

    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;

    context.globalAlpha = alpha;

    context.drawImage(
      image,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height
    );

    context.globalAlpha = 1;

    return true;
  }


/* =========================================================
   DRAW CURRENT FRAME
========================================================= */

  function drawFrame(force = false) {
    let frame;

    /*
      Mobile:
        Use integer frames only.

      Desktop:
        Allow fractional frames for smoother interpolation.
    */

    if (isMobile) {
      frame = Math.round(displayedFrame);
    } else {
      frame = displayedFrame;
    }

    const firstIndex = Math.max(
      0,
      Math.min(frameCount - 1, Math.floor(frame))
    );

    /*
      Don't redraw the exact same frame unnecessarily.
    */

    if (!force && isMobile && firstIndex === lastDrawnFrame) {
      return;
    }

    lastDrawnFrame = firstIndex;

    /*
      Load the current frame.
    */

    const first = loadFrame(firstIndex);

    /*
      Desktop can blend between two frames.

      Mobile intentionally avoids blending because
      blending two large images on every scroll frame
      is expensive.
    */

    let second = null;
    let fraction = 0;

    if (!isMobile && firstIndex < frameCount - 1) {
      second = loadFrame(firstIndex + 1);
      fraction = frame - firstIndex;
    }

    /*
      Prefetch upcoming frames.

      Desktop:
        Load 2 frames ahead.

      Mobile:
        Load only 1 frame ahead.
    */

    if (lastRequestedFrame !== firstIndex) {
      lastRequestedFrame = firstIndex;

      const prefetchCount = isMobile ? 1 : 2;

      for (let i = 1; i <= prefetchCount; i++) {
        if (firstIndex + i < frameCount) {
          loadFrame(firstIndex + i);
        }
      }
    }

    /*
      Clear canvas.
    */

    context.fillStyle = "#08050a";

    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    /*
      Draw current frame.
    */

    if (first && first.naturalWidth) {
      drawImageCover(first);

      /*
        Desktop frame interpolation.
      */

      if (
        !isMobile &&
        second &&
        second.naturalWidth &&
        fraction > 0
      ) {
        drawImageCover(second, fraction);
      }
    } else if (second && second.naturalWidth) {
      drawImageCover(second);
    } else {
      /*
        If the requested frame hasn't loaded yet,
        display the most recently cached frame.
      */

      for (const cached of frameCache.values()) {
        if (cached && cached.naturalWidth) {
          drawImageCover(cached);
          break;
        }
      }
    }
  }


/* =========================================================
   CANVAS RESIZE
========================================================= */

  function resizeCanvas() {
    /*
      Desktop:
        Maximum DPR = 2

      Mobile:
        DPR = 1

      This is one of the biggest mobile performance
      improvements.
    */

    const devicePixelRatio = window.devicePixelRatio || 1;

    const scale = isMobile
      ? 1
      : Math.min(devicePixelRatio, 2);

    canvas.width = Math.round(
      window.innerWidth * scale
    );

    canvas.height = Math.round(
      window.innerHeight * scale
    );

    /*
      Lower-quality image smoothing on mobile
      saves GPU work.
    */

    context.imageSmoothingEnabled = true;

    context.imageSmoothingQuality =
      isMobile ? "medium" : "high";

    drawFrame(true);
  }


/* =========================================================
   UPDATE SCROLL POSITION
========================================================= */

  function updateScrollPosition() {
    const scrollableHeight =
      document.documentElement.scrollHeight -
      window.innerHeight;

    const progress =
      scrollableHeight > 0
        ? window.scrollY / scrollableHeight
        : 0;

    const clampedProgress = Math.max(
      0,
      Math.min(1, progress)
    );

    /*
      Update top scroll progress bar.
    */

    document.documentElement.style.setProperty(
      "--scroll-progress",
      String(clampedProgress)
    );

    /*
      Convert page scroll into animation frame.
    */

    targetFrame =
      clampedProgress * (frameCount - 1);

    /*
      Start animation loop if necessary.
    */

    if (!animationId) {
      animationId =
        window.requestAnimationFrame(animate);
    }

    progressUpdatePending = false;
  }


/* =========================================================
   SCROLL HANDLER
========================================================= */

  function requestProgressUpdate() {
    if (!progressUpdatePending) {
      progressUpdatePending = true;

      window.requestAnimationFrame(
        updateScrollPosition
      );
    }
  }


/* =========================================================
   ANIMATION LOOP
========================================================= */

  function animate() {
    const distance =
      targetFrame - displayedFrame;

    /*
      Mobile:
        Move faster toward target.

      Desktop:
        Smooth interpolation.
    */

    if (prefersReducedMotion.matches) {
      displayedFrame = targetFrame;
    } else if (isMobile) {
      /*
        Mobile does not need heavy smoothing.
        Faster response = less unnecessary rendering.
      */

      displayedFrame += distance * 0.35;

      if (Math.abs(distance) < 0.25) {
        displayedFrame = targetFrame;
      }
    } else {
      /*
        Desktop gets the smoother cinematic movement.
      */

      displayedFrame += distance * 0.16;

      if (Math.abs(distance) < 0.1) {
        displayedFrame = targetFrame;
      }
    }

    /*
      Draw only when needed.
    */

    const roundedFrame = Math.round(displayedFrame);

    if (
      isMobile
        ? roundedFrame !== lastDrawnFrame
        : true
    ) {
      drawFrame();
    }

    /*
      Continue animation while there is still
      distance to cover.
    */

    if (
      Math.abs(targetFrame - displayedFrame) > 0.05
    ) {
      animationId =
        window.requestAnimationFrame(animate);
    } else {
      displayedFrame = targetFrame;

      /*
        Make sure final frame is drawn.
      */

      drawFrame();

      animationId = 0;
    }
  }


/* =========================================================
   EVENT LISTENERS
========================================================= */

  /*
    Passive scroll listener allows the browser
    to scroll without waiting for JavaScript.
  */

  window.addEventListener(
    "scroll",
    requestProgressUpdate,
    {
      passive: true,
    }
  );


  /*
    Resize is throttled through requestAnimationFrame.
  */

  window.addEventListener(
    "resize",
    () => {
      if (!resizePending) {
        resizePending = true;

        window.requestAnimationFrame(() => {
          resizeCanvas();

          resizePending = false;

          requestProgressUpdate();
        });
      }
    },
    {
      passive: true,
    }
  );


/* =========================================================
   INITIALIZE
========================================================= */

  resizeCanvas();

  /*
    Load the first frame immediately.
  */

  loadFrame(0);

  /*
    Prefetch the first few frames.
  */

  const initialFrames = isMobile ? 2 : 4;

  for (
    let i = 0;
    i < initialFrames && i < frameCount;
    i++
  ) {
    loadFrame(i);
  }

  /*
    Set initial scroll position.
  */

  updateScrollPosition();
}


/* =========================================================
   CONTACT FORM
========================================================= */

const contactForm =
  document.getElementById("contact-form");

if (contactForm) {
  contactForm.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      const form =
        new FormData(event.currentTarget);

      const name =
        form.get("name") || "";

      const email =
        form.get("email") || "";

      const phone =
        form.get("phone") ||
        "Not provided";

      const message =
        form.get("message") || "";

      const subject = encodeURIComponent(
        `Portfolio enquiry from ${name}`
      );

      const emailBody = [
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        "",
        message,
      ].join("\n");

      window.location.href =
        `mailto:susantagorai@gmail.com?subject=${subject}&body=${encodeURIComponent(
          emailBody
        )}`;
    }
  );
}