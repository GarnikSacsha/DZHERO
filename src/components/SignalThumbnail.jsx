import React, { useEffect, useRef, useState } from 'react';

export default function SignalThumbnail({
  src,
  alt = '',
  fallbackLabel = 'Signal',
  onRecover,
}) {
  const [currentSrc, setCurrentSrc] = useState(src || '');
  const [status, setStatus] = useState(src ? 'loading' : 'fallback');
  const recoveryAttemptedRef = useRef(false);

  useEffect(() => {
    recoveryAttemptedRef.current = false;
    setCurrentSrc(src || '');
    setStatus(src ? 'loading' : 'fallback');
  }, [src]);

  const handleError = async () => {
    if (!onRecover || recoveryAttemptedRef.current) {
      setStatus('fallback');
      return;
    }
    recoveryAttemptedRef.current = true;
    setStatus('recovering');
    try {
      const recoveredSrc = String(await onRecover() || '').trim();
      if (!recoveredSrc || recoveredSrc === currentSrc) {
        setStatus('fallback');
        return;
      }
      setCurrentSrc(recoveredSrc);
      setStatus('loading');
    } catch {
      setStatus('fallback');
    }
  };

  return (
    <span className={`signal-thumbnail is-${status}`} aria-hidden="true">
      {currentSrc && ['loading', 'ready'].includes(status) && (
        <img
          src={currentSrc}
          alt={alt}
          onLoad={() => setStatus('ready')}
          onError={handleError}
        />
      )}
      {status === 'recovering' && <span className="signal-thumbnail-loading" />}
      {status === 'fallback' && (
        <span className="signal-thumbnail-fallback">{fallbackLabel}</span>
      )}
    </span>
  );
}
