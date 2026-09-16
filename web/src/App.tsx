import {BrowserRouter, Route, Routes} from "react-router-dom";

import {ArenaPage} from "@/pages/ArenaPage";
import {DocsPage} from "@/pages/DocsPage";
import {VaultPage} from "@/pages/VaultPage";
import {Providers} from "./providers";

/**
 * The routes that used to be `app/page.tsx` and `app/docs/page.tsx`, plus the
 * v1 vault page.
 *
 * Providers sit above the router so the wagmi config and the query client
 * survive navigation, exactly as they did in the Next root layout.
 */
export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ArenaPage />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/docs" element={<DocsPage />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  );
}
