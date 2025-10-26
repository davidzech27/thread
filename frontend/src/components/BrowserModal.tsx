import React, { useEffect, useRef } from 'react';

interface BrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  frameData: string | null;
  metadata: { width: number; height: number } | null;
}

export const BrowserModal: React.FC<BrowserModalProps> = ({
  isOpen,
  onClose,
  title,
  frameData,
  metadata
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Initialize canvas context
  useEffect(() => {
    if (canvasRef.current && !contextRef.current) {
      contextRef.current = canvasRef.current.getContext('2d');
    }
  }, []);

  // Render frame when data updates
  useEffect(() => {
    if (!frameData || !canvasRef.current) {
      return;
    }

    // Ensure context is initialized
    if (!contextRef.current) {
      contextRef.current = canvasRef.current.getContext('2d');
      if (!contextRef.current) {
        console.error('[BrowserModal] Failed to get canvas 2d context');
        return;
      }
    }

    const canvas = canvasRef.current;
    const ctx = contextRef.current;

    // Create image from base64 data
    const img = new Image();
    img.onload = () => {
      // Clear canvas before drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw image to canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.onerror = (err) => {
      console.error('[BrowserModal] Failed to load image:', err);
    };
    img.src = `data:image/jpeg;base64,${frameData}`;
  }, [frameData, metadata]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return React.createElement(
    'div',
    {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease-out',
      },
      onClick: handleBackdropClick,
    },
    // Header
    React.createElement(
      'div',
      {
        style: {
          padding: '16px 24px',
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#2a2a2a',
          flexShrink: 0,
        },
      },
      React.createElement(
        'h2',
        {
          style: {
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: '#fff',
          },
        },
        title || 'Browser View'
      ),
      React.createElement(
        'button',
        {
          onClick: onClose,
          style: {
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'background 0.2s',
          },
          onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
            (e.target as HTMLButtonElement).style.background = '#2563eb';
          },
          onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
            (e.target as HTMLButtonElement).style.background = '#3b82f6';
          },
        },
        'Exit Fullscreen'
      )
    ),
    // Browser viewport
    React.createElement(
      'div',
      {
        style: {
          flex: 1,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        },
      },
      // Canvas
      React.createElement('canvas', {
        ref: canvasRef,
        width: 1440,
        height: 900,
        style: {
          width: '100%',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          display: frameData ? 'block' : 'none',
        },
      }),
      // Loading/empty state
      !frameData && React.createElement(
        'div',
        {
          style: {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#888',
            fontSize: '16px',
            textAlign: 'center',
          },
        },
        React.createElement('div', { style: { marginBottom: '12px' } }, 'Waiting for browser...'),
        React.createElement(
          'div',
          { style: { fontSize: '14px', color: '#666' } },
          'Agent will control browser when needed'
        )
      )
    ),
    // Info footer
    metadata && frameData && React.createElement(
      'div',
      {
        style: {
          padding: '8px 24px',
          background: '#2a2a2a',
          borderTop: '1px solid #333',
          fontSize: '12px',
          color: '#888',
          display: 'flex',
          justifyContent: 'space-between',
          flexShrink: 0,
        },
      },
      React.createElement(
        'span',
        null,
        `Resolution: ${metadata.width} × ${metadata.height}`
      ),
      React.createElement(
        'span',
        null,
        'Agent is controlling this browser'
      )
    )
  );
};
