import { useEffect, useRef } from 'react';

type IdleTimeoutProps = {
  onIdle: () => void;
  idleTime?: number; // in minutes
};

/**
 * Hook to detect user inactivity and trigger a callback
 * @param onIdle Function to call when user goes idle
 * @param idleTime Time in minutes before considering user idle (default: 10)
 */
export const useIdleTimeout = ({ onIdle, idleTime = 10 }: IdleTimeoutProps) => {
  const idleTimeoutRef = useRef<number | null>(null);

  const resetIdleTimeout = () => {
    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
    }
    
    // Convert minutes to milliseconds
    const timeoutInMs = idleTime * 60 * 1000;
    
    idleTimeoutRef.current = window.setTimeout(() => {
      // Fire the onIdle callback
      onIdle();
    }, timeoutInMs);
  };

  useEffect(() => {
    // Set up event listeners to reset the idle timeout
    const events = [
      'mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart',
      'click', 'keydown', 'keyup'
    ];

    // Reset the timeout initially
    resetIdleTimeout();

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, resetIdleTimeout);
    });

    // Cleanup function to remove event listeners and clear the timeout
    return () => {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
      }
      
      events.forEach(event => {
        window.removeEventListener(event, resetIdleTimeout);
      });
    };
  }, [idleTime, onIdle]);
  
  return { resetIdleTimeout };
};