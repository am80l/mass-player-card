const HOTFIX_WINDOW_MS = 15000;
const HYDRATION_RETRY_DELAYS_MS = [300, 1000, 3000];
const DEBUG_STORAGE_KEY = "codex_mass_player_card_debug";
const DEBUG_PREFIX = "mass-player-card hotfix";
const EXISTING_CARD_OBSERVER_KEY = "__codexQueueCardObserver";
const EXISTING_CARD_LISTENER_KEY = "__codexQueueCardListener";
const EXISTING_CARD_OBSERVER_FRAME_KEY = "__codexQueueCardObserverFrame";
const FALLBACK_STYLE_ID = "codex-queue-fallback-style";
const FALLBACK_CONTAINER_ID = "codex-queue-fallback";

const isDebugEnabled = () => {
  try {
    return globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch (_error) {
    return false;
  }
};

const log = (event, details = {}) => {
  if (!isDebugEnabled()) {
    return;
  }

  try {
    console.info(`${DEBUG_PREFIX} ${event} ${JSON.stringify(details)}`);
  } catch (_error) {
    console.info(DEBUG_PREFIX, event, details);
  }
};

const getVirtualizer = (instance) =>
  instance?.virtualizerElement ?? instance?.renderRoot?.querySelector?.("lit-virtualizer");

const getRenderedRowCount = (instance) =>
  instance?.renderRoot?.querySelectorAll?.("mpc-queue-media-row")?.length ?? 0;

const ensureFallbackStyles = (root) => {
  if (!root || root.getElementById(FALLBACK_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = FALLBACK_STYLE_ID;
  style.textContent = `
    #${FALLBACK_CONTAINER_ID} {
      display: flex;
      flex-direction: column;
      padding-bottom: calc(var(--navbar-height) + 8px);
    }

    .codex-queue-fallback-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      width: 100%;
      background: transparent;
      border: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      color: inherit;
      cursor: pointer;
      font: inherit;
      margin: 0;
      padding: 12px 14px;
      text-align: left;
    }

    .codex-queue-fallback-row:last-child {
      border-bottom: 0;
    }

    .codex-queue-fallback-row.is-active {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      margin-top: 4px;
      margin-bottom: 4px;
    }

    .codex-queue-fallback-row.is-played {
      opacity: 0.58;
    }

    .codex-queue-fallback-row.without-artwork {
      grid-template-columns: minmax(0, 1fr);
    }

    .codex-queue-fallback-artwork {
      width: 46px;
      height: 46px;
      border-radius: 999px;
      object-fit: cover;
      display: block;
      flex: 0 0 auto;
      background:
        radial-gradient(circle at 50% 50%, rgba(255,255,255,0.22) 0 15%, transparent 16% 100%),
        radial-gradient(circle at 50% 50%, rgba(255,255,255,0.14) 0 46%, transparent 47% 100%),
        linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    }

    .codex-queue-fallback-copy {
      min-width: 0;
    }

    .codex-queue-fallback-title {
      display: block;
      font-size: 1.05rem;
      line-height: 1.3;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .codex-queue-fallback-artist {
      display: block;
      font-size: 0.92rem;
      line-height: 1.2;
      opacity: 0.8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .codex-queue-fallback-row.is-active .codex-queue-fallback-title {
      font-weight: 600;
    }

    .codex-queue-fallback-row.is-active .codex-queue-fallback-artwork {
      box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.14),
        0 0 0 2px rgba(255, 255, 255, 0.22);
    }
  `;
  root.append(style);
};

const removeQueueFallback = (instance) => {
  const fallback = instance?.renderRoot?.getElementById?.(FALLBACK_CONTAINER_ID);

  if (fallback) {
    fallback.remove();
  }

  const virtualizer = getVirtualizer(instance);

  if (virtualizer) {
    virtualizer.style.display = "";
  }
};

const renderQueueFallback = (instance) => {
  if (!instance?.renderRoot || instance.activeSection !== "queue") {
    removeQueueFallback(instance);
    return;
  }

  const queue = Array.isArray(instance._queue) ? instance._queue : [];
  const list = instance.renderRoot.querySelector(".list");
  const virtualizer = getVirtualizer(instance);
  const renderedRows = getRenderedRowCount(instance);

  if (!list || !queue.length || renderedRows > 0) {
    removeQueueFallback(instance);
    return;
  }

  ensureFallbackStyles(instance.renderRoot);

  let fallback = instance.renderRoot.getElementById(FALLBACK_CONTAINER_ID);

  if (!fallback) {
    fallback = document.createElement("div");
    fallback.id = FALLBACK_CONTAINER_ID;
    list.append(fallback);
  }

  fallback.replaceChildren();

  queue.forEach((item, index) => {
    const showAlbumCovers = instance?._config?.show_album_covers !== false;
    const imageSrc = item?.local_image_encoded || item?.media_image || "";
    const isActive = Boolean(item?.playing);
    const isPlayed = !isActive && item?.show_action_buttons === false;
    const row = document.createElement("button");
    row.type = "button";
    row.className = `codex-queue-fallback-row${isActive ? " is-active" : ""}${isPlayed ? " is-played" : ""}${showAlbumCovers ? "" : " without-artwork"}`;
    row.addEventListener("click", () => {
      instance.onQueueItemSelected?.(item?.queue_item_id ?? index);
    });
    row.setAttribute("aria-current", isActive ? "true" : "false");

    if (showAlbumCovers) {
      const artwork = document.createElement("img");
      artwork.className = "codex-queue-fallback-artwork";
      artwork.loading = "lazy";
      artwork.decoding = "async";
      artwork.alt = "";
      if (imageSrc) {
        artwork.src = imageSrc;
      }
      artwork.addEventListener("error", () => {
        artwork.removeAttribute("src");
      });
      row.append(artwork);
    }

    const copy = document.createElement("div");
    copy.className = "codex-queue-fallback-copy";

    const title = document.createElement("span");
    title.className = "codex-queue-fallback-title";
    title.textContent = item?.media_title || item?.name || `Track ${index + 1}`;

    copy.append(title);

    if (instance?._config?.show_artist_names !== false && item?.media_artist) {
      const artist = document.createElement("span");
      artist.className = "codex-queue-fallback-artist";
      artist.textContent = item.media_artist;
      copy.append(artist);
    }

    row.append(copy);
    fallback.append(row);
  });

  if (virtualizer) {
    virtualizer.style.display = "none";
  }
};

const findQueueCardsDeep = (root = document, found = new Set()) => {
  if (!root?.querySelectorAll) {
    return [...found];
  }

  root.querySelectorAll("mpc-queue-card").forEach((element) => {
    found.add(element);
  });

  root.querySelectorAll("*").forEach((element) => {
    if (element.shadowRoot) {
      findQueueCardsDeep(element.shadowRoot, found);
    }
  });

  return [...found];
};

const clearScheduledHydration = (instance) => {
  if (!instance) {
    return;
  }

  const timeoutIds = instance.__codexHydrationTimeoutIds ?? [];
  timeoutIds.forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });
  instance.__codexHydrationTimeoutIds = [];

  if (instance.__codexHydrationAnimationFrameId) {
    cancelAnimationFrame(instance.__codexHydrationAnimationFrameId);
    instance.__codexHydrationAnimationFrameId = undefined;
  }

  if (instance.__codexQueueHydrationResetTimeoutId) {
    window.clearTimeout(instance.__codexQueueHydrationResetTimeoutId);
    instance.__codexQueueHydrationResetTimeoutId = undefined;
  }

  instance.__codexQueueHydrationRequested = false;
};

const patchQueueCard = () => {
  const QueueCard = customElements.get("mpc-queue-card");

  if (!QueueCard || QueueCard.prototype.__codexQueueHotfixApplied) {
    return;
  }

  const proto = QueueCard.prototype;
  const queueDescriptor = Object.getOwnPropertyDescriptor(proto, "queue");
  const baseProto = Object.getPrototypeOf(proto);
  const originalUpdated = proto.updated;

  if (!queueDescriptor?.get || !queueDescriptor?.set) {
    console.warn("mass-player-card hotfix: queue descriptor not found");
    return;
  }

  proto.__codexQueueHotfixApplied = true;

  proto.__startQueueWarmup = function __startQueueWarmup() {
    this.__codexQueueWarmupUntil = Date.now() + HOTFIX_WINDOW_MS;
    log("warmup-start", {
      activePlayer: this.active_player_entity,
      activeSection: this.activeSection,
    });
  };

  proto.__isQueueWarmupActive = function __isQueueWarmupActive() {
    return (this.__codexQueueWarmupUntil ?? 0) > Date.now();
  };

  proto.__canHydrateQueue = function __canHydrateQueue() {
    return Boolean(this.hass && this.active_player_entity && this.queueController);
  };

  proto.__syncQueuePresentation = function __syncQueuePresentation(reason = "unknown") {
    const run = () => {
      const queueLength = Array.isArray(this._queue) ? this._queue.length : 0;
      const virtualizer = getVirtualizer(this);

      log("presentation-sync", {
        reason,
        activePlayer: this.active_player_entity,
        activeSection: this.activeSection,
        queueLength,
        renderedRows: getRenderedRowCount(this),
        hasVirtualizer: Boolean(virtualizer),
      });

      if (this.activeSection !== "queue") {
        removeQueueFallback(this);
        return;
      }

      if (virtualizer) {
        try {
          virtualizer.items = [...(this._queue ?? [])];
          virtualizer.renderItem = (item) => this.renderQueueItem(item);
          virtualizer.requestUpdate?.();
        } catch (error) {
          console.warn(`${DEBUG_PREFIX} virtualizer-sync-failed`, error);
        }
      }

      this.requestUpdate?.();
      this.updateComplete
        ?.then(() => {
          if (queueLength > 0 && getRenderedRowCount(this) === 0) {
            renderQueueFallback(this);
            return;
          }

          removeQueueFallback(this);
        })
        .catch((error) => {
          console.warn(`${DEBUG_PREFIX} post-update-sync-failed`, error);
        });
    };

    run();
    queueMicrotask(run);
    requestAnimationFrame(run);
    window.setTimeout(run, 300);
  };

  proto.__refreshQueue = function __refreshQueue() {
    log("refresh-attempt", {
      canHydrate: this.__canHydrateQueue?.(),
      activePlayer: this.active_player_entity,
      activeSection: this.activeSection,
      hasQueueController: Boolean(this.queueController),
      queueLength: Array.isArray(this._queue) ? this._queue.length : null,
    });

    if (!this.__canHydrateQueue?.()) {
      return;
    }

    this.__startQueueWarmup?.();
    this.forceLoadQueue?.();
    this.queueController?.getQueue?.();
  };

  proto.__scheduleQueueRefreshes = function __scheduleQueueRefreshes() {
    clearScheduledHydration(this);

    this.__refreshQueue?.();
    this.__syncQueuePresentation?.("schedule-immediate");

    queueMicrotask(() => {
      this.__refreshQueue?.();
      this.__syncQueuePresentation?.("schedule-microtask");
    });

    this.__codexHydrationAnimationFrameId = requestAnimationFrame(() => {
      this.__codexHydrationAnimationFrameId = undefined;
      this.__refreshQueue?.();
      this.__syncQueuePresentation?.("schedule-animation-frame");
    });

    this.__codexHydrationTimeoutIds = HYDRATION_RETRY_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        this.__refreshQueue?.();
        this.__syncQueuePresentation?.(`schedule-timeout-${delay}`);
      }, delay),
    );
  };

  Object.defineProperty(proto, "queue", {
    configurable: true,
    enumerable: queueDescriptor.enumerable ?? false,
    get() {
      return queueDescriptor.get.call(this);
    },
    set(value) {
      if (!value) {
        return;
      }

      const nextQueue = Array.isArray(value) ? value : [];
      const hasExistingQueue = Array.isArray(this._queue) && this._queue.length > 0;
      const isTransientEmptyUpdate =
        hasExistingQueue &&
        nextQueue.length === 0 &&
        this.__isQueueWarmupActive?.();

      log("queue-set", {
        incomingLength: nextQueue.length,
        existingLength: hasExistingQueue ? this._queue.length : 0,
        transientEmpty: isTransientEmptyUpdate,
        activeSection: this.activeSection,
        activePlayer: this.active_player_entity,
      });

      if (isTransientEmptyUpdate) {
        return;
      }

      queueDescriptor.set.call(this, value);
      this.__syncQueuePresentation?.("queue-set");
    },
  });

  proto.connectedCallback = function connectedCallback() {
    this.__startQueueWarmup?.();

    baseProto.connectedCallback.call(this);

    this.__scheduleQueueRefreshes?.();

    if (this.queueController && !this.queueController.isSubscribed) {
      this.queueController.subscribeUpdates();
    }

    if (this._animations && this._firstLoaded) {
      this._animations.forEach((animation) => {
        animation.play = true;
      });
    }

    this.queueController?._host?.addEventListener("section-changed", this.onTabSwitch);
  };

  proto.disconnectedCallback = function disconnectedCallback() {
    clearScheduledHydration(this);

    if (this.queueController) {
      if (this.queueController.isSubscribed) {
        this.queueController.unsubscribeUpdates();
      }

      this.queueController._host?.removeEventListener("section-changed", this.onTabSwitch);
    }

    baseProto.disconnectedCallback.call(this);
  };

  proto.updated = function updated(changedProps) {
    if (typeof originalUpdated === "function") {
      originalUpdated.call(this, changedProps);
    }

    log("updated", {
      changed: changedProps ? [...changedProps.keys()] : [],
      activePlayer: this.active_player_entity,
      activeSection: this.activeSection,
      hasQueueController: Boolean(this.queueController),
      queueLength: Array.isArray(this._queue) ? this._queue.length : null,
    });

    const shouldRefreshQueue =
      changedProps?.has?.("hass") ||
      changedProps?.has?.("queueController") ||
      changedProps?.has?.("active_player_entity") ||
      (changedProps?.has?.("activeSection") && this.activeSection === "queue");

    if (shouldRefreshQueue) {
      this.__scheduleQueueRefreshes?.();
    }

    this.__syncQueuePresentation?.("updated");
  };

  const hydrateInstance = (instance) => {
    if (!instance || instance.__codexQueueHydrationRequested) {
      return;
    }

    instance.__codexQueueHydrationRequested = true;

    const run = () => {
      instance.__scheduleQueueRefreshes?.();
      instance.__syncQueuePresentation?.("hydrate-instance");

      if (instance.queueController && !instance.queueController.isSubscribed) {
        instance.queueController.subscribeUpdates?.();
      }
    };

    run();
    queueMicrotask(run);
    requestAnimationFrame(run);
    window.setTimeout(run, 300);
    window.setTimeout(run, 1000);
    window.clearTimeout(instance.__codexQueueHydrationResetTimeoutId);
    instance.__codexQueueHydrationResetTimeoutId = window.setTimeout(() => {
      instance.__codexQueueHydrationResetTimeoutId = undefined;
      instance.__codexQueueHydrationRequested = false;
      run();
    }, 3000);
  };

  const hydrateExistingQueueCards = () => {
    findQueueCardsDeep().forEach((instance) => {
      hydrateInstance(instance);
    });
  };

  const scheduleExistingQueueCardHydration = () => {
    if (globalThis[EXISTING_CARD_OBSERVER_FRAME_KEY]) {
      return;
    }

    globalThis[EXISTING_CARD_OBSERVER_FRAME_KEY] = requestAnimationFrame(() => {
      globalThis[EXISTING_CARD_OBSERVER_FRAME_KEY] = undefined;
      hydrateExistingQueueCards();
    });
  };

  hydrateExistingQueueCards();
  queueMicrotask(hydrateExistingQueueCards);
  requestAnimationFrame(hydrateExistingQueueCards);
  HYDRATION_RETRY_DELAYS_MS.forEach((delay) => {
    window.setTimeout(hydrateExistingQueueCards, delay);
  });

  if (!globalThis[EXISTING_CARD_OBSERVER_KEY]) {
    const observer = new MutationObserver(() => {
      scheduleExistingQueueCardHydration();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    globalThis[EXISTING_CARD_OBSERVER_KEY] = observer;
  }

  if (!globalThis[EXISTING_CARD_LISTENER_KEY]) {
    const rehydrate = () => {
      scheduleExistingQueueCardHydration();
    };

    window.addEventListener("pageshow", rehydrate);
    window.addEventListener("focus", rehydrate);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        rehydrate();
      }
    });

    globalThis[EXISTING_CARD_LISTENER_KEY] = rehydrate;
  }

  log("applied");
};

customElements.whenDefined("mpc-queue-card").then(patchQueueCard).catch((error) => {
  console.error("mass-player-card hotfix failed", error);
});
