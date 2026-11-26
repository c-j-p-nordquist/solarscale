import {
  BODY_BY_ID,
  EARTH_RADIUS_KM,
  SOLAR_BODIES,
  formatLightTime,
  getComparisonStats,
} from '../data/solarData';
import type {
  BodyData,
  BodyId,
  HudHandlers,
  ProjectedLabel,
  ScaleMode,
  SimState,
  VisualToggles,
} from '../types';

interface ModeOption {
  id: ScaleMode;
  icon: string;
  label: string;
  subtitle: string;
  tooltip: string;
}

const SCALE_MODES: ModeOption[] = [
  {
    id: 'explorer',
    icon: '🔭',
    label: 'Explorer',
    subtitle: 'Easy to see all planets',
    tooltip: 'Friendly sizes and orbits so every planet is easy to spot and click',
  },
  {
    id: 'true-size',
    icon: '📏',
    label: 'True Size',
    subtitle: 'Real sizes, close orbits',
    tooltip: 'Exact real planet sizes compared to the Sun, with compact orbits',
  },
  {
    id: 'true-scale',
    icon: '🌌',
    label: 'True Scale',
    subtitle: '1:1 real sizes & space',
    tooltip: 'True 1:1 sizes AND real distances across vast empty space!',
  },
  {
    id: 'compare',
    icon: '⚖️',
    label: 'Compare',
    subtitle: 'Side-by-side size check',
    tooltip: 'Place any two worlds side by side at their exact relative sizes',
  },
];

interface ComparePreset {
  label: string;
  a: BodyId;
  b: BodyId;
}

const COMPARE_PRESETS: ComparePreset[] = [
  { label: 'Sun vs Earth', a: 'sun', b: 'earth' },
  { label: 'Jupiter vs Earth', a: 'jupiter', b: 'earth' },
  { label: 'Earth vs Mars', a: 'earth', b: 'mars' },
  { label: 'Saturn vs Earth', a: 'saturn', b: 'earth' },
];

interface SpeedPreset {
  label: string;
  daysPerSec: number | null; // null => Pause
}

const SPEED_PRESETS: SpeedPreset[] = [
  { label: 'Pause', daysPerSec: null },
  { label: 'Slow', daysPerSec: 0.25 },
  { label: '1 Day/s', daysPerSec: 1 },
  { label: '1 Week/s', daysPerSec: 7 },
  { label: '1 Month/s', daysPerSec: 30 },
  { label: 'Fast', daysPerSec: 120 },
];

interface VisualToggleDef {
  key: keyof VisualToggles;
  label: string;
}

const VISUAL_TOGGLES: VisualToggleDef[] = [
  { key: 'showOrbits', label: 'Orbits' },
  { key: 'showLabels', label: 'Labels' },
  { key: 'showAxes', label: 'Spin Axes' },
  { key: 'realisticLighting', label: 'Day/Night' },
  { key: 'showAsteroidBelt', label: 'Asteroids' },
];

const MOON_SUMMARY: Record<BodyId, { main: string; sub: string }> = {
  sun: { main: '8 Planets', sub: 'Center of system' },
  mercury: { main: '0', sub: 'No moons' },
  venus: { main: '0', sub: 'No moons' },
  earth: { main: '1', sub: 'The Moon (shown)' },
  mars: { main: '2', sub: 'Phobos & Deimos' },
  jupiter: { main: '95', sub: '4 Galilean shown' },
  saturn: { main: '146', sub: 'Titan & icy rings' },
  uranus: { main: '28', sub: 'Faint tilted rings' },
  neptune: { main: '16', sub: 'Triton orbits backwards' },
};

const MIN_SPEED = 0.1;
const MAX_SPEED = 365;

function speedToSlider(daysPerSec: number): number {
  const clamped = Math.max(MIN_SPEED, Math.min(MAX_SPEED, daysPerSec));
  const t = Math.log(clamped / MIN_SPEED) / Math.log(MAX_SPEED / MIN_SPEED);
  return Math.round(t * 100);
}

function sliderToSpeed(sliderVal: number): number {
  const t = Math.max(0, Math.min(1, sliderVal / 100));
  const raw = MIN_SPEED * Math.pow(MAX_SPEED / MIN_SPEED, t);
  if (raw < 1) return Math.round(raw * 20) / 20;
  if (raw < 10) return Math.round(raw * 10) / 10;
  return Math.round(raw);
}

