import { useState } from "react";
import { coverUrl, type CoverPreset } from "./covers";
export default function CoverPhoto({
  cover,
  position = 50,
  className = "",
  thumbnail = false,
}: {
  cover: CoverPreset;
  position?: number;
  className?: string;
  thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={className} style={{ background: cover.gradient }}>
      {!failed && (
        <img
          src={coverUrl(cover, thumbnail ? 480 : 1600)}
          alt=""
          loading={thumbnail ? "lazy" : "eager"}
          referrerPolicy="no-referrer"
          style={{ objectPosition: `center ${position}%` }}
          onError={() => setFailed(true)}
        />
      )}
      {failed && thumbnail && (
        <span className="cover-photo-fallback">
          Photo unavailable · color fallback
        </span>
      )}
    </div>
  );
}
