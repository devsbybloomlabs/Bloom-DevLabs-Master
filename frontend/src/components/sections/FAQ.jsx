import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { HOMEPAGE_FAQS } from "@/lib/seo";

const FAQS = HOMEPAGE_FAQS;

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
