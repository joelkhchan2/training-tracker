import { useAuth } from '../../lib/useAuth'
export function HomePage() {
  const { user, signOut } = useAuth()
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Training Tracker</h1>
      <p className="text-sm text-neutral-500">Signed in as {user?.email}</p>
      <p className="text-neutral-400">No workouts yet. Logging arrives in Phase 2.</p>
      <button onClick={signOut} className="text-sm underline">Sign out</button>
    </main>
  )
}