function formatSpeed(daysPerSec: number, paused: boolean): string {
  if (paused) return 'Paused';
  if (daysPerSec < 1) return `${daysPerSec.toFixed(2)} d/s`;
  if (daysPerSec < 10) return `${daysPerSec.toFixed(1)} d/s`;
  if (daysPerSec >= 30) {
    const months = daysPerSec / 30;
    return months >= 10 ? `${Math.round(daysPerSec)} d/s` : `${months.toFixed(1)} mo/s`;
  }
  return `${Math.round(daysPerSec)} d/s`;
}

function formatDiameter(radiusKm: number): { main: string; sub: string } {
  const diameterKm = Math.round(radiusKm * 2);
  const ratio = radiusKm / EARTH_RADIUS_KM;
  const ratioText =
    Math.abs(ratio - 1) < 0.01
      ? '1.00× Earth'
      : ratio >= 10
        ? `${ratio.toFixed(1)}× Earth`
        : `${ratio.toFixed(2)}× Earth`;
  return {
    main: `${diameterKm.toLocaleString('en-US')} km`,
    sub: ratioText,
  };
}

function formatDistance(distanceAu: number): { main: string; sub: string } {
  if (distanceAu <= 0) {
    return { main: '0 AU', sub: 'Center star' };
  }
  return {
    main: `${distanceAu.toFixed(2)} AU`,
    sub: `☀ ${formatLightTime(distanceAu)}`,
  };
}

function formatSpin(rotationHours: number): { main: string; sub: string } {
  const isRetrograde = rotationHours < 0;
  const absHours = Math.abs(rotationHours);
  let main: string;
  if (absHours >= 48) {
    const days = absHours / 24;
    main = `${days >= 100 ? Math.round(days) : days.toFixed(1)} Earth days`;
  } else {
    main = `${absHours.toFixed(1)} hrs`;
  }
  return {
    main,
    sub: isRetrograde ? '↺ Spins backwards' : '↻ Prograde spin',
  };
}

function formatOrbit(orbitDays: number): { main: string; sub: string } {
  if (orbitDays <= 0) {
    return { main: '—', sub: 'Planets orbit it' };
  }
  if (orbitDays >= 730) {
    const years = orbitDays / 365.25;
    return {
      main: `${years >= 100 ? Math.round(years) : years.toFixed(1)} Earth yrs`,
      sub: `${Math.round(orbitDays).toLocaleString('en-US')} days`,
    };
  }
  return {
    main: `${orbitDays.toFixed(1)} days`,
    sub: `${(orbitDays / 365.25).toFixed(2)} Earth yrs`,
  };
}

function formatTilt(tiltDeg: number): { main: string; sub: string } {
  let sub = 'Mild tilt';
  if (tiltDeg < 4) sub = 'Almost upright';
  else if (tiltDeg > 150) sub = 'Upside-down!';
  else if (tiltDeg > 80) sub = 'Rolls sideways!';
  else if (tiltDeg >= 20 && tiltDeg <= 30) sub = 'Strong seasons';
  return { main: `${tiltDeg.toFixed(1)}°`, sub };
}

function formatEarthRatioCallout(body: BodyData): {
  headline: string;
  bodyPct: number;
  earthPct: number;
} {
  const ratio = body.radiusKm / EARTH_RADIUS_KM;
  if (body.id === 'earth') {
    return {
      headline: '1.0× Earth — Our cosmic ruler!',
      bodyPct: 50,
      earthPct: 50,
    };
  }
  if (ratio > 1) {
    const vol = Math.pow(ratio, 3);
    const volStr =
      vol >= 1_000_000
        ? `${(vol / 1_000_000).toFixed(2)}M`
        : vol >= 1000
          ? Math.round(vol).toLocaleString('en-US')
          : Math.round(vol).toString();
    // Log-compressed visual bar so both 4× and 109× remain clearly legible
    const bodyPct = 100;
    const earthPct = Math.max(6, Math.round((1 / Math.pow(ratio, 0.52)) * 100));
    return {
      headline: `${ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2)}× wider • ~${volStr} Earths fit inside`,
      bodyPct,
      earthPct,
    };
  }
  const invVol = Math.pow(1 / ratio, 3);
  return {
    headline: `${ratio.toFixed(2)}× Earth width • ~${invVol.toFixed(1)} fit in Earth`,
    bodyPct: Math.max(12, Math.round(ratio * 100)),
    earthPct: 100,
  };
}

