import { useEffect, useState } from "react";

/** Logo image with fallback to company initial if the URL fails to load (403, wrong path, etc.). */
export function CompanyLogoMark({ src, companyName, imgClassName, letterClassName }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        className={imgClassName}
        decoding="async"
        onError={() => setBroken(true)}
      />
    );
  }
  return <span className={letterClassName}>{companyName.charAt(0).toUpperCase()}</span>;
}
