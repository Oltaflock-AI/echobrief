import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HeroShowcase } from '@/components/landing/HeroShowcase';
import { ArrowRight } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1] as const;

const fade = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease, delay: 0.08 * i },
  }),
};

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-8 pb-16 md:pb-24 lg:pt-12 lg:pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-20 h-[420px] w-[420px] rounded-full border border-orange-500/10 opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 bottom-0 h-[320px] w-[320px] rounded-full border border-amber-500/10 opacity-40"
      />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
        <div>
          <motion.div
            custom={0}
            initial="hidden"
            animate="show"
            variants={fade}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/[0.06] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            22 Indian languages · Bot recording
          </motion.div>

          <motion.h1
            custom={1}
            initial="hidden"
            animate="show"
            variants={fade}
            className="max-w-[560px] text-left text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.045em] text-foreground font-heading md:text-5xl lg:text-[3.25rem]"
          >
            Turn noise into{' '}
            <span className="gradient-text">decisions</span>
            <span className="text-muted-foreground">.</span>
          </motion.h1>

          <motion.p
            custom={2}
            initial="hidden"
            animate="show"
            variants={fade}
            className="mt-6 max-w-[480px] text-left text-lg leading-relaxed text-muted-foreground md:text-xl"
          >
            EchoBrief joins Meet, Zoom, and Teams. It transcribes code-mixed speech, maps speakers to real names, and
            ships summaries to Slack, WhatsApp, or inbox. Built for teams in India; clear anywhere.
          </motion.p>

          <motion.div
            custom={3}
            initial="hidden"
            animate="show"
            variants={fade}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-orange-500/30 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-500/40"
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center rounded-2xl border border-border bg-background/80 px-6 py-3.5 text-[15px] font-medium text-foreground no-underline backdrop-blur-sm transition-colors hover:border-orange-500/35 hover:bg-orange-500/[0.05]"
            >
              See how it works
            </a>
          </motion.div>

          <motion.dl
            custom={4}
            initial="hidden"
            animate="show"
            variants={fade}
            className="mt-14 grid grid-cols-2 gap-6 border-t border-border/80 pt-10 sm:grid-cols-3"
          >
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Languages</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums text-foreground font-heading">
                22
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Platforms</dt>
              <dd className="mt-1 text-3xl font-semibold text-foreground font-heading">
                3
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Delivery</dt>
              <dd className="mt-1 text-sm font-semibold leading-snug text-foreground font-heading">
                Slack · WhatsApp · Email
              </dd>
            </div>
          </motion.dl>
        </div>

        <HeroShowcase />
      </div>
    </section>
  );
}
