/**
 * StatsForm Component
 * Handles EV/IV input, nature selection, and level input
 */

import React, { useState } from 'react';
import { NATURES, STAT_COLORS } from '../utils/pokemonConstants';

const STAT_NAMES = { hp: 'HP', atk: 'ATK', def: 'DEF', spa: 'SPA', spd: 'SPD', spe: 'SPE' };
const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export function StatsForm({
  userEvs,
  setUserEvs,
  evRaw,
  setEvRaw,
  userIvs,
  setUserIvs,
  selectedNature,
  setSelectedNature,
  levelRaw,
  setLevelRaw,
  calculatedStats,
}) {
  const [activeTab, setActiveTab] = useState('ev'); // 'ev' or 'iv'

  const handleEvChange = (stat, value) => {
    // Parse value: "252+" → 252, "84" → 84, etc.
    let num = parseInt(value.replace(/[^\d]/g, '')) || 0;
    num = Math.max(0, Math.min(252, num));
    
    const newEvs = { ...userEvs, [stat]: num };
    const total = Object.values(newEvs).reduce((a, b) => a + b, 0);
    
    setUserEvs(newEvs);
    setEvRaw({ ...evRaw, [stat]: value });
  };

  const handleIvChange = (stat, value) => {
    let num = parseInt(value) || 0;
    num = Math.max(0, Math.min(31, num));
    setUserIvs({ ...userIvs, [stat]: num });
  };

  const totalEv = Object.values(userEvs).reduce((a, b) => a + b, 0);

  return (
    <div style={{ padding: '12px', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
        <button
          onClick={() => setActiveTab('ev')}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: activeTab === 'ev' ? 'rgba(255,255,255,0.1)' : 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: activeTab === 'ev' ? '600' : '400',
            borderBottom: activeTab === 'ev' ? '2px solid #4da6ff' : 'none',
          }}
        >
          EVs
        </button>
        <button
          onClick={() => setActiveTab('iv')}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: activeTab === 'iv' ? 'rgba(255,255,255,0.1)' : 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: activeTab === 'iv' ? '600' : '400',
            borderBottom: activeTab === 'iv' ? '2px solid #4da6ff' : 'none',
          }}
        >
          IVs
        </button>
      </div>

      {/* EV Tab */}
      {activeTab === 'ev' && (
        <div>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#aaa' }}>
            Total: {totalEv} / 510
          </div>
          {STAT_ORDER.map(stat => (
            <div key={stat} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ width: 40, fontSize: 12, fontWeight: 600, color: STAT_COLORS[stat] }}>
                {STAT_NAMES[stat]}
              </label>
              <input
                type="text"
                value={evRaw[stat] || userEvs[stat]}
                onChange={(e) => handleEvChange(stat, e.target.value)}
                placeholder="0"
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: 12,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* IV Tab */}
      {activeTab === 'iv' && (
        <div>
          {STAT_ORDER.map(stat => (
            <div key={stat} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ width: 40, fontSize: 12, fontWeight: 600, color: STAT_COLORS[stat] }}>
                {STAT_NAMES[stat]}
              </label>
              <input
                type="number"
                min="0"
                max="31"
                value={userIvs[stat]}
                onChange={(e) => handleIvChange(stat, e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: 12,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Nature */}
      <div style={{ marginTop: 12, marginBottom: 12, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 12 }}>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 600 }}>
          Nature
        </label>
        <select
          value={selectedNature}
          onChange={(e) => setSelectedNature(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(0,0,0,0.3)',
            color: '#fff',
            fontSize: 12,
          }}
        >
          {Object.keys(NATURES).map(nature => (
            <option key={nature} value={nature}>
              {nature}
            </option>
          ))}
        </select>
      </div>

      {/* Level */}
      <div>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 600 }}>
          Level
        </label>
        <input
          type="number"
          min="1"
          max="100"
          value={levelRaw}
          onChange={(e) => setLevelRaw(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(0,0,0,0.3)',
            color: '#fff',
            fontSize: 12,
          }}
        />
      </div>

      {/* Display Calculated Stats */}
      {calculatedStats && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Calculated Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {STAT_ORDER.map(stat => (
              <div key={stat}>
                <span style={{ color: STAT_COLORS[stat], fontWeight: 600 }}>
                  {STAT_NAMES[stat]}:
                </span>
                <span style={{ marginLeft: 4, color: '#fff' }}>
                  {calculatedStats[stat] || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default StatsForm;