export class HudController {
  private root: HTMLElement;
  private state: SimState;
  private handlers: HudHandlers;
  private factCardCollapsed = false;
  private lastRenderedBodyId: BodyId | null = null;
  private lastSimDateText = '';

  // Cached DOM references
  private simDateEl!: HTMLElement;
  private modeButtons = new Map<ScaleMode, HTMLButtonElement>();
  private compareBarEl!: HTMLElement;
  private compareSelectA!: HTMLSelectElement;
  private compareSelectB!: HTMLSelectElement;
  private compareDotA!: HTMLElement;
  private compareDotB!: HTMLElement;
  private compareSummaryEl!: HTMLElement;
  private compareAnalogyEl!: HTMLElement;
  private comparePresetButtons: { btn: HTMLButtonElement; a: BodyId; b: BodyId }[] = [];

  private factWrapperEl!: HTMLElement;
  private factCardEl!: HTMLElement;
  private factReopenBtn!: HTMLButtonElement;
  private factReopenDot!: HTMLElement;
  private factReopenLabel!: HTMLElement;
  private factAvatarEl!: HTMLElement;
  private factNameEl!: HTMLElement;
  private factBadgeEl!: HTMLElement;
  private factSubtitleEl!: HTMLElement;
  private factSizeValueEl!: HTMLElement;
  private factBodyBarLabelEl!: HTMLElement;
  private factBodyBarFillEl!: HTMLElement;
  private factEarthBarFillEl!: HTMLElement;
  private factAnalogyEl!: HTMLElement;
  private factStatGridEl!: HTMLElement;
  private factListEl!: HTMLElement;

  private playPauseBtn!: HTMLButtonElement;
  private speedSlider!: HTMLInputElement;
  private speedReadoutEl!: HTMLElement;
  private speedPresetButtons: { btn: HTMLButtonElement; daysPerSec: number | null }[] = [];
  private toggleButtons = new Map<keyof VisualToggles, HTMLButtonElement>();
  private planetPillButtons = new Map<BodyId, HTMLButtonElement>();

  private labelsLayerEl!: HTMLElement;
  private labelElements = new Map<
    BodyId,
    { el: HTMLButtonElement; distEl: HTMLSpanElement; lastDist: string }
  >();

  constructor(root: HTMLElement, initialState: SimState, handlers: HudHandlers) {
    this.root = root;
    this.state = { ...initialState, toggles: { ...initialState.toggles } };
    this.handlers = handlers;

    this.buildDom();
    this.updateState(this.state);
    this.updateSimDate(0);
  }

  private buildDom(): void {
    this.root.innerHTML = '';

    // 1. Floating 2D Planet Labels Layer
    this.labelsLayerEl = document.createElement('div');
    this.labelsLayerEl.className = 'labels-layer';
    this.labelsLayerEl.setAttribute('aria-label', 'Planet labels');

    for (const body of SOLAR_BODIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'planet-label is-hidden';
      btn.dataset.bodyId = body.id;

      const dot = document.createElement('span');
      dot.className = 'planet-label-dot';
      dot.style.backgroundColor = body.color;
      dot.style.color = body.color;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = body.name;

      const distSpan = document.createElement('span');
      distSpan.className = 'planet-label-dist';

      btn.append(dot, nameSpan, distSpan);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handlers.onSelectBody(body.id);
      });

