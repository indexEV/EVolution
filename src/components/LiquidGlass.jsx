import { useEffect, useRef, useId, useState } from 'react';

// ── Global cache: reuse displacement maps with same dimensions/params ──────────
const _dispMapCache = new Map();
function getCachedDisplacementMap(w, h, borderRadius, bezelWidth, ior) {
  const key = `${w}x${h}x${borderRadius}x${bezelWidth}x${ior}`;
  if (_dispMapCache.has(key)) return _dispMapCache.get(key);
  const canvas = document.createElement('canvas');
  buildDisplacementMap(canvas, w, h, borderRadius, bezelWidth, ior);
  const url = canvas.toDataURL();
  _dispMapCache.set(key, url);
  return url;
}

// ── Rounded-rectangle Signed Distance Function ───────────────────────────────
function roundedRectSDF(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) -
    r
  );
}

// ── SDF gradient (outward normal at any point) ───────────────────────────────
function sdfGradient(px, py, cx, cy, hw, hh, r, eps = 0.5) {
  const dx =
    roundedRectSDF(px + eps, py, cx, cy, hw, hh, r) -
    roundedRectSDF(px - eps, py, cx, cy, hw, hh, r);
  const dy =
    roundedRectSDF(px, py + eps, cx, cy, hw, hh, r) -
    roundedRectSDF(px, py - eps, cx, cy, hw, hh, r);
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
}

// ── Squircle surface function (Apple's preferred convex profile) ─────────────
function squircleSurface(t) {
  return Math.pow(1 - Math.pow(1 - t, 4), 0.25);
}
function squircleDeriv(t, d = 0.001) {
  return (squircleSurface(t + d) - squircleSurface(t - d)) / (2 * d);
}

// ── Snell's Law refraction ────────────────────────────────────────────────────
function snellRefract(normal, n1, n2) {
  const nz = Math.sqrt(Math.max(0, 1 - normal.x ** 2 - normal.y ** 2));
  const nRatio = n1 / n2;
  const cosI = nz;
  const sinT2 = nRatio * nRatio * (1 - cosI * cosI);
  if (sinT2 > 1) return { x: 0, y: 0 }; 
  const cosT = Math.sqrt(1 - sinT2);
  const rx = nRatio * 0 + (nRatio * cosI - cosT) * normal.x;
  const ry = nRatio * 0 + (nRatio * cosI - cosT) * normal.y;
  return { x: rx, y: ry };
}

// ── Build displacement map onto a canvas ─────────────────────────────────────
function buildDisplacementMap(canvas, width, height, borderRadius, bezelWidth, ior = 1.5) {
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  const data = img.data;

  const cx = width  / 2;
  const cy = height / 2;
  const hw = width  / 2 - borderRadius;
  const hh = height / 2 - borderRadius;

  let maxDisp = 0;
  const samples = 128;
  const precomp = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const dh = squircleDeriv(t);
    const len = Math.sqrt(dh * dh + 1);
    const nx = -dh / len;
    const nz =   1 / len;
    const nRatio = 1 / ior;
    const cosI = nz;
    const sinT2 = nRatio * nRatio * (1 - cosI * cosI);
    if (sinT2 <= 1) {
      const cosT = Math.sqrt(1 - sinT2);
      const rx = nRatio * 0 + (nRatio * cosI - cosT) * nx;
      precomp[i] = Math.abs(rx);
      if (precomp[i] > maxDisp) maxDisp = precomp[i];
    }
  }
  if (maxDisp === 0) maxDisp = 1;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4;
      const sdf = roundedRectSDF(px, py, cx, cy, hw, hh, borderRadius);
      const distInside = -sdf; 

      if (distInside <= 0 || distInside > bezelWidth) {
        data[idx]     = 128;
        data[idx + 1] = 128;
        data[idx + 2] = 128;
        data[idx + 3] = 255;
        continue;
      }

      const t = distInside / bezelWidth;
      const sampleIdx = Math.min(samples - 1, Math.floor(t * (samples - 1)));
      const magnitude = precomp[sampleIdx] / maxDisp; 

      const grad = sdfGradient(px, py, cx, cy, hw, hh, borderRadius);
      const dx = -grad.x * magnitude;
      const dy = -grad.y * magnitude;

      data[idx]     = Math.round(128 + dx * 127); 
      data[idx + 1] = Math.round(128 + dy * 127); 
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

