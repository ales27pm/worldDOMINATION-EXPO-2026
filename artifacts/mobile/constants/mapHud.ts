import type { TextStyle } from 'react-native';

/**
 * Transparent map chrome. Passive surfaces leave the board almost untouched;
 * controls and decision sheets add only enough tint to keep their text usable.
 */
export const MapHud = {
  surface: 'rgba(21,13,9,0.12)',
  control: 'rgba(21,13,9,0.22)',
  focused: 'rgba(21,13,9,0.34)',
  modal: 'rgba(21,13,9,0.40)',
  scrim: 'rgba(0,0,0,0.08)',
  parchment: 'rgba(238,229,201,0.48)',
  textShadow: 'rgba(8,5,2,0.98)',
} as const;

export const MAP_HUD_TEXT_SHADOW: TextStyle = {
  textShadowColor: MapHud.textShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};
