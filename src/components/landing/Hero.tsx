import { Button } from '@/components/ui/button';
import { Mic, Calendar, Slack, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      {/* Solid dark gradient - theme-independent for consistent look */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800" />
      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
      />
      {/* Accent glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-[#4C7DFF]/20 rounded-full blur-[128px]" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-[#4C7DFF]/10 rounded-full blur-[100px]" />

      <div className="container relative z-10 mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge - high contrast */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-slate-300 text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4 text-[#4C7DFF]" />
            AI-Powered Meeting Intelligence
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="text-white">Never Miss a</span>
            <br />
            <span className="bg-gradient-to-r from-[#4C7DFF] to-[#7B9EFF] bg-clip-text text-transparent">
              Meeting Insight
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            Automatically record any meeting, transcribe with AI, and get instant
            summaries delivered to Slack. Stop taking notes and start taking action.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <a
              href="https://chromewebstore.google.com/detail/echobrief-meeting-recorde/feilmpoccaneccgbkankibcfkamacbag"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="xl"
                className="bg-[#4C7DFF] hover:bg-[#3d6ae6] text-white gap-2 h-12 px-8 text-base font-semibold shadow-lg shadow-[#4C7DFF]/25"
              >
                Add to Chrome (Free)
                <ArrowRight className="w-5 h-5" />
              </Button>
            </a>
            <Link to="/auth">
              <Button
                variant="outline"
                size="xl"
                className="border-white/20 text-white hover:bg-white/10 hover:text-white h-12 px-8 text-base font-medium"
              >
                Sign In to Dashboard
              </Button>
            </Link>
          </div>

          {/* Feature pills - solid backgrounds for readability */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: Mic, label: 'Record Any Meeting' },
              { icon: Sparkles, label: 'AI Transcription' },
              { icon: Calendar, label: 'Calendar Sync' },
              { icon: Slack, label: 'Slack Delivery' },
            ].map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 transition-colors"
              >
                <feature.icon className="w-5 h-5 text-[#4C7DFF]" />
                <span className="text-sm font-medium">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Smooth transition to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}
