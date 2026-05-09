import { Header } from "@/components/sections/Header";
import { Hero } from "@/components/sections/Hero";
import { PainPoints } from "@/components/sections/PainPoints";
import { Solution } from "@/components/sections/Solution";
import { Pricing } from "@/components/sections/Pricing";
import { CaseStudies } from "@/components/sections/CaseStudies";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { WhyBloomLabs } from "@/components/sections/WhyBloomLabs";
import { BookCall } from "@/components/sections/BookCall";
import { FAQ } from "@/components/sections/FAQ";
import { Footer } from "@/components/sections/Footer";

export default function Landing() {
  return (
    <main className="bg-background text-foreground" data-testid="landing-page">
      <Header />
      <Hero />
      <PainPoints />
      <Solution />
      <Pricing />
      <CaseStudies />
      <HowWeWork />
      <WhyBloomLabs />
      <BookCall />
      <FAQ />
      <Footer />
    </main>
  );
}
