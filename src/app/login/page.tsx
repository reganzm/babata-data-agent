import { Syne } from 'next/font/google'
import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-login-display',
  weight: ['600', '700', '800'],
})

export default function LoginPage() {
  return (
    <div className={syne.variable}>
      <Suspense fallback={<LoginPageFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}

function LoginPageFallback() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--neon-cyan-glow),transparent_55%)]"
      />
      <p className="animate-pulse text-sm tracking-[0.2em] text-muted-foreground uppercase">
        Babata
      </p>
    </main>
  )
}
