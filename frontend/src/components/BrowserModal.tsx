import React from 'react';

interface BrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

export const BrowserModal: React.FC<BrowserModalProps> = ({ isOpen, onClose, title }) => {
  console.log('BrowserModal render - isOpen:', isOpen, 'title:', title);
  
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
        background: 'white',
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
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f9fafb',
          flexShrink: 0,
        },
      },
      React.createElement('h2', { style: { margin: 0, fontSize: '20px', fontWeight: 600 } }, title),
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
          },
        },
        'Exit Fullscreen'
      )
    ),
    // Browser content area
    React.createElement(
      'div',
      {
        style: {
          flex: 1,
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: '18px',
          overflow: 'auto',
        },
      },
      'Browser view coming soon...'
    )
  );
};
