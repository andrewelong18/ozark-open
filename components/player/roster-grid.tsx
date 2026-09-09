"use client"

import { usePlayerProfileModal } from "@/components/player/player-profile-provider"
import { Avatar } from "@/components/avatar"
import type { RosterPlayer } from "@/lib/roster-page"

// The roster's card grid (Sprint 26). Face and name only — everything else a
// member might want to know is one tap away in the profile modal, which every
// other surface in the app already opens the same way. The card is deliberately
// not a PlayerChip: a chip is a name-sized inline trigger, and this needs the
// whole card to be the target.
//
// The avatar is big on purpose. This is a page for looking at people, mostly
// on a phone, and the pictures are the point — two columns at 375px puts each
// face at roughly 140px rather than the 40px a list row would give it.

export function RosterGrid({ players }: { players: RosterPlayer[] }) {
  const { open } = usePlayerProfileModal()

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {players.map((player) => (
        <li key={player.user_id}>
          <button
            type="button"
            onClick={() =>
              open(player.user_id, {
                displayName: player.name,
                nickname: player.nickname,
                avatarUrl: player.avatar_url,
              })
            }
            className="flex h-full w-full cursor-pointer flex-col items-center gap-3 rounded-xl border border-border bg-surface-card px-3 py-5 text-center transition-colors duration-fast ease-standard hover:border-border-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Avatar
              src={player.avatar_url}
              name={player.name}
              size="lg"
              className="size-28 text-4xl shadow-sm ring-1 ring-black/5 sm:size-32 sm:text-5xl"
            />
            <span className="min-w-0">
              <span className="block font-heading leading-tight font-semibold text-balance text-text-strong">
                {player.name}
              </span>
              {player.nickname && (
                <span className="mt-0.5 block text-sm leading-snug font-medium text-accent-gold-strong">
                  &ldquo;{player.nickname}&rdquo;
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
