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
import SeoHead from "@/components/SeoHead";

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Bloom Labs",
  url: "https://bybloomlabs.com",
  logo: "https://bybloomlabs.com/og-default.png",
  description:
    "Bloom Labs ships enterprise-grade custom web apps in 2–4 weeks at ~40% lower cost than traditional agencies.",
  sameAs: [
    "https://www.linkedin.com/company/bloom-labs",
    "https://twitter.com/bloomlabs",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "Sales",
    email: "hello@bybloomlabs.com",
    areaServed: "Global",
    availableLanguage: ["English"],
  },
};

export default function Landing() {
  return (
    <main className="bg-background text-foreground" data-testid="landing-page">
      <SeoHead
        title="Bloom Labs — Enterprise-grade web apps in 2–4 weeks"
        description="Bloom Labs is an AI-native dev agency. We design, build, and ship custom web apps in 2–4 weeks at ~40% lower cost than traditional agencies. Fixed scope. Fixed price. No surprises."
        keywords="custom web app development, AI-native agency, fast SaaS development, agency alternative, bloom labs"
        url="https://bybloomlabs.com"
        type="website"
        jsonLd={ORG_JSONLD}
      />
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