      this.labelsLayerEl.appendChild(btn);
      this.labelElements.set(body.id, { el: btn, distEl: distSpan, lastDist: '' });
    }

    // 2. Top Header Bar
    const topbar = document.createElement('header');
    topbar.className = 'hud-topbar';

    const brand = document.createElement('div');
    brand.className = 'topbar-brand glass-panel';

    const emblem = document.createElement('div');
    emblem.className = 'brand-emblem';
    emblem.textContent = '🪐';

    const brandText = document.createElement('div');
    brandText.className = 'brand-text';

    const title = document.createElement('h1');
    title.className = 'brand-title';
    title.textContent = 'Solar System to Scale';

    this.simDateEl = document.createElement('div');
    this.simDateEl.className = 'sim-date-readout';
    this.simDateEl.textContent = 'Day 0 • 0.00 Earth Years';

    brandText.append(title, this.simDateEl);
    brand.append(emblem, brandText);

    // Scale Mode Segmented Switcher
    const switcher = document.createElement('nav');
    switcher.className = 'mode-switcher glass-panel';
    switcher.setAttribute('aria-label', 'Scale Mode');

    for (const mode of SCALE_MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn';
      btn.title = mode.tooltip;
      btn.dataset.mode = mode.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'mode-btn-title';
      titleSpan.textContent = `${mode.icon} ${mode.label}`;

      const subSpan = document.createElement('span');
      subSpan.className = 'mode-btn-sub';
      subSpan.textContent = mode.subtitle;

      btn.append(titleSpan, subSpan);
      btn.addEventListener('click', () => {
        this.handlers.onScaleMode(mode.id);
      });

      switcher.appendChild(btn);
      this.modeButtons.set(mode.id, btn);
    }

    // Reset View button
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'reset-view-btn glass-panel';
    resetBtn.textContent = '↺ Reset View';
    resetBtn.title = 'Recenter the camera on the Solar System';
    resetBtn.addEventListener('click', () => {
      this.handlers.onResetView();
    });

    topbar.append(brand, switcher, resetBtn);

    // 3. Compare Sizes Bar
    this.compareBarEl = document.createElement('section');
    this.compareBarEl.className = 'compare-bar glass-panel is-hidden';
    this.compareBarEl.setAttribute('aria-label', 'Compare Planet Sizes');

    const compareControlsRow = document.createElement('div');
    compareControlsRow.className = 'compare-controls-row';

    const pickers = document.createElement('div');
    pickers.className = 'compare-pickers';

    const { wrap: wrapA, select: selectA, dot: dotA } = this.createCompareSelect('Body A');
    const vsBadge = document.createElement('span');
    vsBadge.className = 'compare-vs-badge';
    vsBadge.textContent = 'VS';
    const { wrap: wrapB, select: selectB, dot: dotB } = this.createCompareSelect('Body B');

    this.compareSelectA = selectA;
    this.compareSelectB = selectB;
    this.compareDotA = dotA;
    this.compareDotB = dotB;

    this.compareSelectA.addEventListener('change', () => {
      this.handlers.onCompareChange(
        this.compareSelectA.value as BodyId,
        this.compareSelectB.value as BodyId
      );
    });

    this.compareSelectB.addEventListener('change', () => {
      this.handlers.onCompareChange(
        this.compareSelectA.value as BodyId,
        this.compareSelectB.value as BodyId
      );
    });

    pickers.append(wrapA, vsBadge, wrapB);

    const presetsWrap = document.createElement('div');
    presetsWrap.className = 'compare-presets';

    for (const preset of COMPARE_PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'compare-preset-btn';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        this.handlers.onCompareChange(preset.a, preset.b);
      });
      presetsWrap.appendChild(btn);
      this.comparePresetButtons.push({ btn, a: preset.a, b: preset.b });
    }

    compareControlsRow.append(pickers, presetsWrap);

    const callout = document.createElement('div');
    callout.className = 'compare-callout';

    this.compareSummaryEl = document.createElement('div');
    this.compareSummaryEl.className = 'compare-summary';

    this.compareAnalogyEl = document.createElement('div');
    this.compareAnalogyEl.className = 'compare-analogy';

    callout.append(this.compareSummaryEl, this.compareAnalogyEl);
    this.compareBarEl.append(compareControlsRow, callout);

    // 4. Right-Side Kid-Friendly Planet Fact Card
    this.factWrapperEl = document.createElement('aside');
    this.factWrapperEl.className = 'fact-card-wrapper';
    this.factWrapperEl.setAttribute('aria-label', 'Planet facts');

    this.factReopenBtn = document.createElement('button');
    this.factReopenBtn.type = 'button';
    this.factReopenBtn.className = 'fact-reopen-btn glass-panel is-hidden';
    this.factReopenDot = document.createElement('span');
    this.factReopenDot.className = 'planet-dot';
    this.factReopenLabel = document.createElement('span');
    this.factReopenLabel.textContent = 'Planet Info';
    this.factReopenBtn.append(this.factReopenDot, this.factReopenLabel);
    this.factReopenBtn.addEventListener('click', () => {
      this.factCardCollapsed = false;
      this.syncFactCardVisibility();
    });

    this.factCardEl = document.createElement('div');
    this.factCardEl.className = 'fact-card glass-panel';

    const factHeader = document.createElement('div');
    factHeader.className = 'fact-card-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'fact-header-left';

    this.factAvatarEl = document.createElement('div');
    this.factAvatarEl.className = 'fact-planet-avatar';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'fact-title-group';

    const nameRow = document.createElement('div');
    nameRow.className = 'fact-name-row';

    this.factNameEl = document.createElement('h2');
    this.factNameEl.className = 'fact-planet-name';

    this.factBadgeEl = document.createElement('span');
    this.factBadgeEl.className = 'fact-fun-badge';

    nameRow.append(this.factNameEl, this.factBadgeEl);

    this.factSubtitleEl = document.createElement('div');
    this.factSubtitleEl.className = 'fact-subtitle';

    titleGroup.append(nameRow, this.factSubtitleEl);
    headerLeft.append(this.factAvatarEl, titleGroup);

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'fact-collapse-btn';
    collapseBtn.title = 'Hide planet card for full-screen space';
    collapseBtn.textContent = '✕';
    collapseBtn.addEventListener('click', () => {
      this.factCardCollapsed = true;
      this.syncFactCardVisibility();
    });

    factHeader.append(headerLeft, collapseBtn);

    const factBody = document.createElement('div');
    factBody.className = 'fact-card-body';

    // Size vs Earth mini-bar
    const sizeBox = document.createElement('div');
    sizeBox.className = 'size-vs-earth';

    const sizeHeader = document.createElement('div');
    sizeHeader.className = 'size-vs-header';
    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'size-vs-label';
    sizeLabel.textContent = 'Size vs Earth';
    this.factSizeValueEl = document.createElement('span');
    this.factSizeValueEl.className = 'size-vs-value';
    sizeHeader.append(sizeLabel, this.factSizeValueEl);

    const sizeBars = document.createElement('div');
    sizeBars.className = 'size-bars';

    const bodyBarRow = document.createElement('div');
    bodyBarRow.className = 'size-bar-row';
    this.factBodyBarLabelEl = document.createElement('span');
    const bodyTrack = document.createElement('div');
    bodyTrack.className = 'size-bar-track';
    this.factBodyBarFillEl = document.createElement('div');
    this.factBodyBarFillEl.className = 'size-bar-fill';
    bodyTrack.appendChild(this.factBodyBarFillEl);
    bodyBarRow.append(this.factBodyBarLabelEl, bodyTrack);

    const earthBarRow = document.createElement('div');
    earthBarRow.className = 'size-bar-row';
    const earthLabel = document.createElement('span');
    earthLabel.textContent = 'Earth';
    const earthTrack = document.createElement('div');
    earthTrack.className = 'size-bar-track';
    this.factEarthBarFillEl = document.createElement('div');
    this.factEarthBarFillEl.className = 'size-bar-fill';
    this.factEarthBarFillEl.style.background = 'linear-gradient(90deg, #3b82f6, #22c55e)';
    earthTrack.appendChild(this.factEarthBarFillEl);
    earthBarRow.append(earthLabel, earthTrack);

    sizeBars.append(bodyBarRow, earthBarRow);
    sizeBox.append(sizeHeader, sizeBars);

    // Kid Scale Analogy Box
    const analogyBox = document.createElement('div');
    analogyBox.className = 'analogy-box';
    const analogyLabel = document.createElement('div');
    analogyLabel.className = 'analogy-label';
    analogyLabel.textContent = '💡 Kid Scale Analogy';
    this.factAnalogyEl = document.createElement('p');
    this.factAnalogyEl.className = 'analogy-text';
    analogyBox.append(analogyLabel, this.factAnalogyEl);

    // 2x3 Stat Grid
    this.factStatGridEl = document.createElement('div');
    this.factStatGridEl.className = 'stat-grid';

    // Fun Kid Facts
    const factsSection = document.createElement('div');
    factsSection.className = 'kid-facts-section';
    const factsHeading = document.createElement('div');
    factsHeading.className = 'kid-facts-heading';
    factsHeading.textContent = '🚀 Fun Space Facts';
    this.factListEl = document.createElement('ul');
    this.factListEl.className = 'kid-facts-list';
    factsSection.append(factsHeading, this.factListEl);

    factBody.append(sizeBox, analogyBox, this.factStatGridEl, factsSection);
    this.factCardEl.append(factHeader, factBody);
    this.factWrapperEl.append(this.factReopenBtn, this.factCardEl);

    // 5. Bottom-Left Time & Visuals Control Pill
    const controlsPanel = document.createElement('section');
    controlsPanel.className = 'controls-panel glass-panel';
    controlsPanel.setAttribute('aria-label', 'Time and visual controls');

    const timeTopRow = document.createElement('div');
    timeTopRow.className = 'time-top-row';

    this.playPauseBtn = document.createElement('button');
    this.playPauseBtn.type = 'button';
    this.playPauseBtn.className = 'play-pause-btn';
    this.playPauseBtn.addEventListener('click', () => {
      this.handlers.onTogglePause();
    });

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'speed-slider-wrap';

    this.speedSlider = document.createElement('input');
    this.speedSlider.type = 'range';
    this.speedSlider.className = 'speed-slider';
    this.speedSlider.min = '0';
    this.speedSlider.max = '100';
    this.speedSlider.step = '1';
    this.speedSlider.setAttribute('aria-label', 'Simulation speed');
    this.speedSlider.addEventListener('input', () => {
      const nextSpeed = sliderToSpeed(Number(this.speedSlider.value));
      this.handlers.onTimeSpeed(nextSpeed);
      if (this.state.paused) {
        this.handlers.onTogglePause();
      }
    });

    this.speedReadoutEl = document.createElement('span');
    this.speedReadoutEl.className = 'speed-readout';

    sliderWrap.append(this.speedSlider, this.speedReadoutEl);
    timeTopRow.append(this.playPauseBtn, sliderWrap);

    const speedPresetsRow = document.createElement('div');
    speedPresetsRow.className = 'speed-presets';

    for (const preset of SPEED_PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        if (preset.daysPerSec === null) {
          if (!this.state.paused) {
            this.handlers.onTogglePause();
          }
        } else {
          this.handlers.onTimeSpeed(preset.daysPerSec);
          if (this.state.paused) {
            this.handlers.onTogglePause();
          }
        }
      });
      speedPresetsRow.appendChild(btn);
      this.speedPresetButtons.push({ btn, daysPerSec: preset.daysPerSec });
    }

    const divider = document.createElement('div');
    divider.className = 'controls-divider';

    const togglesRow = document.createElement('div');
    togglesRow.className = 'visual-toggles';

    for (const toggle of VISUAL_TOGGLES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toggle-chip';

      const dot = document.createElement('span');
      dot.className = 'toggle-indicator';
      const txt = document.createElement('span');
      txt.textContent = toggle.label;

      btn.append(dot, txt);
      btn.addEventListener('click', () => {
        const nextVal = !this.state.toggles[toggle.key];
        this.handlers.onToggleVisual(toggle.key, nextVal);
      });

      togglesRow.appendChild(btn);
      this.toggleButtons.set(toggle.key, btn);
    }

    controlsPanel.append(timeTopRow, speedPresetsRow, divider, togglesRow);

    // 6. Bottom Planet Dock
    const dockContainer = document.createElement('nav');
    dockContainer.className = 'planet-dock-container';
    dockContainer.setAttribute('aria-label', 'Select a planet');

    const dock = document.createElement('div');
    dock.className = 'planet-dock glass-panel';

    for (const body of SOLAR_BODIES) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'planet-pill';
      pill.dataset.bodyId = body.id;

      const dot = document.createElement('span');
      dot.className = body.id === 'saturn' ? 'planet-dot is-saturn' : 'planet-dot';
      dot.style.backgroundColor = body.color;

      const label = document.createElement('span');
      label.textContent = body.name;

      pill.append(dot, label);
      pill.addEventListener('click', () => {
        if (this.state.scaleMode === 'compare') {
          this.handlers.onCompareChange(this.state.compareA, body.id);
        } else {
          this.factCardCollapsed = false;
          this.handlers.onSelectBody(body.id);
        }
      });

      dock.appendChild(pill);
      this.planetPillButtons.set(body.id, pill);
    }

    dockContainer.appendChild(dock);

    this.root.append(
      this.labelsLayerEl,
      topbar,
      this.compareBarEl,
      this.factWrapperEl,
      controlsPanel,
      dockContainer
    );
  }

  private createCompareSelect(ariaLabel: string): {
    wrap: HTMLElement;
    select: HTMLSelectElement;
    dot: HTMLElement;
  } {
    const wrap = document.createElement('label');
    wrap.className = 'compare-select-wrap';

    const dot = document.createElement('span');
    dot.className = 'compare-select-dot';

    const select = document.createElement('select');
    select.className = 'compare-select';
    select.setAttribute('aria-label', ariaLabel);

    for (const body of SOLAR_BODIES) {
      const opt = document.createElement('option');
      opt.value = body.id;
      opt.textContent = body.name;
      select.appendChild(opt);
    }

    wrap.append(dot, select);
    return { wrap, select, dot };
  }

  public updateState(state: SimState): void {
    const prevSelected = this.state.selectedBody;
    this.state = { ...state, toggles: { ...state.toggles } };

    // If a new body was selected, auto-expand the fact card
    if (state.selectedBody && state.selectedBody !== prevSelected) {
      this.factCardCollapsed = false;
    }

    // 1. Scale Mode Switcher
    for (const [modeId, btn] of this.modeButtons.entries()) {
      btn.classList.toggle('is-active', modeId === state.scaleMode);
    }

    // 2. Compare Sizes Bar
    const isCompare = state.scaleMode === 'compare';
    this.compareBarEl.classList.toggle('is-hidden', !isCompare);
    if (isCompare) {
      this.compareSelectA.value = state.compareA;
      this.compareSelectB.value = state.compareB;
      this.compareDotA.style.backgroundColor = BODY_BY_ID[state.compareA].color;
      this.compareDotB.style.backgroundColor = BODY_BY_ID[state.compareB].color;

      const stats = getComparisonStats(state.compareA, state.compareB);
      this.compareSummaryEl.textContent = stats.summary;
      this.compareAnalogyEl.textContent = `💡 ${stats.kidAnalogy}`;

      for (const preset of this.comparePresetButtons) {
        const matches =
          (preset.a === state.compareA && preset.b === state.compareB) ||
          (preset.a === state.compareB && preset.b === state.compareA);
        preset.btn.classList.toggle('is-active', matches);
      }
    }

    // 3. Planet Dock Active Highlight
    for (const [bodyId, pill] of this.planetPillButtons.entries()) {
      const active = isCompare
        ? bodyId === state.compareA || bodyId === state.compareB
        : bodyId === state.selectedBody;
      pill.classList.toggle('is-active', active);
    }

    // 4. Time Controls
    this.playPauseBtn.classList.toggle('is-paused', state.paused);
    this.playPauseBtn.textContent = state.paused ? '▶ Play' : '⏸ Pause';
    this.speedSlider.value = String(speedToSlider(state.timeSpeed));
    this.speedReadoutEl.textContent = formatSpeed(state.timeSpeed, state.paused);

    for (const preset of this.speedPresetButtons) {
      const active =
        preset.daysPerSec === null
          ? state.paused
          : !state.paused && Math.abs(state.timeSpeed - preset.daysPerSec) < 0.05;
      preset.btn.classList.toggle('is-active', active);
    }

    // 5. Visual Toggles
    for (const [key, btn] of this.toggleButtons.entries()) {
      btn.classList.toggle('is-on', state.toggles[key]);
    }

    // 6. Right-Side Planet Fact Card
    if (!isCompare && state.selectedBody && state.selectedBody !== this.lastRenderedBodyId) {
      this.renderFactCard(BODY_BY_ID[state.selectedBody]);
      this.lastRenderedBodyId = state.selectedBody;
    }
    this.syncFactCardVisibility();
  }

  private syncFactCardVisibility(): void {
    const shouldExist =
      this.state.scaleMode !== 'compare' && this.state.selectedBody !== null;

    this.factWrapperEl.classList.toggle('is-hidden', !shouldExist);
    if (!shouldExist) return;

    const body = BODY_BY_ID[this.state.selectedBody!];
    this.factCardEl.classList.toggle('is-hidden', this.factCardCollapsed);
    this.factReopenBtn.classList.toggle('is-hidden', !this.factCardCollapsed);
    this.factReopenDot.style.backgroundColor = body.color;
    this.factReopenLabel.textContent = `${body.name} Facts`;
  }

  private renderFactCard(body: BodyData): void {
    this.factAvatarEl.style.background = `radial-gradient(circle at 32% 32%, ${body.color}, ${body.accentColor})`;
    this.factAvatarEl.classList.toggle('has-ring', Boolean(body.hasRings));

    this.factNameEl.textContent = body.name;
    this.factBadgeEl.textContent = body.funBadge;
    this.factSubtitleEl.textContent = body.subtitle;

    // Size vs Earth bar
    const ratioInfo = formatEarthRatioCallout(body);
    this.factSizeValueEl.textContent = ratioInfo.headline;
    this.factBodyBarLabelEl.textContent = body.name;
    this.factBodyBarFillEl.style.width = `${ratioInfo.bodyPct}%`;
    this.factBodyBarFillEl.style.background = `linear-gradient(90deg, ${body.color}, ${body.accentColor})`;
    this.factEarthBarFillEl.style.width = `${ratioInfo.earthPct}%`;

    // Scale analogy
    this.factAnalogyEl.textContent = body.scaleAnalogy;

    // 2x3 Stat Grid
    const diameter = formatDiameter(body.radiusKm);
    const distance = formatDistance(body.distanceAu);
    const spin = formatSpin(body.rotationPeriodHours);
    const orbit = formatOrbit(body.orbitPeriodDays);
    const tilt = formatTilt(body.axialTiltDeg);
    const moons = MOON_SUMMARY[body.id];

    const stats = [
      { label: 'Diameter', ...diameter },
      { label: 'Distance', ...distance },
      { label: 'Spin (Day)', ...spin },
      { label: 'Orbit (Year)', ...orbit },
      { label: 'Axial Tilt', ...tilt },
      { label: 'Moons', ...moons },
    ];

    this.factStatGridEl.innerHTML = '';
    for (const stat of stats) {
      const cell = document.createElement('div');
      cell.className = 'stat-cell';

      const lbl = document.createElement('span');
      lbl.className = 'stat-label';
      lbl.textContent = stat.label;

      const main = document.createElement('span');
      main.className = 'stat-main';
      main.textContent = stat.main;

      const sub = document.createElement('span');
      sub.className = 'stat-sub';
      sub.textContent = stat.sub;

      cell.append(lbl, main, sub);
      this.factStatGridEl.appendChild(cell);
    }

    // 3 Fun Kid Facts
    this.factListEl.innerHTML = '';
    for (const fact of body.kidFacts) {
      const li = document.createElement('li');
      li.textContent = fact;
      this.factListEl.appendChild(li);
    }
  }

  public updateLabels(labels: ProjectedLabel[]): void {
    const showLabels = this.state.toggles.showLabels;
    const seen = new Set<BodyId>();

    for (const label of labels) {
      seen.add(label.id);
      const entry = this.labelElements.get(label.id);
      if (!entry) continue;

      if (!showLabels || !label.visible) {
        if (!entry.el.classList.contains('is-hidden')) {
          entry.el.classList.add('is-hidden');
        }
        continue;
      }

      if (entry.el.classList.contains('is-hidden')) {
        entry.el.classList.remove('is-hidden');
      }

      entry.el.style.transform = `translate3d(${label.x.toFixed(1)}px, ${label.y.toFixed(1)}px, 0)`;
      entry.el.classList.toggle('is-selected', label.isSelected);

      const nextDist = label.distanceLabel ?? '';
      if (nextDist !== entry.lastDist) {
        entry.distEl.textContent = nextDist;
        entry.lastDist = nextDist;
      }
    }

    // Hide any body not present in this frame's label list
    for (const [id, entry] of this.labelElements.entries()) {
      if (!seen.has(id) && !entry.el.classList.contains('is-hidden')) {
        entry.el.classList.add('is-hidden');
      }
    }
  }

  public updateSimDate(simDays: number): void {
    const safeDays = Math.max(0, simDays);
    const wholeDays = Math.floor(safeDays);
    const years = (safeDays / 365.25).toFixed(2);
    const text = `Day ${wholeDays.toLocaleString('en-US')} • ${years} Earth Years`;
    if (text !== this.lastSimDateText) {
      this.simDateEl.textContent = text;
      this.lastSimDateText = text;
    }
  }
}
