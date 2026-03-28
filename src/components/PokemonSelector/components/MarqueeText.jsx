/**
 * MarqueeText Component
 * Wraps text that may overflow and adds marquee animation
 */

import React, { useRef, useEffect } from 'react';

function useMarqueeOnOverflow(deps = []) {
  const wrapperRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const text = textRef.current;
    if (!wrapper || !text) return;

    const checkOverflow = () => {
      // Reset completely first so scrollWidth is the clean single-copy measurement
      text.classList.remove('marquee');
      text.removeAttribute('data-marquee');
      text.style.removeProperty('--one-copy-width');
      wrapper.style.removeProperty('mask-image');
      wrapper.style.removeProperty('-webkit-mask-image');
      void text.offsetWidth; // force reflow

      const isOverflowing = text.scrollWidth > wrapper.clientWidth && text.textContent.length >= 11;

      if (isOverflowing) {
        const singleWidth = text.scrollWidth;
        const fontSize = parseFloat(getComputedStyle(text).fontSize) || 28;
        const gapPx = fontSize * 1.5;
        text.style.setProperty('--one-copy-width', `${singleWidth + gapPx}px`);
        text.setAttribute('data-marquee', text.textContent);
        text.classList.add('marquee');
        const fade = 'linear-gradient(to right, transparent 0%, #000 6%, #000 94%, transparent 100%)';
        wrapper.style.maskImage = fade;
        wrapper.style.webkitMaskImage = fade;
      }
    };

    const rafId = requestAnimationFrame(checkOverflow);
    window.addEventListener('resize', checkOverflow);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', checkOverflow);
    };
  }, deps);

  return { wrapperRef, textRef };
}

export function MarqueeText({ text, children, className = '' }) {
  const { wrapperRef, textRef } = useMarqueeOnOverflow([text, children]);

  return (
    <div
      ref={wrapperRef}
      className={`marquee-wrapper ${className}`}
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <div
        ref={textRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
        }}
      >
        {text || children}
      </div>
    </div>
  );
}

export default MarqueeText;
