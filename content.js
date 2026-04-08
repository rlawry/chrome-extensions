(() => {
  const STORAGE_KEY = 'volumeBoost';
  const DEFAULT_BOOST = 1.0;
  const MAX_BOOST = 5.0;
  const MIN_BOOST = 1.0;
  const GUI_HOST_ID = 'yt-volume-boost-gui-host';

  const stateMap = new WeakMap();
  let currentBoost = DEFAULT_BOOST;
  let observer = null;
  let resumeListenersBound = false;
  let guiRefs = null;

  function clampBoost(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_BOOST;
    return Math.min(MAX_BOOST, Math.max(MIN_BOOST, num));
  }

  function boostToPercent(boost) {
    return Math.round(clampBoost(boost) * 100);
  }

  function percentToBoost(percent) {
    return clampBoost(Number(percent) / 100);
  }

  async function loadBoost() {
    try {
      const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_BOOST });
      currentBoost = clampBoost(stored[STORAGE_KEY]);
    } catch (err) {
      console.warn('YouTube Volume Boost: failed to load stored value.', err);
      currentBoost = DEFAULT_BOOST;
    }
  }

  async function saveBoost(boost) {
    const nextBoost = clampBoost(boost);
    currentBoost = nextBoost;

    try {
      await chrome.storage.sync.set({ [STORAGE_KEY]: nextBoost });
    } catch (err) {
      console.warn('YouTube Volume Boost: failed to save value.', err);
    }

    renderGui(nextBoost);
    applyBoostToAllVideos();
  }

  function getAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    if (!window.__ytVolumeBoostAudioContext) {
      window.__ytVolumeBoostAudioContext = new Ctx();
    }
    return window.__ytVolumeBoostAudioContext;
  }

  async function tryResumeAudioContext() {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        // Ignore. Another user gesture may succeed later.
      }
    }
  }

  function bindResumeListeners() {
    if (resumeListenersBound) return;
    resumeListenersBound = true;

    const resume = () => {
      void tryResumeAudioContext();
    };

    ['click', 'keydown', 'pointerdown', 'touchstart'].forEach((eventName) => {
      window.addEventListener(eventName, resume, { passive: true, capture: true });
    });
  }

  function applyBoostToAllVideos() {
    document.querySelectorAll('video').forEach((video) => {
      attachBoost(video);
      updateVideoBoost(video, currentBoost);
    });
  }

  function updateVideoBoost(video, boost) {
    const state = stateMap.get(video);
    if (!state) return;
    state.gainNode.gain.value = clampBoost(boost);
    video.dataset.ytVolumeBoost = String(boostToPercent(boost));
  }

  function attachBoost(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    if (stateMap.has(video)) return;

    const ctx = getAudioContext();
    if (!ctx) {
      console.warn('YouTube Volume Boost: AudioContext not supported in this browser.');
      return;
    }

    try {
      const source = ctx.createMediaElementSource(video);
      const gainNode = ctx.createGain();
      gainNode.gain.value = currentBoost;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      stateMap.set(video, { source, gainNode, ctx });
      video.dataset.ytVolumeBoostAttached = 'true';
    } catch (err) {
      console.warn('YouTube Volume Boost: could not attach gain node to video.', err);
    }
  }

  function renderGui(boost) {
    if (!guiRefs) return;

    const percent = boostToPercent(boost);
    guiRefs.value.textContent = `${percent}%`;
    guiRefs.miniValue.textContent = `${percent}%`;

    if (document.activeElement !== guiRefs.slider) {
      guiRefs.slider.value = String(percent);
    }
  }

  function setGuiCollapsed(collapsed) {
    if (!guiRefs) return;
    guiRefs.panel.hidden = collapsed;
    guiRefs.mini.hidden = !collapsed;
  }

  function ensureGui() {
    if (guiRefs && document.getElementById(GUI_HOST_ID)) {
      return guiRefs;
    }

    const existingHost = document.getElementById(GUI_HOST_ID);
    if (existingHost) {
      existingHost.remove();
    }

    const host = document.createElement('div');
    host.id = GUI_HOST_ID;
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.right = '16px';
    host.style.bottom = '16px';
    host.style.zIndex = '2147483647';

    const root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }
      .panel, .mini {
        font-family: Arial, Helvetica, sans-serif;
        color: #f5f5f5;
        background: rgba(15, 15, 15, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 14px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(10px);
      }
      .panel {
        width: 260px;
        padding: 12px;
      }
      .mini {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .title {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
      }
      .subtitle {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.35;
        color: rgba(255, 255, 255, 0.78);
      }
      .value {
        min-width: 56px;
        text-align: right;
        font-size: 16px;
        font-weight: 700;
      }
      .sliderWrap {
        margin-top: 12px;
      }
      input[type="range"] {
        width: 100%;
        margin: 0;
        cursor: pointer;
      }
      .ticks {
        margin-top: 5px;
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.65);
      }
      .actions {
        margin-top: 12px;
        display: flex;
        gap: 8px;
      }
      button {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        padding: 8px 10px;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
      }
      button:hover {
        background: rgba(255, 255, 255, 0.14);
      }
      .grow {
        flex: 1;
      }
      [hidden] {
        display: none !important;
      }
      @media (max-width: 720px) {
        .panel {
          width: 220px;
        }
      }
    `;

    const panel = document.createElement('div');
    panel.className = 'panel';

    const header = document.createElement('div');
    header.className = 'row';

    const headerText = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Volume Boost';
    const subtitle = document.createElement('div');
    subtitle.className = 'subtitle';
    subtitle.textContent = 'Gain for the current YouTube tab';
    headerText.append(title, subtitle);

    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = '100%';

    header.append(headerText, value);

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'sliderWrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '100';
    slider.max = '500';
    slider.step = '5';
    slider.value = '100';
    slider.setAttribute('aria-label', 'Volume boost percentage');

    const ticks = document.createElement('div');
    ticks.className = 'ticks';
    ticks.innerHTML = '<span>100%</span><span>300%</span><span>500%</span>';

    sliderWrap.append(slider, ticks);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'grow';
    resetBtn.textContent = 'Reset';

    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.textContent = 'Hide';

    actions.append(resetBtn, hideBtn);
    panel.append(header, sliderWrap, actions);

    const mini = document.createElement('div');
    mini.className = 'mini';
    mini.hidden = true;

    const miniLabel = document.createElement('span');
    miniLabel.textContent = 'Boost';
    miniLabel.style.fontWeight = '700';

    const miniValue = document.createElement('span');
    miniValue.textContent = '100%';

    const showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.textContent = 'Show';

    mini.append(miniLabel, miniValue, showBtn);
    root.append(style, panel, mini);

    slider.addEventListener('input', () => {
      void saveBoost(percentToBoost(slider.value));
    });

    resetBtn.addEventListener('click', () => {
      void saveBoost(DEFAULT_BOOST);
    });

    hideBtn.addEventListener('click', () => {
      setGuiCollapsed(true);
    });

    showBtn.addEventListener('click', () => {
      setGuiCollapsed(false);
    });

    guiRefs = { host, panel, mini, slider, value, miniValue };

    (document.body || document.documentElement).appendChild(host);
    renderGui(currentBoost);
    return guiRefs;
  }

  function observeVideoChanges() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      let foundVideo = false;
      let guiMissing = !document.getElementById(GUI_HOST_ID);

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.tagName === 'VIDEO' || node.querySelector?.('video')) {
              foundVideo = true;
            }
          }
        }

        if (foundVideo && !guiMissing) break;
      }

      if (guiMissing) {
        ensureGui();
      }

      if (foundVideo) {
        applyBoostToAllVideos();
      }
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes[STORAGE_KEY]) return;
    currentBoost = clampBoost(changes[STORAGE_KEY].newValue);
    renderGui(currentBoost);
    applyBoostToAllVideos();
  });

  async function init() {
    await loadBoost();
    bindResumeListeners();
    await tryResumeAudioContext();
    ensureGui();
    applyBoostToAllVideos();
    observeVideoChanges();

    document.addEventListener('yt-navigate-finish', () => {
      setTimeout(() => {
        ensureGui();
        renderGui(currentBoost);
        applyBoostToAllVideos();
      }, 300);
    });
  }

  init().catch((err) => {
    console.error('YouTube Volume Boost: initialization failed.', err);
  });
})();
