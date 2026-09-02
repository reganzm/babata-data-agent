'use client'

import { useSearchParams } from 'next/navigation'
import { motion, type Variants } from 'motion/react'
import { ArrowRight, Database, Lock, MessageSquare, Sparkles, User } from 'lucide-react'
import { ThemeToggle } from '@/app/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ease } from '@/lib/animations'
import {
  loginErrorMessage,
  safeInternalRedirect,
} from '@/lib/auth/login-navigation'

const stagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.12 },
  },
}

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease },
  },
}

const FEATURES = [
  { icon: MessageSquare, label: '多 Agent 智囊团对话' },
  { icon: Database, label: '数据源与虚拟表编排' },
  { icon: Sparkles, label: '知识库 RAG 增强问数' },
] as const

export function LoginForm() {
  const searchParams = useSearchParams()
  const redirect = safeInternalRedirect(searchParams.get('redirect'))
  const error = loginErrorMessage(searchParams.get('error'))

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_10%_20%,var(--neon-cyan-glow),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_90%_80%,var(--neon-green-glow),transparent_45%)]" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
          style={{
            backgroundImage: `
              linear-gradient(to right, oklch(0.52 0.17 185 / 8%) 1px, transparent 1px),
              linear-gradient(to bottom, oklch(0.52 0.17 185 / 8%) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 85% 75% at 50% 45%, black 20%, transparent 72%)',
          }}
        />
        <div className="login-orb login-orb-a absolute left-[8%] top-[18%] size-56 rounded-full bg-neon-cyan/20 blur-3xl" />
        <div className="login-orb login-orb-b absolute bottom-[12%] right-[6%] size-72 rounded-full bg-neon-green/15 blur-3xl" />
      </div>

      <div className="absolute right-5 top-5 z-20 sm:right-8 sm:top-8">
        <ThemeToggle />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-10">
        <motion.section
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="hidden lg:block"
        >
          <motion.p
            variants={rise}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-medium tracking-wide text-primary"
          >
            <Sparkles className="size-3.5" />
            数据智能 · 智囊协作
          </motion.p>

          <motion.h1
            variants={rise}
            className="font-[family-name:var(--font-login-display)] text-5xl font-extrabold leading-[1.05] tracking-tight"
          >
            <span className="bg-gradient-to-br from-neon-cyan via-primary to-neon-green bg-clip-text text-transparent">
              Babata
            </span>
            <br />
            <span className="text-foreground/90">你的数据智囊团</span>
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground"
          >
            连接数据源、沉淀知识库、与多 Agent 协作——从口语提问到可执行 SQL 与可视化，一站完成。
          </motion.p>

          <motion.ul variants={rise} className="mt-10 space-y-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3 backdrop-blur-sm"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm text-foreground/85">{label}</span>
              </li>
            ))}
          </motion.ul>
        </motion.section>

        <motion.section
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="mx-auto w-full max-w-md"
        >
          <motion.div variants={rise} className="mb-8 text-center lg:hidden">
            <h1 className="font-[family-name:var(--font-login-display)] bg-gradient-to-r from-neon-cyan to-neon-green bg-clip-text text-4xl font-extrabold text-transparent">
              Babata
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">智囊团 · 登录后使用</p>
          </motion.div>

          <motion.div
            variants={rise}
            className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-7 shadow-[0_24px_80px_-24px_oklch(0.52_0.17_185_/_25%)] backdrop-blur-xl dark:bg-card/60 dark:shadow-[0_24px_80px_-20px_oklch(0_0_0_/_55%)]"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            />

            <div className="mb-6 hidden lg:block">
              <h2 className="font-[family-name:var(--font-login-display)] text-2xl font-bold tracking-tight">
                欢迎回来
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                登录以继续你的数据探索
              </p>
            </div>

            <form action="/api/auth/login" method="post" className="space-y-5">
              <input type="hidden" name="redirect" value={redirect} />

              <motion.div variants={rise} className="space-y-2">
                <label
                  htmlFor="username"
                  className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  用户名
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    name="username"
                    autoComplete="username"
                    placeholder="请输入用户名"
                    required
                    className="h-11 border-border/70 bg-background/60 pl-10 text-base shadow-inner shadow-primary/5 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                  />
                </div>
              </motion.div>

              <motion.div variants={rise} className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  密码
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="请输入密码"
                    required
                    className="h-11 border-border/70 bg-background/60 pl-10 text-base shadow-inner shadow-primary/5 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                  />
                </div>
              </motion.div>

              {error ? (
                <motion.p
                  variants={rise}
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </motion.p>
              ) : null}

              <motion.div variants={rise}>
                <Button
                  type="submit"
                  size="lg"
                  className="group h-11 w-full gap-2 bg-gradient-to-r from-neon-cyan to-neon-green text-primary-foreground shadow-[0_8px_32px_-8px_var(--neon-cyan-glow)] transition-all hover:brightness-105 hover:shadow-[0_12px_40px_-8px_var(--neon-cyan-glow)]"
                >
                  进入 Babata
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </motion.div>
            </form>
          </motion.div>
        </motion.section>
      </div>
    </main>
  )
}
