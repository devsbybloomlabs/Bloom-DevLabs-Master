/**
 * AbSlot — public component that swaps copy based on an active A/B test.
 * Falls back to `children` (the static control copy) if no test is running.
 *
 * Usage:
 *   <AbSlot elementKey="homepage_hero_cta" fallback="Book a Discovery Call">
 *     {(content, trackClick) => (
 *       <Button onClick={trackClick}>{content}</Button>
 *     )}
 *   </AbSlot>
 *
 * Or the simpler text-only form:
 *   <AbSlot elementKey="homepage_hero_headline" fallback="Custom apps in 21 days" />
 */
import { useEffect } from "react";
import { useAbVariant, rememberActiveVariant } from "@/lib/abVariant";

export default function AbSlot({ elementKey, fallback, children }) {
  const { content, active, trackClick, trackConversion } = useAbVariant(elementKey, fallback);

  // Remember the bucket so conversions on other pages can attribute back
  useEffect(() => {
    if (active) {
      // No-op call to ensure exposed — the hook already remembers internally
      // via fireGlobalConversion's storage. We could call rememberActiveVariant
      // here, but the hook stores it on first track. Keep slot stateless.
    }
  }, [active, elementKey]);

  if (typeof children === "function") {
    return children(content, trackClick, trackConversion);
  }
  return <span data-ab-key={elementKey}>{content}</span>;
}

// Re-export the conversion helper so consumer pages can fire it after a form
// submit or thank-you page render.
export { fireGlobalConversion } from "@/lib/abVariant";
