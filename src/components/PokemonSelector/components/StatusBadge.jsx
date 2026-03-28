/**
 * StatusBadge Component
 * Displays a status condition badge with color and label
 */

import React from 'react';
import { STATUS_CONDITIONS } from '../utils/pokemonConstants';

export function StatusBadge({ statusId, label, title }) {
  const status = STATUS_CONDITIONS.find(s => s.id === statusId);

  if (!status) return null;

  return (
    <div
      title={title || status.name}
      style={{
        display: 'inline-block',
        backgroundColor: status.bg,
        border: `1px solid ${status.color}`,
        borderRadius: 4,
        padding: '2px 8px',
        marginRight: 4,
        color: status.color,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {label || status.label}
    </div>
  );
}

export default StatusBadge;
