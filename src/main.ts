import './styles/main.css';
import { SolarScene } from './scene/SolarScene';
import { HudController } from './ui/HudController';
import type { BodyId, HudHandlers, ScaleMode, SimState, VisualToggles } from './types';

const canvasContainer = document.getElementById('canvas-container');
const hudRoot = document.getElementById('hud-root');

if (!canvasContainer || !hudRoot) {
  throw new Error('Missing #canvas-container or #hud-root mount elements in index.html');
}

const state: SimState = {
  scaleMode: 'explorer',
  selectedBody: 'earth',
  compareA: 'sun',
  compareB: 'earth',
  paused: false,
  timeSpeed: 2,
  toggles: {
    showOrbits: true,
    showLabels: true,
    showAxes: true,
    realisticLighting: false,
    showAsteroidBelt: true,
  },
};

const cloneState = (): SimState => ({
  ...state,
  toggles: { ...state.toggles },
});

let scene: SolarScene | null = null;

const handlers: HudHandlers = {
  onScaleMode(mode: ScaleMode) {
    state.scaleMode = mode;
    if (mode === 'compare') {
      scene?.setCompareBodies(state.compareA, state.compareB);
    }
    scene?.setScaleMode(mode);
    hud.updateState(cloneState());
  },

  onSelectBody(id: BodyId | null) {
    if (id !== null && state.scaleMode === 'compare') {
      state.scaleMode = 'explorer';
      scene?.setScaleMode('explorer');
    }
    state.selectedBody = id;
    scene?.focusBody(id);
    hud.updateState(cloneState());
  },

  onCompareChange(idA: BodyId, idB: BodyId) {
    state.compareA = idA;
    state.compareB = idB;
    scene?.setCompareBodies(idA, idB);
    hud.updateState(cloneState());
  },

  onTogglePause() {
    state.paused = !state.paused;
    scene?.setPaused(state.paused);
    hud.updateState(cloneState());
  },

  onTimeSpeed(daysPerSec: number) {
    state.timeSpeed = daysPerSec;
    if (daysPerSec <= 0) {
      state.paused = true;
      scene?.setPaused(true);
    } else if (state.paused) {
      state.paused = false;
      scene?.setPaused(false);
    }
    scene?.setTimeSpeed(daysPerSec);
    hud.updateState(cloneState());
  },

  onToggleVisual(key: keyof VisualToggles, value: boolean) {
    state.toggles = {
      ...state.toggles,
      [key]: value,
    };
    scene?.setToggles({ [key]: value });
    hud.updateState(cloneState());
  },

  onResetView() {
    scene?.resetView();
  },
};

const hud = new HudController(hudRoot, cloneState(), handlers);

scene = new SolarScene(canvasContainer, {
  onSelectBody(id: BodyId | null) {
    if (state.scaleMode === 'compare') {
      return;
    }
    state.selectedBody = id;
    scene?.focusBody(id);
    hud.updateState(cloneState());
  },
  onFrame(labels, simDays) {
    hud.updateLabels(labels);
    hud.updateSimDate(simDays);
  },
});

scene.setCompareBodies(state.compareA, state.compareB);
scene.setScaleMode(state.scaleMode);
scene.setPaused(state.paused);
scene.setTimeSpeed(state.timeSpeed);
scene.setToggles(state.toggles);

window.addEventListener('beforeunload', () => {
  scene?.dispose();
});
