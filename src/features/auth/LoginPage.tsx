import { useAuth } from '../../lib/useAuth'
export function LoginPage() {
  const { signInWithGoogle } = useAuth()
  return (
    <main className="min-h-dvh grid place-items-center">
      <button onClick={signInWithGoogle}
        className="rounded-lg px-4 py-2 bg-black text-white">Sign in with Google</button>
    </main>
  )
}
