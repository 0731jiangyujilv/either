import {useEffect, useRef} from "react";
import {Link} from "react-router-dom";

import {Logo} from "./Logo";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
};

/** The `//` navigation drawer. */
export function Drawer({open, onClose}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;

    firstLinkRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // keep focus inside the drawer while it is open
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="drawer__scrim" onClick={onClose} role="presentation" />
      <div
        className="drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="navigation"
      >
        <div className="drawer__head">
          <Logo />
          <button type="button" className="icon-close" onClick={onClose} aria-label="close navigation">
            ×
          </button>
        </div>

        <nav className="drawer__nav">
          <Link to="/vault" ref={firstLinkRef} onClick={onClose}>
            vault round
          </Link>
          <Link to="/docs" onClick={onClose}>
            docs
          </Link>
          <Link to="/" onClick={onClose}>
            home
          </Link>
        </nav>

        <p className="drawer__foot">the internet&rsquo;s arena.</p>
      </div>
    </>
  );
}
