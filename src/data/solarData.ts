import type { BodyData, BodyId, ScaleMode } from '../types';

export const EARTH_RADIUS_KM = 6371;
export const SUN_RADIUS_KM = 696000;
export const AU_KM = 149597871;
export const LIGHT_SPEED_KM_PER_SEC = 299792.458;

export const SOLAR_BODIES: BodyData[] = [
  {
    id: 'sun',
    name: 'Sun',
    subtitle: 'Yellow Dwarf Star',
    type: 'star',
    radiusKm: SUN_RADIUS_KM,
    distanceAu: 0,
    orbitPeriodDays: 0,
    rotationPeriodHours: 609.12,
    axialTiltDeg: 7.25,
    orbitalInclinationDeg: 0,
    color: '#ffb703',
    accentColor: '#fb8500',
    kidFacts: [
      '109 Earths could line up side by side across the Sun, and about 1.3 million Earths would fit inside it!',
      'The Sun holds 99.86% of all the mass in the entire Solar System.',
      'Sunlight takes about 8 minutes and 20 seconds to zip across space and reach Earth.',
    ],
    scaleAnalogy: 'If the Sun were a giant basketball (24 cm wide), Earth would be a tiny sesame seed 26 meters away!',
    funBadge: '99.86% of All Mass',
  },
  {
    id: 'mercury',
    name: 'Mercury',
    subtitle: 'Speedy Inner World',
    type: 'terrestrial',
    radiusKm: 2439.7,
    distanceAu: 0.387,
    orbitPeriodDays: 87.97,
    rotationPeriodHours: 1407.6,
    axialTiltDeg: 0.03,
    orbitalInclinationDeg: 7.0,
    color: '#b5b2a8',
    accentColor: '#8d887d',
    kidFacts: [
      'A year on Mercury is only 88 Earth days long — it zooms around the Sun faster than any other planet!',
      'Mercury has almost no tilt (0.03°), so it has no seasons at all.',
      'Sunlight reaches Mercury in just 3 minutes and 13 seconds.',
    ],
    scaleAnalogy: 'If the Sun were a basketball, Mercury would be a tiny grain of sand about 10 meters away.',
    funBadge: 'Fastest Orbit',
  },
  {
    id: 'venus',
    name: 'Venus',
    subtitle: 'Backwards-Spinning Furnace',
    type: 'terrestrial',
    radiusKm: 6051.8,
    distanceAu: 0.723,
    orbitPeriodDays: 224.7,
    rotationPeriodHours: -5832.5,
    axialTiltDeg: 177.4,
    orbitalInclinationDeg: 3.39,
    color: '#e9c46a',
    accentColor: '#f4a261',
    kidFacts: [
      'Venus is flipped upside down (177.4° tilt), so it spins backwards compared to almost every other planet!',
      'A single spin on Venus takes 243 Earth days — longer than its 225-day year!',
      'Thick clouds trap heat so well that Venus is hotter than Mercury, even though it is farther from the Sun.',
    ],
    scaleAnalogy: 'Almost Earth’s twin in size — a sesame seed about 19 meters from a basketball Sun.',
    funBadge: 'Spins Backwards',
  },
  {
    id: 'earth',
    name: 'Earth',
    subtitle: 'Our Blue Marble',
    type: 'terrestrial',
    radiusKm: EARTH_RADIUS_KM,
    distanceAu: 1.0,
    orbitPeriodDays: 365.25,
    rotationPeriodHours: 23.93,
    axialTiltDeg: 23.44,
    orbitalInclinationDeg: 0,
    color: '#3b82f6',
    accentColor: '#22c55e',
    moons: [
      {
        id: 'moon',
        name: 'Moon',
        radiusKm: 1737.4,
        orbitRadiusKm: 384400,
        orbitPeriodDays: 27.32,
        color: '#cbd5e1',
      },
    ],
    kidFacts: [
      'Earth’s 23.4° axial tilt gives us spring, summer, autumn, and winter as we orbit the Sun.',
      'About 71% of Earth’s surface is covered in liquid water — the only known planet with oceans on the surface.',
      'Sunlight takes 8 minutes and 20 seconds to travel 150 million km (1 AU) to reach us.',
    ],
    scaleAnalogy: 'A sesame seed (2.2 mm) sitting 26 meters (a quarter of a soccer field) from a basketball Sun.',
    funBadge: 'Home Sweet Home',
  },
  {
    id: 'mars',
    name: 'Mars',
    subtitle: 'The Rusty Red Planet',
    type: 'terrestrial',
    radiusKm: 3389.5,
    distanceAu: 1.524,
    orbitPeriodDays: 686.98,
    rotationPeriodHours: 24.62,
    axialTiltDeg: 25.19,
    orbitalInclinationDeg: 1.85,
    color: '#e76f51',
    accentColor: '#c1440e',
    kidFacts: [
      'Mars is home to Olympus Mons, a volcano three times taller than Mount Everest!',
      'A Martian day is almost the same length as an Earth day: 24 hours and 37 minutes.',
      'You could fit about 6.6 Mars-sized planets inside Earth, and light takes 12.7 minutes from the Sun to Mars.',
    ],
    scaleAnalogy: 'A tiny poppy seed sitting 39 meters away from our basketball Sun.',
    funBadge: 'Tallest Volcano',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    subtitle: 'King of the Planets',
    type: 'gas-giant',
    radiusKm: 69911,
    distanceAu: 5.204,
    orbitPeriodDays: 4332.59,
    rotationPeriodHours: 9.93,
    axialTiltDeg: 3.13,
    orbitalInclinationDeg: 1.31,
    color: '#d4a373',
    accentColor: '#bc6c25',
    moons: [
      {
        id: 'io',
        name: 'Io',
        radiusKm: 1821.6,
        orbitRadiusKm: 421700,
        orbitPeriodDays: 1.77,
        color: '#facc15',
      },
      {
        id: 'europa',
        name: 'Europa',
        radiusKm: 1560.8,
        orbitRadiusKm: 671100,
        orbitPeriodDays: 3.55,
        color: '#e2e8f0',
      },
      {
        id: 'ganymede',
        name: 'Ganymede',
        radiusKm: 2634.1,
        orbitRadiusKm: 1070400,
        orbitPeriodDays: 7.15,
        color: '#a8a29e',
      },
      {
        id: 'callisto',
        name: 'Callisto',
        radiusKm: 2410.3,
        orbitRadiusKm: 1882700,
        orbitPeriodDays: 16.69,
        color: '#78716c',
      },
    ],
    kidFacts: [
      'Jupiter is so huge that 11 Earths fit across its middle — and over 1,300 Earths could fit inside!',
      'Even though it is the biggest planet, Jupiter spins the fastest: a full day is under 10 hours!',
      'Its Great Red Spot is a giant storm bigger than Earth that has been swirling for centuries.',
    ],
    scaleAnalogy: 'A plump grape or ping-pong ball (2.4 cm) about 134 meters from a basketball Sun.',
    funBadge: '1,300× Earth Volume',
  },
  {
    id: 'saturn',
    name: 'Saturn',
    subtitle: 'Jewel of the Solar System',
    type: 'gas-giant',
    radiusKm: 58232,
    distanceAu: 9.582,
    orbitPeriodDays: 10759.22,
    rotationPeriodHours: 10.7,
    axialTiltDeg: 26.73,
    orbitalInclinationDeg: 2.49,
    color: '#e6cc9c',
    accentColor: '#d4a359',
    hasRings: true,
    ringInnerRatio: 1.24,
    ringOuterRatio: 2.35,
    kidFacts: [
      'Saturn’s dazzling rings stretch 282,000 km wide, yet in many places they are only as thick as a house!',
      'Saturn is less dense than water — if you had a gigantic cosmic bathtub, Saturn would float!',
      'Sunlight takes about 1 hour and 20 minutes to reach Saturn’s golden clouds.',
    ],
    scaleAnalogy: 'A large marble (2 cm) with paper-thin rings, 247 meters from a basketball Sun.',
    funBadge: 'Would Float in Water',
  },
  {
    id: 'uranus',
    name: 'Uranus',
    subtitle: 'The Sideways Ice Giant',
    type: 'ice-giant',
    radiusKm: 25362,
    distanceAu: 19.201,
    orbitPeriodDays: 30688.5,
    rotationPeriodHours: -17.24,
    axialTiltDeg: 97.77,
    orbitalInclinationDeg: 0.77,
    color: '#7dd3fc',
    accentColor: '#38bdf8',
    hasRings: true,
    ringInnerRatio: 1.55,
    ringOuterRatio: 1.95,
    kidFacts: [
      'Uranus is tipped right onto its side at 97.8°, so it rolls around the Sun like a bowling ball!',
      'Each pole gets 42 years of continuous sunlight followed by 42 years of winter darkness.',
      'About 63 Earths could fit inside Uranus, and sunlight takes 2 hours and 40 minutes to get there.',
    ],
    scaleAnalogy: 'A green pea (0.9 cm) rolling nearly half a kilometer (495 m) from a basketball Sun.',
    funBadge: 'Rolls on Its Side',
  },
  {
    id: 'neptune',
    name: 'Neptune',
    subtitle: 'Windy Deep-Blue Frontier',
    type: 'ice-giant',
    radiusKm: 24622,
    distanceAu: 30.07,
    orbitPeriodDays: 60182,
    rotationPeriodHours: 16.11,
    axialTiltDeg: 28.32,
    orbitalInclinationDeg: 1.77,
    color: '#3b66f5',
    accentColor: '#60a5fa',
    kidFacts: [
      'Neptune has the fiercest supersonic winds in the Solar System — over 2,000 km/h!',
      'One year on Neptune lasts 165 Earth years; it finished its first full orbit since discovery in 2011.',
      'Sunlight takes more than 4 hours and 10 minutes to reach Neptune, 30 times farther than Earth.',
    ],
    scaleAnalogy: 'A small pea (0.85 cm) sitting 775 meters (nearly 8 football fields!) from a basketball Sun.',
    funBadge: 'Supersonic Winds',
  },
];

