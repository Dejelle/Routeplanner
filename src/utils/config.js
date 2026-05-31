export const POSITION_OPTIONS = [
  { id: 'start',        label: 'Begin' },
  { id: 'quarter',      label: '25%' },
  { id: 'mid',          label: 'Midden' },
  { id: 'threequarter', label: '75%' },
  { id: 'end',          label: 'Einde' },
];

export const DEFAULT_CONFIG = {
  positions: ['start', 'mid', 'end'],
  showIntersections: true,
};

const KEY = 'route_config';

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      positions: Array.isArray(parsed.positions) && parsed.positions.length > 0
        ? parsed.positions
        : DEFAULT_CONFIG.positions,
      showIntersections: typeof parsed.showIntersections === 'boolean'
        ? parsed.showIntersections
        : DEFAULT_CONFIG.showIntersections,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}
