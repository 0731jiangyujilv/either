import {createContext, useCallback, useContext, useMemo, useState} from "react";

import {AccountPanel} from "./AccountPanel";
import {AmountPanel, type AmountPanelIntent} from "./AmountPanel";
import {Drawer} from "./Drawer";
import {TopBar} from "./TopBar";
import type {Side} from "@/lib/contracts";
import {usePosition, useRound, type RoundData} from "@/lib/hooks";

type Shell = {
  openAmount: (mode: "back" | "withdraw", side: Side) => void;
};

const ShellContext = createContext<Shell | null>(null);

/** Open the back / withdraw panel from anywhere inside the shell. */
export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside <AppShell>");
  return shell;
}

type AppShellProps = {
  children: React.ReactNode;
  /** The centred lockup links home on every page except the arena itself. */
  brandAsLink?: boolean;
};

/**
 * Chrome shared by both pages: the top bar, the `//` drawer, the account panel
 * and the amount panel. Owning the panel state here keeps a single source of
 * truth for what is open.
 */
export function AppShell({children, brandAsLink = false}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [intent, setIntent] = useState<AmountPanelIntent | null>(null);

  const {data: round} = useRound();
  const {data: position} = usePosition();

  const roundData = round as RoundData | undefined;
  const nameA = roundData?.sideAName ?? "side a";
  const nameB = roundData?.sideBName ?? "side b";
  const sideNames = useMemo<[string, string]>(() => [nameA, nameB], [nameA, nameB]);

  const openAmount = useCallback(
    (mode: "back" | "withdraw", side: Side) => {
      setAccountOpen(false);
      setIntent({mode, side, sideName: side === 0 ? nameA : nameB});
    },
    [nameA, nameB],
  );

  const shell = useMemo<Shell>(() => ({openAmount}), [openAmount]);

  // stable identities, so the panels' effects are not restarted every render
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const closeAmount = useCallback(() => setIntent(null), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const openAccount = useCallback(() => setAccountOpen(true), []);
  const withdrawFromAccount = useCallback(
    (side: Side) => openAmount("withdraw", side),
    [openAmount],
  );

  return (
    <ShellContext.Provider value={shell}>
      <div className="page">
        <TopBar
          onOpenDrawer={openDrawer}
          onOpenAccount={openAccount}
          brandAsLink={brandAsLink}
        />

        {children}

        <Drawer open={drawerOpen} onClose={closeDrawer} />

        {accountOpen ? (
          <AccountPanel
            sideNames={sideNames}
            position={position ?? [0n, 0n]}
            onClose={closeAccount}
            onWithdraw={withdrawFromAccount}
          />
        ) : null}

        {intent ? (
          <AmountPanel
            {...intent}
            position={position ? position[intent.side] : 0n}
            onClose={closeAmount}
          />
        ) : null}
      </div>
    </ShellContext.Provider>
  );
}
