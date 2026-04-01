import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Globe, MessageCircle, Zap, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { T } from '@/lib/theme';

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action: string;
}

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  // Check if user has already completed onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('google_calendar_connected, created_at')
        .eq('user_id', user.id)
        .single();

      // If user has connected calendar or has been around for more than a day, skip onboarding
      if (profile?.google_calendar_connected) {
        navigate('/dashboard');
        return;
      }

      // Check localStorage for onboarding completion
      const onboardingComplete = localStorage.getItem(`onboarding_complete_${user.id}`);
      if (onboardingComplete === 'true') {
        navigate('/dashboard');
        return;
      }

      setLoading(false);
    };

    checkOnboardingStatus();
  }, [user, navigate]);

  const steps: OnboardingStep[] = [
    {
      icon: <Calendar size={32} color={T.orangeL} />,
      title: "Connect your calendar",
      desc: "Link Google Calendar or Outlook. EchoBrief will detect meetings with video call links.",
      action: "Connect Google Calendar"
    },
    {
      icon: <Globe size={32} color={T.purple} />,
      title: "Choose your languages",
      desc: "Pick your preferred transcription and summary languages. We support 22 Indian languages plus English.",
      action: "Hindi, English, Tamil selected"
    },
    {
      icon: <MessageCircle size={32} color={T.green} />,
      title: "Set delivery channels",
      desc: "Where should meeting summaries go? WhatsApp, Slack, email — or all three.",
      action: "WhatsApp + Email selected"
    },
    {
      icon: <Zap size={32} color={T.amber} />,
      title: "You're all set!",
      desc: "EchoBrief will auto-join your next meeting. Sit back — your meetings are finally useful.",
      action: "Go to Dashboard"
    },
  ];

  const handleComplete = async () => {
    if (user) {
      localStorage.setItem(`onboarding_complete_${user.id}`, 'true');
    }
    navigate('/dashboard');
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: T.orange, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: T.bg }}
    >
      <div className="max-w-md w-full text-center">
        {/* Progress */}
        <div className="flex gap-2 justify-center mb-12">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className="h-1 rounded transition-all duration-300"
              style={{ 
                width: 48, 
                background: i <= step ? T.gradient : T.border,
              }} 
            />
          ))}
        </div>

        {/* Step content */}
        <div className="mb-8">
          <div 
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ 
              background: `rgba(249, 115, 22, 0.08)`,
              border: `1px solid rgba(249, 115, 22, 0.15)` 
            }}
          >
            {steps[step].icon}
          </div>
          
          <h2 
            className="text-2xl font-semibold mb-3 tracking-tight"
            style={{ fontFamily: 'Outfit, sans-serif', color: T.text, letterSpacing: '-0.02em' }}
          >
            {steps[step].title}
          </h2>
          
          <p 
            className="text-base leading-relaxed max-w-sm mx-auto mb-8"
            style={{ color: T.textS }}
          >
            {steps[step].desc}
          </p>
        </div>

        {/* Mock interaction area */}
        {step < 3 && (
          <div 
            className="rounded-2xl p-4 mb-6 text-left"
            style={{ 
              background: T.bgCard,
              border: `1px solid ${T.border}` 
            }}
          >
            <div 
              className="flex items-center gap-2 text-sm font-medium"
              style={{ color: T.green }}
            >
              <CheckCircle2 size={16} /> {steps[step].action}
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleNext}
          className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-base font-semibold transition-opacity hover:opacity-90"
          style={{ 
            background: T.gradient, 
            color: '#fff',
            boxShadow: '0 2px 12px rgba(249, 115, 22, 0.25)',
          }}
        >
          {step < 3 ? "Continue" : "Go to Dashboard"} 
          <ArrowRight size={16} />
        </button>

        {/* Step indicator & skip */}
        <div className="mt-6 flex items-center justify-center gap-4">
          <p style={{ color: T.textM, fontSize: 12 }}>
            Step {step + 1} of {steps.length}
          </p>
          {step < 3 && (
            <button
              onClick={handleSkip}
              className="text-sm transition-colors hover:underline"
              style={{ color: T.textM }}
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
