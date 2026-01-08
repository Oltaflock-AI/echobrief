import { Mic, Cpu, MessageSquare, CheckCircle } from 'lucide-react';

const steps = [
  {
    icon: Mic,
    step: '01',
    title: 'Record Your Meeting',
    description: 'Click to start recording or let us auto-detect from your calendar. We capture both system audio and microphone.',
  },
  {
    icon: Cpu,
    step: '02',
    title: 'AI Processes Audio',
    description: 'Our AI transcribes the conversation with speaker detection and generates structured insights automatically.',
  },
  {
    icon: MessageSquare,
    step: '03',
    title: 'Get Slack Summary',
    description: 'Receive a beautifully formatted summary with action items, decisions, and key points in your Slack channel.',
  },
  {
    icon: CheckCircle,
    step: '04',
    title: 'Take Action',
    description: 'Search transcripts, review insights, and keep your team aligned. Never miss a follow-up again.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            How it works
          </h2>
          <p className="text-xl text-muted-foreground">
            From meeting to actionable insights in minutes
          </p>
        </div>

        {/* Steps */}
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div 
                key={step.step}
                className="relative animate-fade-in"
                style={{ animationDelay: `${index * 0.15}s` }}
              >
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-1/2 w-full h-0.5 bg-gradient-to-r from-accent/50 to-accent/20" />
                )}
                
                <div className="relative z-10 text-center">
                  {/* Step number */}
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-card border-2 border-accent/20 shadow-lg mb-6">
                    <step.icon className="w-10 h-10 text-accent" />
                  </div>
                  
                  {/* Step indicator */}
                  <div className="text-accent font-mono text-sm font-bold mb-2">
                    {step.step}
                  </div>
                  
                  <h3 className="text-xl font-semibold text-foreground mb-3">
                    {step.title}
                  </h3>
                  
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