export const BODY_BY_ID: Record<BodyId, BodyData> = SOLAR_BODIES.reduce(
  (acc, body) => {
    acc[body.id] = body;
    return acc;
  },
  {} as Record<BodyId, BodyData>
);

const EXPLORER_METRICS: Record<BodyId, { radius: number; orbitRadius: number }> = {
  sun: { radius: 9.5, orbitRadius: 0 },
  mercury: { radius: 0.65, orbitRadius: 15 },
  venus: { radius: 1.0, orbitRadius: 20.5 },
  earth: { radius: 1.1, orbitRadius: 26.5 },
  mars: { radius: 0.8, orbitRadius: 33 },
  jupiter: { radius: 3.4, orbitRadius: 47 },
  saturn: { radius: 2.9, orbitRadius: 61 },
  uranus: { radius: 1.9, orbitRadius: 74 },
  neptune: { radius: 1.85, orbitRadius: 86 },
};

const TRUE_SIZE_ORBITS: Record<BodyId, number> = {
  sun: 0,
  mercury: 32,
  venus: 36,
  earth: 40,
  mars: 44,
  jupiter: 56,
  saturn: 68,
  uranus: 79,
  neptune: 88,
};

const TRUE_SIZE_EARTH_UNITS = 0.25;

export function getScaleMetrics(
  body: BodyData,
  mode: ScaleMode
): { radius: number; orbitRadius: number } {
  if (mode === 'explorer') {
    return { ...EXPLORER_METRICS[body.id] };
  }

  if (mode === 'true-size') {
    const radius = (body.radiusKm / EARTH_RADIUS_KM) * TRUE_SIZE_EARTH_UNITS;
    return {
      radius,
      orbitRadius: TRUE_SIZE_ORBITS[body.id],
    };
  }

  if (mode === 'true-scale') {
    const radius = body.radiusKm / SUN_RADIUS_KM;
    const orbitRadius = (body.distanceAu * AU_KM) / SUN_RADIUS_KM;
    return { radius, orbitRadius };
  }

  // 'compare' mode: exact relative radii, orbits unused
  return {
    radius: (body.radiusKm / EARTH_RADIUS_KM) * TRUE_SIZE_EARTH_UNITS,
    orbitRadius: 0,
  };
}

