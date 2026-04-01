import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Languages } from '@/components/landing/Languages';
import { CTA } from '@/components/landing/CTA';
import { Footer } from '@/components/landing/Footer';

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0C0A09]">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Languages />
      <CTA />
      <Footer />
    </div>
  );
}
