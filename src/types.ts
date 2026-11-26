export type ScaleMode = 'explorer' | 'true-size' | 'true-scale' | 'compare';

export type BodyId =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune';

export interface MoonData {
  id: string;
  name: string;
  radiusKm: number;
  orbitRadiusKm: number;
  orbitPeriodDays: number;
  color: string;
}

export interface BodyData {
  id: BodyId;
  name: string;
  subtitle: string;
  type: 'star' | 'terrestrial' | 'gas-giant' | 'ice-giant';
  radiusKm: number;
  distanceAu: number;
  orbitPeriodDays: number;
  rotationPeriodHours: number;
  axialTiltDeg: number;
  orbitalInclinationDeg: number;
  color: string;
  accentColor: string;
  hasRings?: boolean;
  ringInnerRatio?: number;
  ringOuterRatio?: number;
  moons?: MoonData[];
  kidFacts: string[];
  scaleAnalogy: string;
  funBadge: string;
}

export interface VisualToggles {
  showOrbits: boolean;
  showLabels: boolean;
  showAxes: boolean;
  realisticLighting: boolean;
  showAsteroidBelt: boolean;
}

export interface SimState {
  scaleMode: ScaleMode;
  selectedBody: BodyId | null;
  compareA: BodyId;
  compareB: BodyId;
  paused: boolean;
  timeSpeed: number;
  toggles: VisualToggles;
}

export interface ProjectedLabel {
  id: BodyId;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  color: string;
  isSelected: boolean;
  distanceLabel?: string;
}

export interface SceneCallbacks {
  onSelectBody: (id: BodyId | null) => void;
  onFrame: (labels: ProjectedLabel[], simDays: number) => void;
}

export interface HudHandlers {
  onScaleMode: (mode: ScaleMode) => void;
  onSelectBody: (id: BodyId | null) => void;
  onCompareChange: (idA: BodyId, idB: BodyId) => void;
  onTogglePause: () => void;
  onTimeSpeed: (daysPerSec: number) => void;
  onToggleVisual: (key: keyof VisualToggles, value: boolean) => void;
  onResetView: () => void;
}
