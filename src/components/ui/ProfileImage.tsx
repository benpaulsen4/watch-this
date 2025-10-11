"use client";

import { useState } from "react";

export interface ProfileImageProps {
  src?: string | null;
  username: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  fallbackClassName?: string;
}

const sizeClasses = {
  sm: "w-8 h-8 text-sm",
  md: "w-10 h-10 text-base",
  lg: "w-12 h-12 text-lg",
  xl: "w-16 h-16 text-xl",
};

const fallbackGradients = [
  "from-purple-500 to-blue-500",
  "from-blue-500 to-cyan-500",
  "from-cyan-500 to-teal-500",
  "from-teal-500 to-green-500",
  "from-green-500 to-yellow-500",
  "from-yellow-500 to-orange-500",
  "from-orange-500 to-red-500",
  "from-red-500 to-pink-500",
  "from-pink-500 to-purple-500",
];

export function ProfileImage({
  src,
  username,
  size = "md",
  className = "",
  fallbackClassName = "",
}: ProfileImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Generate consistent gradient based on username
  const gradientIndex = username.charCodeAt(0) % fallbackGradients.length;
  const gradient = fallbackGradients[gradientIndex];

  const baseClasses = `${sizeClasses[size]} rounded-full flex items-center justify-center font-medium text-white ${className}`;

  // Show fallback if no src, image error, or still loading
  if (!src || imageError) {
    return (
      <div
        className={`${baseClasses} bg-gradient-to-br ${gradient} ${fallbackClassName}`}
      >
        {username.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} relative overflow-hidden ${fallbackClassName}`}
    >
      {imageLoading && (
        <div
          className={`absolute inset-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}
        >
          {username.charAt(0).toUpperCase()}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${username}'s profile picture`}
        className={`w-full h-full object-cover ${imageLoading ? "opacity-0" : "opacity-100"} transition-opacity duration-200`}
        onLoad={() => setImageLoading(false)}
        onError={() => {
          setImageError(true);
          setImageLoading(false);
        }}
      />
    </div>
  );
}
