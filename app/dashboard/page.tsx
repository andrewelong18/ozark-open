import { createClient } from "@/lib/supabase/server"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Tournament = {
  id: string
  name: string
  year: number
  status: "upcoming" | "active" | "completed"
}

type Participant = {
  entry_fee: number
  is_player: boolean
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select("id, name, year, status")
    .in("status", ["upcoming", "active"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tournamentData) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <p className="text-muted-foreground">No active tournament found.</p>
      </div>
    )
  }

  const tournament = tournamentData as Tournament

  const { data: participantData } = user
    ? await supabase
        .from("tournament_participants")
        .select("entry_fee, is_player")
        .eq("user_id", user.id)
        .eq("tournament_id", tournament.id)
        .maybeSingle()
    : { data: null }

  const participant = participantData as Participant | null

  const badgeVariant =
    tournament.status === "active" ? "default" : "secondary"
  const badgeLabel =
    tournament.status === "active" ? "Betting Open" : "Upcoming"

  return (
    <div className="container mx-auto flex max-w-lg flex-col gap-4 px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{tournament.name}</CardTitle>
            <Badge variant={badgeVariant}>{badgeLabel}</Badge>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Registration</CardTitle>
        </CardHeader>
        <CardContent>
          {participant ? (
            <div className="flex flex-col gap-1">
              <p className="font-medium">You&apos;re in.</p>
              <p className="text-sm text-muted-foreground">
                Entry fee: ${participant.entry_fee}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                You&apos;re not registered for this tournament.
              </p>
              <p className="text-sm text-muted-foreground">
                Contact an admin to be added.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