// ── LiquidGlass wrapper component ─────────────────────────────────────────────
export default function LiquidGlass({
  children,
  borderRadius   = 20,
  bezelWidth     = 28,
  scale          = 80,
  ior            = 1.5,
  blur           = 24,
  saturation     = 1.9,
  brightness     = 0.94,
  background     = 'rgba(12, 12, 16, 0.45)',
  hoverBackground = null,
  hoverBrightness = null,
  style          = {},
  className      = '',
  ...rest
}) {
  const [hovered, setHovered] = useState(false);
  
  // Tweened states for smooth lens magnification
  const [animatedScale, setAnimatedScale] = useState(scale);

  
  const uid         = useId().replace(/:/g, '');
  const filterId    = `lg-${uid}`;
  const canvasRef   = useRef(null);
  const feImageRef  = useRef(null);
  const wrapperRef  = useRef(null);
  const specularRef = useRef(null); // Ref for the moving hotspot

  // Lens Magnification Tween Animation
  useEffect(() => {
    const startScale = animatedScale;
    const targetScale = hovered ? scale * 1.12 : scale;
    const startTime = performance.now();
    let frameId;
    const animate = (time) => {
      const progress = Math.min((time - startTime) / 120, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setAnimatedScale(startScale + (targetScale - startScale) * easeOut);
      if (progress < 1) frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [hovered, scale]);

  // Canvas Generation Observer
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let roTimer;
    const ro = new ResizeObserver(() => {
      clearTimeout(roTimer);
      roTimer = setTimeout(() => {
        const { offsetWidth: w, offsetHeight: h } = wrapper;
        if (!w || !h) return;
        const url = getCachedDisplacementMap(w, h, borderRadius, bezelWidth, ior);
        if (feImageRef.current) {
          feImageRef.current.setAttribute('href', url);
          feImageRef.current.setAttribute('width',  String(w));
          feImageRef.current.setAttribute('height', String(h));
        }
      }, 50); // debounce 50ms
    });

    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [borderRadius, bezelWidth, ior]);

  // Fast Mouse Tracking for Specular Highlight
  const handleMouseMove = (e) => {
    if (!wrapperRef.current || !specularRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Updates DOM directly to bypass React render cycle for 60fps tracking
    specularRef.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.18) 0%, transparent 55%)`;
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (specularRef.current) {
      // Reset to generic top-down lighting when mouse leaves
      specularRef.current.style.background = 'radial-gradient(circle at 50% -20%, rgba(255,255,255,0.12) 0%, transparent 60%)';
    }
  };

  return (
    <>
      {/* Hidden SVG filter */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
        <defs>
          <filter id={filterId} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage ref={feImageRef} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="dispMap" />
            {/* Single displacement pass — much cheaper than 3x chromatic split */}
            <feDisplacementMap
              in="SourceGraphic" in2="dispMap"
              scale={animatedScale}
              xChannelSelector="R" yChannelSelector="G"
              result="displaced"
              colorInterpolationFilters="sRGB"
            />
            <feColorMatrix in="displaced" type="saturate" values="2.2" result="saturated"/>
          </filter>
        </defs>
      </svg>

      {/* The glass element */}
      <div
        ref={wrapperRef}
        className={`liquid-glass-wrap ${className}`}
        style={{
          position: 'relative',
          borderRadius,
          overflow: 'visible',
          background: hovered && hoverBackground ? hoverBackground : background,
          backdropFilter: `url(#${filterId}) blur(${blur}px) saturate(${saturation}) brightness(${hovered && hoverBrightness ? hoverBrightness : brightness})`,
          WebkitBackdropFilter: `blur(${blur}px) saturate(${saturation}) brightness(${brightness})`,
          border:    '1px solid rgba(255,255,255,0.06)',
          borderTop: '1px solid rgba(255,255,255,0.18)',
          boxShadow: [
            'inset 0 0.5px 0 rgba(255,255,255,0.14)',
            hovered ? '0 8px 24px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.4)', // Slightly deeper shadow on hover
          ].join(', '),
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
          ...style,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        {...rest}
      >
        {/* Iridescent rim */}
        <div style={{
          position:     'absolute',
          inset:        0,
          borderRadius: 'inherit',
          padding:      '1px',
          background:   'conic-gradient(from 0deg, rgba(255,80,160,0.4), rgba(80,180,255,0.35), rgba(120,255,180,0.25), rgba(255,220,80,0.3), rgba(200,80,255,0.4), rgba(255,80,160,0.4))',
          WebkitMask:   'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          mask:         'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none',
          zIndex:        2,
          opacity:       hovered ? 0.7 : 0.5, // Brighter rim on hover
          transition:    'opacity 0.3s ease',
          animation:     'lg-iridescent 7s linear infinite',
        }}/>
        
        {/* Dynamic Specular Hotspot */}
        <div 
          ref={specularRef}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            background: 'radial-gradient(circle at 50% -20%, rgba(255,255,255,0.12) 0%, transparent 60%)',
            pointerEvents: 'none',
            zIndex: 1,
            transition: 'opacity 0.3s ease',
            opacity: hovered ? 1 : 0.6,
          }}
        />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 3 }}>
          {children}
        </div>
      </div>

      <style>{`
        @keyframes lg-iridescent {
          from { filter: hue-rotate(0deg); }
          to   { filter: hue-rotate(360deg); }
        }
      `}</style>
    </>
  );
}