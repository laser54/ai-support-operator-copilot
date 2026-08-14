export function BrandMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Outer squircle frame */}
      <rect width="32" height="32" rx="8" fill="#0c0e17" />
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="7.25"
        stroke="url(#opBrandBorder)"
        strokeWidth="1.5"
        strokeOpacity="0.45"
      />

      {/* Support Headset Headband arc */}
      <path
        d="M7 16 C7 8.5 11 5 16 5 C21 5 25 8.5 25 16"
        stroke="url(#opHeadsetGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Left & Right Headset Earcups */}
      <rect x="4.5" y="12.5" width="3.5" height="8" rx="1.75" fill="url(#opHeadsetGrad)" />
      <rect x="24" y="12.5" width="3.5" height="8" rx="1.75" fill="url(#opHeadsetGrad)" />

      {/* Robot Operator Head Base */}
      <rect
        x="9"
        y="9.5"
        width="14"
        height="13.5"
        rx="4"
        fill="#141724"
        stroke="url(#opHeadGrad)"
        strokeWidth="1.25"
      />

      {/* Futuristic Visor Screen */}
      <rect x="11" y="12.5" width="10" height="5" rx="2" fill="#07080d" />

      {/* Glowing Visor AI Eyes & Status Wave */}
      <circle cx="13.5" cy="15" r="1.1" fill="#2dd4bf" />
      <circle cx="18.5" cy="15" r="1.1" fill="#2dd4bf" />
      <path d="M15.2 15H16.8" stroke="#2dd4bf" strokeWidth="1" strokeLinecap="round" />

      {/* Operator Boom Microphone */}
      <path
        d="M6.5 19 C6.5 24 9.5 26.2 14.5 26.2"
        stroke="url(#opMicGrad)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />

      {/* Glowing Mic Capsule */}
      <circle cx="15.5" cy="26.2" r="1.5" fill="#a78bfa" />
      <circle cx="15.5" cy="26.2" r="0.75" fill="#ffffff" />

      <defs>
        <linearGradient
          id="opBrandBorder"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#a78bfa" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
        <linearGradient
          id="opHeadsetGrad"
          x1="4.5"
          y1="5"
          x2="27.5"
          y2="20.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#a78bfa" />
          <stop offset="0.5" stopColor="#818cf8" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
        <linearGradient
          id="opHeadGrad"
          x1="9"
          y1="9.5"
          x2="23"
          y2="23"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#a78bfa" stopOpacity="0.8" />
          <stop offset="1" stopColor="#2dd4bf" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient
          id="opMicGrad"
          x1="6.5"
          y1="19"
          x2="16"
          y2="26.2"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#818cf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
    </svg>
  );
}
