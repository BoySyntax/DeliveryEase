import React from 'react';

// A scalable SVG icon for the DeliveryEase logo (green delivery truck with a box)
const DeliveryEaseIcon = ({ size = 128, className = '' }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <g>
      {/* Truck body */}
      <rect x="8" y="24" width="32" height="16" rx="3" fill="#34c759" />
      {/* Truck cabin */}
      <rect x="40" y="28" width="14" height="12" rx="2" fill="#34c759" />
      {/* Wheels */}
      <circle cx="16" cy="44" r="4" fill="#34c759" stroke="#222" strokeWidth="2" />
      <circle cx="46" cy="44" r="4" fill="#34c759" stroke="#222" strokeWidth="2" />
      {/* Speed lines */}
      <rect x="2" y="30" width="8" height="2" rx="1" fill="#34c759" />
      <rect x="2" y="34" width="6" height="2" rx="1" fill="#34c759" />
      <rect x="2" y="38" width="4" height="2" rx="1" fill="#34c759" />
      {/* Box on truck */}
      <rect x="20" y="28" width="12" height="8" rx="1.5" fill="#fff" stroke="#34c759" strokeWidth="2" />
      <polyline points="20,28 26,32 32,28" fill="none" stroke="#34c759" strokeWidth="2" />
      <polyline points="20,36 26,32 32,36" fill="none" stroke="#34c759" strokeWidth="2" />
    </g>
  </svg>
);

export default DeliveryEaseIcon; 