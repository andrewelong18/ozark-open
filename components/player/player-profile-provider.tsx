"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import { Dialog, DialogPopup } from "@/components/ui/dialog"
import {
  PlayerProfileModal,
  type PlayerFallback,
} from "@/components/player/player-profile-modal"

// One shared profile modal for the whole app (Sprint 18). Any clicked name
// (see PlayerChip) calls open(userId, fallback) and this single Dialog handles
// the rest — so we never mount a dialog per name. Mounted once in the root
// layout, wrapping every page.

type PlayerProfileContextValue = {
  open: (userId: string, fallback?: PlayerFallback) => void
}

const PlayerProfileContext = createContext<PlayerProfileContextValue | null>(
  null
)

export function usePlayerProfileModal(): PlayerProfileContextValue {
  const ctx = useContext(PlayerProfileContext)
  if (!ctx) {
    throw new Error(
      "usePlayerProfileModal must be used within <PlayerProfileProvider>"
    )
  }
  return ctx
}

export function PlayerProfileProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  // Kept set while closing so the modal keeps rendering its content through the
  // exit animation; only replaced when a different name is opened.
  const [active, setActive] = useState<{
    userId: string
    fallback?: PlayerFallback
  } | null>(null)

  const open = useCallback((userId: string, fallback?: PlayerFallback) => {
    setActive({ userId, fallback })
    setIsOpen(true)
  }, [])

  const value = useMemo(() => ({ open }), [open])

  return (
    <PlayerProfileContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogPopup>
          {active && (
            // Remount on a new member so the fetch + loading state reset.
            <PlayerProfileModal
              key={active.userId}
              userId={active.userId}
              fallback={active.fallback}
            />
          )}
        </DialogPopup>
      </Dialog>
    </PlayerProfileContext.Provider>
  )
}
