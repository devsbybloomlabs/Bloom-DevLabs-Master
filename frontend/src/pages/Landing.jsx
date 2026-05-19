import { Header } from "@/components/sections/Header";
import { Hero } from "@/components/sections/Hero";
import { PainPoints } from "@/components/sections/PainPoints";
import { Solution } from "@/components/sections/Solution";
import { WhoWeServe } from "@/components/sections/WhoWeServe";
import { Pricing } from "@/components/sections/Pricing";
import { BloomVsAgencies } from "@/components/sections/BloomVsAgencies";
import { CaseStudies } from "@/components/sections/CaseStudies";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { WhyBloomLabs } from "@/components/sections/WhyBloomLabs";
import { BookCall } from "@/components/sections/BookCall";
import { FAQ } from "@/components/sections/FAQ";
import { Footer } from "@/components/sections/Footer";
import RelatedLinks from "@/components/RelatedLinks";
import SeoHead from "@/components/SeoHead";
import {
  ORGANIZATION_SCHEMA,
  LOCAL_BUSINESS_PH,
  LOCAL_BUSINESS_SG,
  PRODUCT_SCHEMA,
  FAQ_SCHEMA,
  WEBSITE_SCHEMA,
  PAGE_META,
  SITE_URL,
} from "@/lib/seo";

export default function Landing() {
  return (
    <main className="bg-background text-foreground" data-testid="landing-page">
      <SeoHead
        title={PAGE_META.home.title}
        description={PAGE_META.home.description}
        keywords={PAGE_META.home.keywords}
        url={SITE_URL}
        type="website"
        jsonLd={ORGANIZATION_SCHEMA}
        extraJsonLd={[
          WEBSITE_SCHEMA,
          LOCAL_BUSINESS_PH,
          LOCAL_BUSINESS_SG,
          PRODUCT_SCHEMA,
          FAQ_SCHEMA(),
        ]}
      />
      <Header />
      <Hero />
      <PainPoints />
      <Solution />
      <WhoWeServe />
      <Pricing />
      <BloomVsAgencies />
      <CaseStudies />
      <HowWeWork />
      <WhyBloomLabs />
      <BookCall />
      <FAQ />
      <RelatedLinks />
      <Footer />
    </main>
  );
}
