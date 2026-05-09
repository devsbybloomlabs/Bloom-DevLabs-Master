import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

const FAQS = [
  {
    id: "ai-native",
    q: "How is AI-native development different?",
    a: "Traditional agencies write everything from scratch — boilerplate, scaffolding, tests, docs. AI-native means we use modern AI tooling at every layer of the build, so we ship the same enterprise-grade quality in a fraction of the time. You get a real, well-architected web app — not a 'no-code' prototype with limits.",
  },
  {
    id: "not-technical",
    q: "What if I'm not technical?",
    a: "Most of our clients aren't. We translate your business workflow into a real system, walk you through weekly demos in plain language, and give you a simple admin panel your team can actually use without training. Our discovery call is non-technical — we ask about your business, not your stack.",
  },
  {
    id: "changes-after-launch",
    q: "What if I need changes after launch?",
    a: "Every package includes a post-launch support window (7–30 days depending on tier) for bug fixes and small tweaks. After that, we offer monthly retainer plans for ongoing iteration, or you can hire us for new feature builds at a transparent hourly/sprint rate. You own all the code — no lock-in.",
  },
  {
    id: "ongoing-support",
    q: "Do you do ongoing support?",
    a: "Yes. We offer monthly retainer plans for clients who want continuous improvements: new features, integrations, security updates, performance optimization. Retainers start at $1,500/month for ~10 hours of senior dev time. You can pause or cancel anytime.",
  },
  {
    id: "timeline",
    q: "What's the typical timeline?",
    a: "Express Launch ships in 10–14 days. Custom Build in 20–28 days. Enterprise in 28–35 days. We finalize the exact timeline in your discovery call and lock it in writing in the proposal. Weekly demos + a written status update every Friday — no black box.",
  },
];

export const FAQ = () => {
  return (
    <section
      id="faq"
      data-testid="faq-section"
      className="scroll-mt-24"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            FAQ
          </div>
          <h2 className="font-display mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
            Common questions, answered.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Still curious? Book a discovery call &mdash; the easiest way to
            get specifics about your project.
          </p>
        </div>

        <div className="mt-10 mx-auto max-w-[760px]">
          <Accordion
            type="single"
            collapsible
            data-testid="faq-accordion"
            className="rounded-[var(--radius)] border border-border bg-card overflow-hidden"
          >
            {FAQS.map((f) => (
              <AccordionItem
                key={f.id}
                value={f.id}
                className="border-b border-border last:border-b-0 px-5 sm:px-6"
              >
                <AccordionTrigger
                  data-testid={`faq-item-${f.id}-trigger`}
                  className="text-left font-display text-base sm:text-lg font-medium hover:no-underline py-5"
                >
                  {f.q}
                </AccordionTrigger>
                <AccordionContent
                  data-testid={`faq-item-${f.id}-content`}
                  className="text-sm text-muted-foreground leading-relaxed pb-5 pr-2"
                >
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-8 text-center">
            <Button
              asChild
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11 px-5"
              data-testid="faq-book-call-button"
            >
              <a href="#book">
                <Calendar className="h-4 w-4 mr-2" />
                Book a Discovery Call
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