export function formatLightTime(distanceAu: number): string {
  if (distanceAu <= 0) return '0 s (light source)';
  const seconds = (distanceAu * AU_KM) / LIGHT_SPEED_KM_PER_SEC;
  if (seconds < 60) {
    return `${Math.round(seconds)} sec`;
  }
  const totalMinutes = seconds / 60;
  if (totalMinutes < 60) {
    const mins = Math.floor(totalMinutes);
    const secs = Math.round(seconds - mins * 60);
    return secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes - hours * 60);
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

function formatRatio(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)} million`;
  }
  if (value >= 1000) {
    return Math.round(value).toLocaleString('en-US');
  }
  if (value >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function getRatioAnalogy(diameterRatio: number, largerName: string, smallerName: string): string {
  if (diameterRatio < 1.15) {
    return `${largerName} and ${smallerName} are almost size twins — like comparing two tennis balls!`;
  }
  if (diameterRatio < 2.2) {
    return `Like a baseball (${largerName}) next to a golf ball (${smallerName}).`;
  }
  if (diameterRatio < 4.5) {
    return `Like a basketball (${largerName}) next to a tennis ball (${smallerName}).`;
  }
  if (diameterRatio < 8) {
    return `Like a soccer ball (${largerName}) next to a ping-pong ball (${smallerName}).`;
  }
  if (diameterRatio < 15) {
    return `Like a basketball (${largerName}) next to a grape (${smallerName}).`;
  }
  if (diameterRatio < 35) {
    return `Like a big beach ball (${largerName}) next to a marble (${smallerName}).`;
  }
  if (diameterRatio < 90) {
    return `Like a giant exercise ball (${largerName}) next to a green pea (${smallerName}).`;
  }
  if (diameterRatio < 160) {
    return `Like a basketball (${largerName}) next to a tiny sesame seed (${smallerName})!`;
  }
  return `Like a giant beach ball (${largerName}) next to a tiny poppy seed (${smallerName})!`;
}

export function getComparisonStats(
  idA: BodyId,
  idB: BodyId
): {
  largerId: BodyId;
  smallerId: BodyId;
  diameterRatio: number;
  volumeRatio: number;
  summary: string;
  kidAnalogy: string;
} {
  const bodyA = BODY_BY_ID[idA];
  const bodyB = BODY_BY_ID[idB];

  if (idA === idB) {
    return {
      largerId: idA,
      smallerId: idB,
      diameterRatio: 1,
      volumeRatio: 1,
      summary: `${bodyA.name} vs. ${bodyB.name}: Exact size twins! Pick two different worlds to compare their scale.`,
      kidAnalogy: `Two identical ${bodyA.name}s side by side — 1× across and 1× inside.`,
    };
  }

  const larger = bodyA.radiusKm >= bodyB.radiusKm ? bodyA : bodyB;
  const smaller = bodyA.radiusKm >= bodyB.radiusKm ? bodyB : bodyA;
  const diameterRatio = larger.radiusKm / smaller.radiusKm;
  const volumeRatio = Math.pow(diameterRatio, 3);

  const summary = `${larger.name} is ${formatRatio(diameterRatio)}× wider than ${smaller.name} — about ${formatRatio(volumeRatio)} ${smaller.name}s could fit inside!`;
  const kidAnalogy = getRatioAnalogy(diameterRatio, larger.name, smaller.name);

  return {
    largerId: larger.id,
    smallerId: smaller.id,
    diameterRatio,
    volumeRatio,
    summary,
    kidAnalogy,
  };
}
