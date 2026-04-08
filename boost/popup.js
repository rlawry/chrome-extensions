const STORAGE_KEY = 'volumeBoost';
const DEFAULT_BOOST = 1.0;

const boostInput = document.getElementById('boost');
const boostValue = document.getElementById('boostValue');
const resetBtn = document.getElementById('resetBtn');

function percentToBoost(percent) {
  return Math.max(1, Number(percent) / 100);
}

function boostToPercent(boost) {
  return Math.round(Number(boost) * 100);
}

function render(percent) {
  boostInput.value = String(percent);
  boostValue.textContent = `${percent}%`;
}

async function loadValue() {
  const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_BOOST });
  render(boostToPercent(stored[STORAGE_KEY]));
}

async function savePercent(percent) {
  const boost = percentToBoost(percent);
  await chrome.storage.sync.set({ [STORAGE_KEY]: boost });
  render(Number(percent));
}

boostInput.addEventListener('input', async (event) => {
  await savePercent(event.target.value);
});

resetBtn.addEventListener('click', async () => {
  await savePercent(100);
});

loadValue().catch((err) => {
  console.error('YouTube Volume Boost popup failed to load.', err);
});
