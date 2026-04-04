import { useState, useRef, useEffect, useLayoutEffect, Component } from 'react'
import { createPortal } from 'react-dom'
import LiquidGlass from './components/LiquidGlass'
import PokemonSelector from './components/PokemonSelector'
import FieldConditions from './components/FieldConditions'
import Constraints from './components/Constraints'
import Results from './components/Results'
import TyphlosionImg from './assets/Typhlosion.png';
import ChandelureImg from './assets/chandelure.png';
import { toShowdownSet } from './solver/solver.js'
import './App.css'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, color: '#f88', fontFamily: 'monospace', background: '#111', minHeight: '100vh' }}>
        <h2>Something crashed 💥</h2>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#faa', fontSize: 13 }}>{String(this.state.error)}</pre>
        <button onClick={() => this.setState({ error: null })} style={{ marginTop: 20, padding: '8px 20px', cursor: 'pointer' }}>
          Try again
        </button>
      </div>
    );
    return this.props.children;
  }
}

const STEP_TITLES = [
  'Select Pokemon',
  'Configure EVs & IVs',
  'Items, Status & HP',
  'Move Selection',
  'Field Conditions',
  'Constraints',
  'Results',
];

const STEP_COLORS = [
  '#8f74ff',
  '#976fff',
  '#a06cff',
  '#a96bff',
  '#b66cf8',
  '#c56eed',
  '#d775e5',
];

const STEP_COUNT = STEP_TITLES.length;

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(ch => ch + ch).join('')
    : normalized;
  const int = Number.parseInt(value, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
};


