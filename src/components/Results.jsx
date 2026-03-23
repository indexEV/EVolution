import { useState, useEffect, useRef } from 'react';
import { solveSpreads, toShowdownEvLine, toShowdownSet } from '../solver/solver.js';
import '../styles/Results.css';

const STAT_COLORS = {
  hp: '#D8B8FF', atk: '#B8D8FF', def: '#98D8B8',
  spa: '#C8E8A0', spd: '#F0F080', spe: '#F8B860',
};
const STAT_LABELS = { hp:'HP', atk:'ATK', def:'DEF', spa:'SPA', spd:'SPD', spe:'SPE' };

function StatPill({ stat, value }) {
  if (!value) return null;
  return (
    <span className="result-stat-pill" style={{ '--stat-color': STAT_COLORS[stat] }}>
      <span className="result-stat-name">{STAT_LABELS[stat]}</span>
      <span className="result-stat-val">{value}</span>
    </span>
  );
}

function CopyBtn({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button className={`result-copy-btn ${copied ? 'copied' : ''}`} onClick={handle}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}

function ConstraintResult({ cr }) {
  const { c, passed, desc, range, threat } = cr;
  const typeLabel = c.type === 'shield' ? 'SURVIVE' : c.type === 'sword' ? 'KO' : 'OUTSPEED';
  const typeColor = c.type === 'shield' ? '#78c850' : c.type === 'sword' ? '#f85050' : '#60c8f8';

  return (
    <div className={`cr-row ${passed ? 'cr-pass' : 'cr-fail'}`}>
      <span className="cr-icon">{passed ? '✓' : '✗'}</span>
      <span className="cr-type" style={{ color: typeColor }}>{typeLabel}</span>
      {threat && <span className="cr-threat">{threat.name}</span>}
      <span className="cr-desc">{desc}</span>
      {range && <span className={`cr-range ${c.type === 'sword' ? 'offensive' : ''}`}>{range}</span>}
    </div>
  );
}

function SpreadCard({ spread, idx, userPokemon, userFullState, isMin }) {
  const { evs, total, remaining, constraintResults, allPassed } = spread;
  const showdown = toShowdownSet(userPokemon, userFullState, evs);
  const evLine = toShowdownEvLine(evs);

  return (
    <div className={`spread-card ${allPassed ? '' : 'spread-fail'} ${isMin ? 'spread-min' : ''}`}>
      <div className="spread-card-header">
        <div className="spread-header-left">
          {isMin && <span className="spread-badge-min">MINIMUM</span>}
          {allPassed
            ? <span className="spread-badge-ok">✓ All constraints pass</span>
            : <span className="spread-badge-fail">✗ Constraints not met</span>}
        </div>
        <div className="spread-header-right">
          <span className="spread-total">{total} EVs used</span>
          {remaining > 0 && (
            <span className="spread-remaining">+{remaining} free</span>
          )}
          <CopyBtn text={showdown} label="Copy Set" />
          <CopyBtn text={evLine || '(no EVs)'} label="Copy EVs" />
        </div>
      </div>

      <div className="spread-stats">
        {Object.entries(evs).map(([stat, val]) => (
          val > 0 ? <StatPill key={stat} stat={stat} value={val} /> : null
        ))}
        {total === 0 && <span className="spread-no-evs">No EVs required</span>}
      </div>

      {remaining > 0 && (
        <div className="spread-suggestions">
          <span className="spread-suggestions-label">+{remaining} free EVs →</span>
          <span className="spread-suggestion">dump in HP</span>
          <span className="spread-suggestion-sep">·</span>
          <span className="spread-suggestion">dump in SPE (speed creep)</span>
          <span className="spread-suggestion-sep">·</span>
          <span className="spread-suggestion">split bulk</span>
        </div>
      )}

      <div className="spread-constraints">
        {constraintResults.map((cr, i) => (
          <ConstraintResult key={i} cr={cr} />
        ))}
      </div>
    </div>
  );
}

export default function Results({ userPokemon, userFullState, enemyPokemon, enemyFullState, constraints, fieldConditions }) {
  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [showAll, setShowAll]   = useState(false);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    setLoading(true);
    setError(null);

    // Defer to next tick so React renders "Calculating…" before the blocking work
    setTimeout(() => {
      try {
        const r = solveSpreads({ userPokemon, userFullState, enemyPokemon, enemyFullState, constraints, fieldConditions });
        setResult(r);
      } catch (e) {
        setError(e.message || 'Unknown error during calculation.');
      } finally {
        setLoading(false);
      }
    }, 50);
  }, []);

  const spreads  = result?.spreads   ?? [];
  const imposs   = result?.impossible ?? [];
  const validSpreads = spreads.filter(s => s.allPassed);
  const displayed = showAll ? validSpreads : validSpreads.slice(0, 5);

  return (
    <div className="results">
      {loading && (
        <div className="results-loading">
          <div className="results-spinner" />
          <span>Calculating…</span>
        </div>
      )}

      {error && (
        <div className="results-error">
          <span>⚠ {error}</span>
        </div>
      )}

      {!loading && result && (
        <>
          {/* Impossible constraints */}
          {imposs.length > 0 && (
            <div className="results-impossible">
              <div className="results-impossible-title">⚠ Impossible constraints</div>
              {imposs.map((imp, i) => (
                <div key={i} className="results-impossible-row">
                  {imp.threat && <strong>{imp.threat.name}: </strong>}
                  {imp.reason}
                </div>
              ))}
            </div>
          )}

          {/* Summary banner */}
          {validSpreads.length > 0 ? (
            <div className="results-banner results-banner-ok">
              <span className="results-banner-count">✓ {validSpreads.length} valid spread{validSpreads.length !== 1 ? 's' : ''} found</span>
              <span className="results-banner-sub">Sorted by minimum EVs required — more EVs remaining = more flexibility</span>
            </div>
          ) : (
            <div className="results-banner results-banner-fail">
              <span>✗ No valid EV spread found that satisfies all constraints simultaneously.</span>
            </div>
          )}

          {/* Spread cards */}
          <div className="results-spreads">
            {displayed.map((s, i) => (
              <SpreadCard
                key={i} idx={i} spread={s}
                userPokemon={userPokemon} userFullState={userFullState}
                isMin={i === 0}
              />
            ))}
          </div>

          {validSpreads.length > 5 && (
            <button className="results-show-more" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show less' : `Show all ${validSpreads.length} spreads`}
            </button>
          )}

          {validSpreads.length === 0 && imposs.length === 0 && spreads.length > 0 && (
            <div className="results-partial">
              <p>Partial spreads found but they don't pass all constraints. Try relaxing some requirements.</p>
              {spreads.slice(0, 3).map((s, i) => (
                <SpreadCard key={i} idx={i} spread={s}
                  userPokemon={userPokemon} userFullState={userFullState}
                  isMin={false} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}