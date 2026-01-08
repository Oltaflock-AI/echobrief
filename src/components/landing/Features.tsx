import { 
  Mic, 
  Brain, 
  FileText, 
  Slack, 
  Calendar, 
  Shield,
  Zap,
  Users
} from 'lucide-react';

const features = [
  {
    icon: Mic,
    title: 'Universal Recording',
    description: 'Capture audio from any source—Zoom, Google Meet, Teams, or in-person meetings. Works even with headphones.',
  },
  {
    icon: Brain,
    title: 'AI-Powered Insights',
    description: 'Get automatic summaries, action items, key decisions, and risks identified from every conversation.',
  },
  {
    icon: FileText,
    title: 'Smart Transcription',
    description: 'High-accuracy transcription with speaker detection. Search and reference any moment instantly.',
  },
  {
    icon: Slack,
    title: 'Slack Integration',
    description: 'Receive beautifully formatted meeting summaries directly in your preferred Slack channel.',
  },
  {
    icon: Calendar,
    title: 'Calendar Sync',
    description: 'Connect Google Calendar to automatically detect and prepare for upcoming meetings.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    description: 'Enterprise-grade security with encrypted storage. Your conversations stay confidential.',
  },
  {
    icon: Zap,
    title: 'Instant Processing',
    description: 'Get your meeting insights within minutes of ending a call. No waiting around.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Share insights across your team. Keep everyone aligned without extra meetings.',
  },
];

export function Features() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Everything you need for
            <span className="gradient-text"> smarter meetings</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Stop taking notes. Start taking action. Our AI handles the busy work so you can focus on what matters.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div 
              key={feature.title}
              className="group p-6 rounded-2xl bg-card border border-border hover:border-accent/30 hover:shadow-glow transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                <feature.icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