function SwapButtonPortal({ onSwap, disabled, pairRef, step }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const update = () => {
      if (!pairRef.current) return;
      const r = pairRef.current.getBoundingClientRect();
      setPos({
        top:  r.top  + r.height / 2 + window.scrollY,
        left: r.left + r.width  / 2 + window.scrollX,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [pairRef, step]);

  if (disabled) return null;

  return createPortal(
    <div style={{
      position: 'absolute',
      top:  pos.top,
      left: pos.left,
      transform: 'translate(-50%, -50%)',
      zIndex: 99999,
    }}>
      <button
        className="swap-btn"
        onClick={onSwap}
        title="Swap both sides"
      >⇄</button>
    </div>,
    document.body
  );
}

function CopySetBanner({ pokemon, fullState, level, isEnemy }) {
  const [copied, setCopied] = useState(false);
  if (!pokemon || !fullState) return null;

  const evs = fullState.evs ?? { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 };
  const setStr = toShowdownSet(pokemon, fullState, evs, level);
  const prefix = isEnemy ? `Enemy's` : 'Your';
  const text = copied
    ? 'Copied!'
    : `${prefix} ${pokemon.name} is ready! Click to copy set.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(setStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <LiquidGlass
      borderRadius={12} bezelWidth={16} scale={45} blur={18}
      saturation={1.6} brightness={0.95}
      hoverScaleMultiplier={1}
      background={copied ? 'rgba(40,100,30,0.38)' : 'rgba(10,10,16,0.45)'}
      hoverBackground={copied ? 'rgba(40,100,30,0.38)' : 'rgba(20,80,20,0.52)'}
      hoverBrightness={1.06}
      style={{ display: 'block', cursor: 'pointer' }}
      onClick={handleCopy}
    >
      <div className={`copy-set-banner ${copied ? 'copied' : ''}`}>
        <span className="copy-set-text">{text}</span>
      </div>
    </LiquidGlass>
  );
}

// ── On-entry ability effect computation ─────────────────────────────────────
const normAb = s => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');

const BLOCKER_LABELS = {
  clearbody: 'Clear Body', whitesmoke: 'White Smoke', fullmetalbody: 'Full Metal Body',
  innerfocus: 'Inner Focus', owntempo: 'Own Tempo', oblivious: 'Oblivious',
  hypercutter: 'Hyper Cutter',
};

// What weather/terrain each ability sets on entry
const WEATHER_SETTERS = {
  drought: 'sun', desolateland: 'sun', orichalcumpulse: 'sun',
  drizzle: 'rain', primordialsea: 'rain',
  sandstream: 'sand',
  snowwarning: 'snow', hailstorm: 'snow',
};
const TERRAIN_SETTERS = {
  electricsurge: 'electric', hadronengine: 'electric',
  grassysurge: 'grassy',
  mistysurge: 'misty',
  psychicsurge: 'psychic',
};

// Which ability ids get auto-enabled by each weather/terrain
const WEATHER_BENEFICIARIES = {
  sun:  ['chlorophyll', 'solarpower', 'flowergift', 'orichalcumpulse'],
  rain: ['swiftswim'],
  sand: ['sandrush', 'sandforce'],
  snow: ['slushrush'],
};
const TERRAIN_BENEFICIARIES = {
  electric: ['surgesurfer', 'quarkdrive', 'hadronengine'],
  grassy:   [],
  misty:    [],
  psychic:  ['protosynthesis'], // not terrain-based but include for completeness
};

// Abilities that cannot be copied by Trace in Gen IX (Bulbapedia table, col IX)
const NON_COPYABLE_TRACE = new Set([
  'asoneas','asonegrimm','asoneglastrier','asonespectrier',
  'battlebond','comatose','commander','disguise','embodyaspect',
  'flowergift','forecast','gulpmissile','hungerswitch','iceface',
  'illusion','imposter','multitype','neutralizinggas','poisonpuppeteer',
  'powerconstruct','powerofalchemy','protosynthesis','quarkdrive',
  'receiver','rkssystem','schooling','shieldsdown','stancechange',
  'teraformzero','terashell','terashift','trace','zenmode','zerohero',
]);

// Abilities that cannot be copied by Receiver (same as Trace minus Gulp Missile,
// minus Wandering Spirit was added in older games — official receiver list)
const NON_COPYABLE_RECEIVER = new Set([
  'receiver','powerofalchemy','trace','forecast','flowergift','multitype',
  'illusion','wonderguard','zenmode','imposter','stancechange','powerconstruct',
  'schooling','comatose','shieldsdown','disguise','rkssystem','battlebond',
  'wanderingspirit','iceface','hungerswitch',
  'asoneas','asonegrimm','asoneglastrier','asonespectrier',
  'zerohero','commander','protosynthesis','quarkdrive',
]);

// PoA: same as Receiver + Poison Puppeteer
const NON_COPYABLE_POA = new Set([...NON_COPYABLE_RECEIVER, 'poisonpuppeteer']);

// Combined for backward compat
const NON_COPYABLE = NON_COPYABLE_TRACE;

function computeEntryInteractions(myAbility, myPokemon, oppAbility, oppPokemon) {
  const myAb  = normAb(myAbility);
  const oppAb = normAb(oppAbility);
  const out   = [];

  // ── Own stat-stage abilities ─────────────────────────────────────────────
  if (myAb === 'intrepidsword')
    out.push({ role: 'own', stat: 'atk', delta: 1, label: 'Intrepid Sword', autoEnable: true });
  if (myAb === 'dauntlessshield')
    out.push({ role: 'own', stat: 'def', delta: 1, label: 'Dauntless Shield', autoEnable: true });
  if (myAb === 'download' && oppPokemon?.baseStats) {
    const bs = oppPokemon.baseStats;
    out.push({ role: 'own', stat: bs.spd < bs.def ? 'spa' : 'atk', delta: 1, label: 'Download', autoEnable: true });
  }

  // ── On-hit / condition-triggered single stat changes (off by default) ───────
  const OWN = (stat, delta, label) => ({ role: 'own', stat, delta, label, autoEnable: false });

  if (myAb === 'windrider')        out.push(OWN('atk',  1, 'Wind Rider'));
  if (myAb === 'justified')        out.push(OWN('atk',  1, 'Justified'));
  if (myAb === 'rattled')          out.push(OWN('spe',  1, 'Rattled'));
  if (myAb === 'thermalexchange')  out.push(OWN('atk',  1, 'Thermal Exchange'));
  if (myAb === 'sapsipper')        out.push(OWN('atk',  1, 'Sap Sipper'));
  if (myAb === 'motordrive')       out.push(OWN('spe',  1, 'Motor Drive'));
  if (myAb === 'lightningrod')     out.push(OWN('spa',  1, 'Lightning Rod'));
  if (myAb === 'stormdrain')       out.push(OWN('spa',  1, 'Storm Drain'));
  if (myAb === 'watercompaction')  out.push(OWN('def',  2, 'Water Compaction'));
  if (myAb === 'steamengine')      out.push(OWN('spe',  6, 'Steam Engine'));
  if (myAb === 'cursedbody')       /* no stat change — 30% chance to disable */ null;
  // Weak Armor: +1 SPE, -1 DEF per physical hit
  if (myAb === 'weakarmor') {
    out.push(OWN('spe',  1, 'Weak Armor (+SPE)'));
    out.push(OWN('def', -1, 'Weak Armor (-DEF)'));
  }
  // Anger Shell: +1 ATK/SPA/SPE, -1 DEF/SPD (triggers at ≤50% HP)
  if (myAb === 'angershell') {
    out.push(OWN('atk',  1, 'Anger Shell (+ATK)'));
    out.push(OWN('spa',  1, 'Anger Shell (+SPA)'));
    out.push(OWN('spe',  1, 'Anger Shell (+SPE)'));
    out.push(OWN('def', -1, 'Anger Shell (-DEF)'));
    out.push(OWN('spd', -1, 'Anger Shell (-SPD)'));
  }

  // ── Anger Point: +6 ATK when hit by a critical hit (off by default) ─────
  if (myAb === 'angerpoint')
    out.push({ role: 'own', stat: 'atk', delta: 6, label: 'Anger Point', autoEnable: false });

  // ── Commander (Tatsugiri): +2 all stats when entering Dondozo ───────────
  if (myAb === 'commander')
    out.push({ role: 'commander', stat: null, delta: 0, label: 'Commander', autoEnable: false });

  // ── Mold Breaker / Teravolt / Turboblaze: ignores opponent abilities ─────
  if (['moldbreaker','teravolt','turboblaze'].includes(myAb))
    out.push({ role: 'moldbreaker', stat: null, delta: 0, label: 'Mold Breaker', autoEnable: true });

  // ── Neutralizing Gas: suppresses all abilities on field ──────────────────
  if (myAb === 'neutralizinggas')
    out.push({ role: 'neutralizinggas', stat: null, delta: 0, label: 'Neutralizing Gas', autoEnable: true });

  // ── Intimidate: attacker pill on my side ────────────────────────────────
  if (myAb === 'intimidate')
    out.push({ role: 'attacker', stat: null, delta: 0, label: 'Intimidate', autoEnable: true });

  // ── Mirror Armor bounce: I lose -1 ATK ──────────────────────────────────
  if (myAb === 'intimidate' && oppAb === 'mirrorarmor')
    out.push({ role: 'own', stat: 'atk', delta: -1, label: 'Mirror Armor', autoEnable: true });

  // ── Reaction to opponent Intimidate ─────────────────────────────────────
  if (oppAb === 'intimidate') {
    if (myAb in BLOCKER_LABELS)
      out.push({ role: 'blocker', stat: 'atk', delta: 0, label: BLOCKER_LABELS[myAb], reaction: null, autoEnable: true });
    else if (myAb === 'guarddog')
      out.push({ role: 'reactor', stat: 'atk', delta: 0, label: 'Guard Dog',   reaction: 'guarddog',    autoEnable: true });
    else if (myAb === 'contrary')
      out.push({ role: 'reactor', stat: 'atk', delta: 0, label: 'Contrary',    reaction: 'contrary',    autoEnable: true });
    else if (myAb === 'defiant')
      out.push({ role: 'reactor', stat: 'atk', delta: 0, label: 'Defiant',     reaction: 'defiant',     autoEnable: true });
    else if (myAb === 'competitive')
      out.push({ role: 'reactor', stat: 'spa', delta: 0, label: 'Competitive', reaction: 'competitive', autoEnable: true });
  }

  // ── Trace: copies opp ability immediately — also run that ability's entry effects ─
  if (myAb === 'trace' && oppAb && !NON_COPYABLE.has(oppAb)) {
    out.push({ role: 'trace', copiedAbility: oppAbility, label: `Trace: ${oppAbility}`, autoEnable: true });
    // Run the copied ability's own entry interactions as if I had it
    const traceEffects = computeEntryInteractions(oppAbility, myPokemon, oppAbility, oppPokemon);
    for (const e of traceEffects) {
      // Skip another trace/copy pill to avoid infinite loop
      if (e.role !== 'trace' && e.role !== 'copyMove' && e.role !== 'powerofalchemy') {
        out.push({ ...e, fromTrace: true });
      }
    }
  }

  // ── Receiver / Power of Alchemy: user picks any non-locked ability (off by default) ─
  if (myAb === 'receiver') {
    out.push({ role: 'receiver', copiedAbility: null, label: 'Receiver', autoEnable: false });
  }
  if (myAb === 'powerofalchemy') {
    out.push({ role: 'powerofalchemy', copiedAbility: null, label: 'Power of Alchemy', autoEnable: false });
  }

  // ── Weather / terrain auto-enable ───────────────────────────────────────
  const activeWeather = WEATHER_SETTERS[myAb] || WEATHER_SETTERS[oppAb];
  const activeTerrain = TERRAIN_SETTERS[myAb] || TERRAIN_SETTERS[oppAb];

  // Protosynthesis: auto-enable if sun present, else mark for Booster Energy
  if (myAb === 'protosynthesis') {
    if (activeWeather === 'sun') out.push({ role: 'autoEnable', id: 'protosynthesis', label: 'protosynthesis' });
    else out.push({ role: 'setItem', itemName: 'Booster Energy', thenEnable: 'protosynthesis' });
  }
  // Quark Drive: auto-enable if electric terrain present, else mark for Booster Energy
  if (myAb === 'quarkdrive') {
    if (activeTerrain === 'electric') out.push({ role: 'autoEnable', id: 'quarkdrive', label: 'quarkdrive' });
    else out.push({ role: 'setItem', itemName: 'Booster Energy', thenEnable: 'quarkdrive' });
  }

  if (activeWeather) {
    for (const id of (WEATHER_BENEFICIARIES[activeWeather] ?? [])) {
      // Already handled proto/quark above
      if (normAb(myAbility) === id && id !== 'protosynthesis')
        out.push({ role: 'autoEnable', id, label: id });
    }
  }
  if (activeTerrain) {
    for (const id of (TERRAIN_BENEFICIARIES[activeTerrain] ?? [])) {
      if (normAb(myAbility) === id && id !== 'quarkdrive')
        out.push({ role: 'autoEnable', id, label: id });
    }
  }

  return out;
}

export default function App() {
  const [userPokemon, setUserPokemon] = useState(null);
  const [enemyPokemon, setEnemyPokemon] = useState(null);
  const [step, setStep] = useState(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(1);
  const [userError, setUserError] = useState(null);
  const [enemyError, setEnemyError] = useState(null);
  const [userState, setUserState] = useState(null);
  const [enemyState, setEnemyState] = useState(null);
  const [fieldConditions, setFieldConditions] = useState(null);
  const [constraints, setConstraints] = useState([]);
  const [savedThreats, setSavedThreats] = useState([]);
  const [userFullState, setUserFullState] = useState(null);
  const [enemyFullState, setEnemyFullState] = useState(null);
  const [step7CalcToken, setStep7CalcToken] = useState(0);
  const [step7IsCalculating, setStep7IsCalculating] = useState(false);

  // Re-snapshot whenever opponent state changes (needed for live Imposter/Transform copying)
  const handleUserStateChange = (s) => {
    setUserState(s);
    if (step >= 2) setTimeout(() => setUserFullState(userSelectorRef.current?.getFullState() ?? null), 0);
  };
  const handleEnemyStateChange = (s) => {
    setEnemyState(s);
    if (step >= 2) setTimeout(() => setEnemyFullState(enemySelectorRef.current?.getFullState() ?? null), 0);
  };
  const userSelectorRef = useRef(null);
  const enemySelectorRef = useRef(null);
  const pairRef = useRef(null);

  // Snapshot full pokemon states from step 2 onwards (needed for Imposter/Transform display)
  useEffect(() => {
    if (step >= 2) {
      setUserFullState(userSelectorRef.current?.getFullState() ?? null);
      setEnemyFullState(enemySelectorRef.current?.getFullState() ?? null);
    }
  }, [step]);

  useEffect(() => {
    if (userError) {
      const t = setTimeout(() => setUserError(null), 3000);
      return () => clearTimeout(t);
    }
  }, [userError]);

  useEffect(() => {
    if (enemyError) {
      const t = setTimeout(() => setEnemyError(null), 3000);
      return () => clearTimeout(t);
    }
  }, [enemyError]);

  useEffect(() => {
    if (step !== STEP_COUNT) {
      setStep7CalcToken(0);
      setStep7IsCalculating(false);
    }
  }, [step]);

  useEffect(() => {
    if (step === 1 && (!userPokemon || !enemyPokemon)) {
      setMaxUnlockedStep(1);
    }
  }, [step, userPokemon, enemyPokemon]);

  const handleContinue = () => {
    if (step === 1) {
      if (!userPokemon || !enemyPokemon) return;
      const userValid = userSelectorRef.current?.validateAbility();
      const enemyValid = enemySelectorRef.current?.validateAbility();
      if (userValid && enemyValid) {
        const userAb  = userSelectorRef.current?.getFullState()?.ability ?? '';
        const enemyAb = enemySelectorRef.current?.getFullState()?.ability ?? '';

        const userInteractions  = computeEntryInteractions(userAb,  userPokemon,  enemyAb, enemyPokemon);
        const enemyInteractions = computeEntryInteractions(enemyAb, enemyPokemon, userAb,  userPokemon);

        userSelectorRef.current?.applyEntryEffects(userInteractions);
        enemySelectorRef.current?.applyEntryEffects(enemyInteractions);

        setMaxUnlockedStep(prev => Math.max(prev, 2));
        setStep(2);
      }
    } else if (step < STEP_COUNT) {
      const nextStep = step + 1;
      setMaxUnlockedStep(prev => Math.max(prev, nextStep));
      setStep(nextStep);
    }
  };

  const [userPasteText, setUserPasteText] = useState('');
  const [userPasteError, setUserPasteError] = useState(null);
  const [enemyPasteText, setEnemyPasteText] = useState('');
  const [enemyPasteError, setEnemyPasteError] = useState(null);

  const handleUserPaste = (text) => {
    setUserPasteText(text);
    setUserPasteError(null);
    if (!text.trim()) return;
    const result = userSelectorRef.current?.loadShowdownSet(text);
    if (!result) return;
    if (!result.success) { setUserPasteError(result.error); return; }
  };

  const handleEnemyPaste = (text) => {
    setEnemyPasteText(text);
    setEnemyPasteError(null);
    if (!text.trim()) return;
    const result = enemySelectorRef.current?.loadShowdownSet(text);
    if (!result) return;
    if (!result.success) { setEnemyPasteError(result.error); return; }
  };

  const step4HasMove =
    [userFullState, enemyFullState].some((state) =>
      (state?.moves ?? []).some((move) => !!move?.name)
    );

  const canContinue =
    step === 1
      ? (!!userPokemon && !!enemyPokemon)
      : step === 4
        ? step4HasMove
      : step === 6
        ? constraints.length > 0
        : true;
  const isCalculateStep = step === STEP_COUNT;
  const canCalculate =
    !!userPokemon &&
    !!userFullState &&
    !!enemyPokemon &&
    !!enemyFullState &&
    constraints.length > 0;
  const navButtonEnabled = isCalculateStep ? (canCalculate && !step7IsCalculating) : canContinue;
  const triggerStep7Calculation = () => {
    if (!canCalculate || step7IsCalculating) return;
    setStep7IsCalculating(true);
    setStep7CalcToken((n) => n + 1);
  };
  const handlePrimaryNavAction = () => {
    if (isCalculateStep) {
      if (!navButtonEnabled) return;
      triggerStep7Calculation();
      return;
    }
    handleContinue();
  };

  const handleStepJump = (targetStep) => {
    if (targetStep < 1 || targetStep > maxUnlockedStep) return;
    setStep(targetStep);
  };

  const handleSwap = () => {
    const uState = userSelectorRef.current?.getFullState();
    const eState = enemySelectorRef.current?.getFullState();
    if (!uState || !eState) return;
    // Swap pokemon species
    const uPoke = userPokemon;
    const ePoke = enemyPokemon;
    setUserPokemon(ePoke);
    setEnemyPokemon(uPoke);
    // Swap internal state after react re-renders the selectors
    setTimeout(() => {
      userSelectorRef.current?.setFullState(eState);
      enemySelectorRef.current?.setFullState(uState);
    }, 0);
  };

  // Independent level per pokemon — changing one does not affect the other
  const [userLevel, setUserLevel] = useState(100);
  const [enemyLevel, setEnemyLevel] = useState(100);

  const stepTitle = STEP_TITLES[step - 1];

  return (
    <ErrorBoundary>
    <div className="app">
      <img src={TyphlosionImg} alt="" className="typhlosion-bg" />
      <img src={ChandelureImg}  alt="" className="chandelure-bg" />
      <img src={ChandelureImg}  alt="" className="chandelure-bg" />

      <header className="app-header">
        <div className="header-bubble-wrap">
          {/* Speech bubble */}
          <LiquidGlass
            borderRadius={20}
            bezelWidth={22}
            scale={60}
            blur={22}
            saturation={1.8}
            brightness={0.95}
            background="rgba(10,10,16,0.52)"
            className="header-bubble-glass"
          >
            <div className="header-bubble-content">
              <span className="header-bubble-tail" />
              <h1 className="header-title">Welcome to <em>EV'olution</em></h1>
              <p className="header-sub">The EV Spread Brute Force Tool</p>
            </div>
          </LiquidGlass>
          {/* Mismagius — blurred clone as glow behind real image */}
          <div className="header-mismagius-wrap">
            <div className="header-mismagius-glow" />
            <img
              src="https://img.pokemondb.net/sprites/black-white/anim/normal/mismagius.gif"
              alt="Mismagius"
              className="header-mismagius"
              style={{ position: 'relative', zIndex: 1 }}
            />
          </div>
        </div>
      </header>

      <div className="notification-stack">
        {userError && (
          <LiquidGlass borderRadius={12} bezelWidth={16} scale={45} blur={20} saturation={2.0} brightness={0.92} background="rgba(180,20,20,0.35)" style={{ pointerEvents: 'none' }}>
            <div className="ability-error-notification">{userError}</div>
          </LiquidGlass>
        )}
        {enemyError && (
          <LiquidGlass borderRadius={12} bezelWidth={16} scale={45} blur={20} saturation={2.0} brightness={0.92} background="rgba(180,20,20,0.35)" style={{ pointerEvents: 'none' }}>
            <div className="ability-error-notification">{enemyError}</div>
          </LiquidGlass>
        )}
      </div>

      <main className="app-main">
        <section className={`input-section step-${step}`}>

          <div className="step-bar">
            <h2>Step {step}: {stepTitle}</h2>
            <div className="step-navigator">
              <div className="step-circle-row">
                {STEP_TITLES.map((_, index) => {
                  const stepNumber = index + 1;
                  const unlocked = stepNumber <= maxUnlockedStep;
                  const current = stepNumber === step;
                  const stepRgb = hexToRgb(STEP_COLORS[index]);
                  const circleBackground = unlocked
                    ? `rgba(${stepRgb.replace(/ /g, ',')}, ${current ? 0.2 : 0.12})`
                    : 'rgba(10,10,16,0.22)';
                  const circleHoverBackground = unlocked
                    ? `rgba(${stepRgb.replace(/ /g, ',')}, ${current ? 0.24 : 0.16})`
                    : 'rgba(10,10,16,0.22)';

                  return (
                    <div
                      key={stepNumber}
                      className={`step-circle-shell ${current ? 'current' : ''} ${unlocked ? 'unlocked' : 'locked'}`}
                    >
                      <LiquidGlass
                        borderRadius={999}
                        bezelWidth={16}
                        scale={44}
                        hoverScaleMultiplier={1}
                        blur={18}
                        saturation={1.7}
                        brightness={0.94}
                        background={circleBackground}
                        hoverBackground={circleHoverBackground}
                        hoverBrightness={1.02}
                        style={{ display: 'inline-flex', '--step-color-rgb': stepRgb }}
                      >
                        <button
                          className={`step-circle-btn ${current ? 'current' : ''} ${unlocked ? 'unlocked' : 'locked'}`}
                          onClick={() => handleStepJump(stepNumber)}
                          disabled={!unlocked}
                          style={{ '--step-color': STEP_COLORS[index], '--step-color-rgb': stepRgb }}
                          title={`Step ${stepNumber}: ${STEP_TITLES[index]}`}
                        >
                          {stepNumber}
                        </button>
                      </LiquidGlass>
                    </div>
                  );
                })}
              </div>

              <LiquidGlass
                borderRadius={999}
                bezelWidth={16}
                scale={isCalculateStep ? 58 : 46}
                hoverScaleMultiplier={1}
                blur={18}
                saturation={1.9}
                brightness={0.94}
                background={
                  isCalculateStep
                    ? 'rgba(110,24,96,0.26)'
                    : canContinue
                      ? 'rgba(62,28,96,0.24)'
                      : 'rgba(12,12,18,0.28)'
                }
                hoverBackground={
                  isCalculateStep
                    ? 'rgba(134,36,118,0.34)'
                    : canContinue
                      ? 'rgba(84,36,126,0.32)'
                      : 'rgba(12,12,18,0.28)'
                }
                hoverBrightness={1.03}
                style={{ display: 'inline-flex', opacity: navButtonEnabled ? 1 : 0.52 }}
              >
                <button
                  className={`step-arrow-btn ${isCalculateStep ? 'calculate' : ''} ${navButtonEnabled ? 'active' : 'disabled'}`}
                  onClick={handlePrimaryNavAction}
                  disabled={!navButtonEnabled}
                  title={
                    isCalculateStep
                      ? (step7IsCalculating ? 'Calculating...' : 'Calculate')
                      : step === STEP_COUNT - 1
                        ? 'Go to results'
                        : 'Next step'
                  }
                >
                  {isCalculateStep ? (
                    <>
                      <span className="step-calc-icon" aria-hidden="true">ϟ</span>
                      <span className="step-calc-label">Calculate</span>
                    </>
                  ) : (
                    <svg className="step-arrow-icon" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M7 4.75 12.25 10 7 15.25" />
                    </svg>
                  )}
                </button>
              </LiquidGlass>
            </div>
            {false && <div className="step-bar-actions">
              {step >= 2 && (
                <LiquidGlass borderRadius={14} bezelWidth={18} scale={55} hoverScaleMultiplier={1} blur={20} saturation={1.6} brightness={0.92} background="rgba(8,8,12,0.55)" hoverBackground="rgba(40,40,55,0.62)" hoverBrightness={1.05} style={{display:'inline-flex'}}>
                  <button className="back-btn-inner" onClick={() => setStep(s => s - 1)}>← Back</button>
                </LiquidGlass>
              )}
              {step < 6 && (
                <LiquidGlass borderRadius={14} bezelWidth={18} scale={55} hoverScaleMultiplier={1} blur={20} saturation={1.8} brightness={0.94} background="rgba(8,8,12,0.55)" hoverBackground="rgba(80,20,120,0.52)" hoverBrightness={1.08} style={{display:'inline-flex', opacity: !canContinue ? 0.35 : 1}}>
                  <button className={`continue-btn-inner ${!canContinue ? 'disabled' : ''}`} onClick={handleContinue} disabled={!canContinue}>Continue →</button>
                </LiquidGlass>
              )}
              {step === 6 && (
                <LiquidGlass borderRadius={14} bezelWidth={18} scale={55} hoverScaleMultiplier={1} blur={20} saturation={2.2} brightness={0.92} background="rgba(100,6,60,0.38)" hoverBackground="rgba(180,10,100,0.55)" hoverBrightness={1.1} style={{display:'inline-flex'}}>
                  <button className="calculate-btn-inner" onClick={handleContinue}>⚡ Calculate</button>
                </LiquidGlass>
              )}
            </div>}
          </div>

          <div className="pokemon-pair-wrapper">
            <div ref={pairRef} className={`pokemon-pair ${step >= 2 ? 'collapsed' : ''}`}>

              {/* Left column: user card + paste */}
              <div className="pokemon-col">
                <div className="pokemon-col-label">Your Pokemon</div>
                <PokemonSelector
                  ref={userSelectorRef}
                  title="Your Pokemon"
                  selectedPokemon={userPokemon}
                  onSelect={setUserPokemon}
                  collapsed={step >= 2}
                  step={step}
                  onAbilityError={setUserError}
                  opponentInfo={enemyState}
                  opponentFullState={enemyFullState}
                  opponentPokemon={enemyPokemon}
                  onStateChange={handleUserStateChange}
                  level={userLevel}
                  onLevelChange={setUserLevel}
                  fieldConditions={fieldConditions}
                  allowParadoxModifierEditing
                />
                {step === 1 && !userPokemon && (
                    <LiquidGlass
                      borderRadius={16} bezelWidth={20} scale={60} blur={28}
                      saturation={1.8} brightness={0.95} background="rgba(10,10,16,0.52)"
                      style={{ marginTop: 0 }}
                    >
                      <div className="paste-section">
                        <div className={`paste-input-shell ${userPasteError ? 'error' : ''}`}>
                          <textarea
                            className="paste-input control-surface-input"
                            placeholder="OR paste your Showdown set here..."
                            value={userPasteText}
                            onChange={e => handleUserPaste(e.target.value)}
                            rows={12}
                            spellCheck={false}
                          />
                        </div>
                      {userPasteError && <div className="paste-error">{userPasteError}</div>}
                      </div>
                    </LiquidGlass>
                  )}
              </div>

              {/* Right column: enemy card + paste */}
              <div className="pokemon-col">
                <div className="pokemon-col-label">Enemy Pokemon</div>
                <PokemonSelector
                  ref={enemySelectorRef}
                  title="Enemy Pokemon"
                  selectedPokemon={enemyPokemon}
                  onSelect={setEnemyPokemon}
                  collapsed={step >= 2}
                  step={step}
                  onAbilityError={setEnemyError}
                  opponentInfo={userState}
                  opponentFullState={userFullState}
                  opponentPokemon={userPokemon}
                  onStateChange={handleEnemyStateChange}
                  level={enemyLevel}
                  onLevelChange={setEnemyLevel}
                  fieldConditions={fieldConditions}
                  allowParadoxModifierEditing
                />
                {step === 1 && !enemyPokemon && (
                    <LiquidGlass
                      borderRadius={16} bezelWidth={20} scale={60} blur={28}
                      saturation={1.8} brightness={0.95} background="rgba(10,10,16,0.52)"
                      style={{ marginTop: 0 }}
                    >
                      <div className="paste-section">
                        <div className={`paste-input-shell ${enemyPasteError ? 'error' : ''}`}>
                          <textarea
                            className="paste-input control-surface-input"
                            placeholder="OR paste your Showdown set here..."
                            value={enemyPasteText}
                            onChange={e => handleEnemyPaste(e.target.value)}
                            rows={12}
                            spellCheck={false}
                          />
                        </div>
                      {enemyPasteError && <div className="paste-error">{enemyPasteError}</div>}
                      </div>
                    </LiquidGlass>
                  )}
              </div>

            </div>
            {userPokemon && enemyPokemon && (
              <SwapButtonPortal
                onSwap={handleSwap}
                disabled={step7IsCalculating}
                pairRef={pairRef}
                step={step}
              />
            )}
          </div>
          {step === 5 && (
            <div className="copy-set-row">
              <CopySetBanner pokemon={userPokemon}  fullState={userFullState}  level={userLevel}  isEnemy={false} />
              <CopySetBanner pokemon={enemyPokemon} fullState={enemyFullState} level={enemyLevel} isEnemy={true} />
            </div>
          )}
          {step === 5 && (
            <FieldConditions
              value={fieldConditions}
              onChange={setFieldConditions}
              userFullState={userFullState}
              enemyFullState={enemyFullState}
            />
          )}
          {step === 6 && (
            <Constraints
              constraints={constraints}
              onChange={setConstraints}
              savedThreats={savedThreats}
              onSavedThreatsChange={setSavedThreats}
              userPokemon={userPokemon}
              enemyPokemon={enemyPokemon}
              userFullState={userFullState}
              enemyFullState={enemyFullState}
              fieldConditions={fieldConditions}
            />
          )}
          {step === 7 && (
            <Results
              userPokemon={userPokemon}
              userFullState={userFullState}
              userLevel={userLevel}
              enemyPokemon={enemyPokemon}
              enemyFullState={enemyFullState}
              enemyLevel={enemyLevel}
              constraints={constraints}
              fieldConditions={fieldConditions}
              calculateToken={step7CalcToken}
              onCalculatingChange={setStep7IsCalculating}
              canCalculate={canCalculate}
              isCalculating={step7IsCalculating}
              onRequestCalculate={triggerStep7Calculation}
            />
          )}

        </section>
      </main>
    </div>
    </ErrorBoundary>
  )
}
