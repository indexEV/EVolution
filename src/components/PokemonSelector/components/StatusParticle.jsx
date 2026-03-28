/**
 * StatusParticle Component
 * Renders animated particle effects for status conditions
 */

import React from 'react';

function makeParticle(statusId) {
  const BRN_COLORS = ['#FF7034','#FFB030','#FF4010','#FFE060','#FF5520','#FFCC00'];
  const PSN_COLOR  = '#B97FC9';
  const TOX_COLOR  = '#7B3F8C';
  return {
    brn:  { colors: BRN_COLORS, count: 8, size: () => 3 + Math.random() * 3 },
    par:  { color: '#F8D030', count: 6, size: () => 2 + Math.random() * 2 },
    psn:  { color: PSN_COLOR, count: 5, size: () => 2 + Math.random() * 2 },
    tox:  { color: TOX_COLOR, count: 5, size: () => 2 + Math.random() * 2 },
    frz:  { color: '#60C8F8', count: 7, size: () => 2 + Math.random() * 3 },
    slp:  { color: '#A8A8A8', count: 4, size: () => 2 + Math.random() * 2 },
  }[statusId] || { color: '#FFF', count: 3, size: () => 2 };
}

export function StatusParticle({ type, p }) {
  const config = makeParticle(type);
  
  // Use single color or pick from array
  const getColor = () => {
    if (Array.isArray(config.colors)) {
      return config.colors[Math.floor(Math.random() * config.colors.length)];
    }
    return config.color;
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: p.x,
        top: p.y,
        width: p.size,
        height: p.size,
        backgroundColor: p.color || getColor(),
        borderRadius: '50%',
        pointerEvents: 'none',
        animation: `float ${p.duration}s ease-out forwards`,
      }}
    />
  );
}

export default StatusParticle;
