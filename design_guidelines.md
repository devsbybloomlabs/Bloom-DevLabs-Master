{
  "brand": {
    "name": "Bloom Labs",
    "tagline": "AI-Native Web Apps. Built for Growth.",
    "positioning": "AI-native enterprise web app development agency delivering custom systems in 2–4 weeks at ~40% lower cost than traditional agencies.",
    "audience": [
      "SaaS founders (pre-revenue → $5M ARR)",
      "Business owners replacing WhatsApp/spreadsheets with real systems",
      "Decision-makers in Asia (Philippines/Singapore) evaluating agencies"
    ],
    "conversion_goals": [
      "Book a Discovery Call (TidyCal embed section #book)",
      "Click Get Started on a package (Pricing section #pricing)"
    ],
    "brand_attributes": [
      "premium",
      "fast",
      "transparent",
      "outcome-driven",
      "enterprise-ready",
      "warm-professional (not cold/corporate)"
    ]
  },

  "design_personality": {
    "north_star": "Stripe/Linear-level polish with editorial whitespace + warm trust cues.",
    "layout_principles": [
      "Editorial rhythm: big type + generous whitespace + modular sections",
      "Bento grids for proof + guarantees (clean borders, subtle shadows)",
      "Conversion rails: every section ends with a CTA row pointing to #book or #pricing",
      "Trust layering: badges, guarantees, timelines, and quantified outcomes repeated throughout"
    ],
    "visual_motifs": [
      "Soft ‘bloom’ radial highlight behind hero (very subtle, <=20% viewport)",
      "Hairline borders + faint noise texture on large backgrounds",
      "Pill badges for speed/price guarantees",
      "Timeline connectors (thin lines + dots)"
    ]
  },

  "tokens": {
    "css_variables": {
      "notes": [
        "Set these in /app/frontend/src/index.css under :root (and optionally .dark for future admin).",
        "Use explicit backgrounds (no transparency-only sections).",
        "Keep gradients decorative and limited to hero/top band only (<=20% viewport)."
      ],
      "light": {
        "--background": "0 0% 100%",
        "--foreground": "222 47% 11%",

        "--card": "0 0% 100%",
        "--card-foreground": "222 47% 11%",

        "--popover": "0 0% 100%",
        "--popover-foreground": "222 47% 11%",

        "--primary": "221 83% 33%",
        "--primary-foreground": "0 0% 100%",

        "--secondary": "220 20% 97%",
        "--secondary-foreground": "222 47% 11%",

        "--muted": "220 20% 97%",
        "--muted-foreground": "215 16% 35%",

        "--accent": "214 95% 60%",
        "--accent-foreground": "222 47% 11%",

        "--destructive": "0 84% 60%",
        "--destructive-foreground": "0 0% 100%",

        "--border": "220 16% 90%",
        "--input": "220 16% 90%",
        "--ring": "214 95% 60%",

        "--radius": "14px",

        "--brand-primary": "#1E3A8A",
        "--brand-accent": "#3B82F6",
        "--navy-950": "#0B1220",
        "--navy-900": "#0F1B33",
        "--slate-900": "#0F172A",
        "--slate-700": "#334155",
        "--slate-500": "#64748B",
        "--slate-200": "#E2E8F0",
        "--slate-100": "#F1F5F9",
        "--warm-50": "#FBF8F3",
        "--warm-100": "#F6EFE6",
        "--success": "#16A34A",
        "--warning": "#F59E0B",

        "--shadow-sm": "0 1px 2px rgba(15, 23, 42, 0.06)",
        "--shadow-md": "0 10px 30px rgba(15, 23, 42, 0.10)",
        "--shadow-lg": "0 18px 60px rgba(15, 23, 42, 0.14)",

        "--container": "1120px",
        "--container-wide": "1240px",

        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-10": "40px",
        "--space-12": "48px",
        "--space-16": "64px",
        "--space-20": "80px",
        "--space-24": "96px"
      },
      "admin_future_dark": {
        "notes": [
          "Phase 2 admin dashboard can use .dark class on body/root.",
          "Keep admin surfaces solid (no gradients), high-contrast, table-friendly."
        ],
        "--background": "222 47% 6%",
        "--foreground": "0 0% 98%",
        "--card": "222 47% 8%",
        "--card-foreground": "0 0% 98%",
        "--primary": "214 95% 60%",
        "--primary-foreground": "222 47% 11%",
        "--secondary": "222 47% 12%",
        "--secondary-foreground": "0 0% 98%",
        "--muted": "222 47% 12%",
        "--muted-foreground": "215 20% 70%",
        "--border": "222 47% 16%",
        "--input": "222 47% 16%",
        "--ring": "214 95% 60%"
      }
    },

    "tailwind_usage_notes": {
      "how_to_use": [
        "Prefer shadcn tokens via Tailwind classes: bg-background, text-foreground, border-border, ring-ring, bg-card.",
        "Use brand hex only for special accents (badges, hero glow) via arbitrary values: bg-[#1E3A8A].",
        "Avoid gradients except hero decorative overlay (<=20% viewport)."
      ],
      "example_classes": {
        "page_bg": "bg-background text-foreground",
        "section_alt_bg": "bg-[var(--warm-50)]",
        "hairline_border": "border border-border/70",
        "premium_shadow": "shadow-[var(--shadow-md)]",
        "focus_ring": "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      }
    }
  },

  "typography": {
    "font_pairing": {
      "heading": {
        "family": "Space Grotesk",
        "fallback": "ui-sans-serif, system-ui",
        "usage": "Hero headline, section titles, pricing numbers"
      },
      "body": {
        "family": "Inter",
        "fallback": "ui-sans-serif, system-ui",
        "usage": "Body copy, nav, UI labels"
      }
    },
    "google_fonts_import": {
      "notes": "Add to /app/frontend/public/index.html <head> or via CSS @import in index.css.",
      "href": "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
    },
    "type_scale": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]",
      "h2": "text-base md:text-lg font-medium text-muted-foreground leading-relaxed",
      "section_title": "text-2xl sm:text-3xl font-semibold tracking-tight",
      "section_kicker": "text-xs uppercase tracking-[0.18em] text-muted-foreground",
      "body": "text-sm sm:text-base leading-relaxed text-foreground/90",
      "small": "text-xs text-muted-foreground"
    },
    "copy_rules": [
      "Avoid jargon; lead with outcomes (speed, cost, clarity).",
      "Use short paragraphs (max 2–3 lines on desktop).",
      "Use numeric emphasis with tabular-nums for pricing/results: tabular-nums."
    ]
  },

  "grid_and_layout": {
    "container": {
      "max_width": "max-w-[1120px]",
      "padding": "px-4 sm:px-6 lg:px-8",
      "section_spacing": "py-16 sm:py-20 lg:py-24",
      "section_gap": "gap-8 lg:gap-12"
    },
    "responsive_breakpoints": {
      "mobile_first": true,
      "breakpoints": {
        "sm": "640px",
        "md": "768px",
        "lg": "1024px",
        "xl": "1280px"
      }
    },
    "anchor_scroll": {
      "notes": [
        "Use CSS scroll-margin-top on section wrappers to account for sticky header.",
        "Add smooth scrolling: html { scroll-behavior: smooth; }"
      ],
      "section_anchor_class": "scroll-mt-24"
    }
  },

  "components": {
    "component_path": {
      "shadcn": "/app/frontend/src/components/ui",
      "use_components": [
        "button.jsx",
        "card.jsx",
        "badge.jsx",
        "accordion.jsx",
        "sheet.jsx",
        "navigation-menu.jsx",
        "separator.jsx",
        "tooltip.jsx",
        "sonner.jsx"
      ]
    },

    "buttons": {
      "style": "Luxury / Elegant (slim, tall, rounded 10–12px, subtle elevation)",
      "sizes": {
        "md": "h-11 px-5 text-sm",
        "lg": "h-12 px-6 text-sm sm:text-base"
      },
      "variants": {
        "primary": {
          "use": "Book a Discovery Call, Get Started",
          "classes": "bg-[#1E3A8A] text-white hover:bg-[#1A3278] active:bg-[#162B66] shadow-[var(--shadow-sm)]",
          "focus": "focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        },
        "secondary": {
          "use": "See Pricing, View Case Studies",
          "classes": "bg-secondary text-foreground hover:bg-secondary/70 border border-border",
          "focus": "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        },
        "ghost": {
          "use": "Nav links, subtle actions",
          "classes": "bg-transparent hover:bg-secondary/70"
        }
      },
      "micro_interactions": [
        "Hover: translate-y-[-1px] + shadow-md (only on primary pricing CTAs)",
        "Active: scale-[0.98]",
        "No transition: all. Use transition-colors + transition-shadow only."
      ],
      "data_testid_examples": [
        "data-testid=\"header-book-call-button\"",
        "data-testid=\"hero-primary-cta-button\"",
        "data-testid=\"pricing-plan-growth-get-started-button\""
      ]
    },

    "badges": {
      "use": [
        "POPULAR on middle pricing card",
        "Timeline badges in case studies",
        "Guarantee chips"
      ],
      "classes": {
        "neutral": "bg-secondary text-foreground border border-border",
        "accent": "bg-[#3B82F6]/10 text-[#1E3A8A] border border-[#3B82F6]/20",
        "popular": "bg-[#1E3A8A] text-white"
      }
    },

    "cards": {
      "base": "rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-sm)]",
      "hover": "hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-shadow",
      "pricing_popular": "border-[#3B82F6]/40 shadow-[var(--shadow-md)]",
      "case_study": "p-6 sm:p-7",
      "data_testid_examples": [
        "data-testid=\"pricing-plan-card-starter\"",
        "data-testid=\"case-study-card-1\""
      ]
    },

    "navigation": {
      "sticky_header": {
        "height": "h-16",
        "classes": "sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border",
        "nav_items": [
          "Problem",
          "Solution",
          "Pricing",
          "Case Studies",
          "How We Work",
          "FAQ"
        ],
        "mobile": {
          "pattern": "Use shadcn Sheet for hamburger menu",
          "component": "sheet.jsx",
          "classes": "md:hidden"
        }
      },
      "data_testid_examples": [
        "data-testid=\"header-nav-problem-link\"",
        "data-testid=\"mobile-menu-open-button\"",
        "data-testid=\"mobile-menu-sheet\""
      ]
    },

    "accordion": {
      "faq": {
        "component": "accordion.jsx",
        "interaction": "Chevron rotates 180deg; content expands with height animation (default shadcn).",
        "data_testid_examples": [
          "data-testid=\"faq-accordion\"",
          "data-testid=\"faq-item-what-do-you-build-trigger\""
        ]
      }
    },

    "icons": {
      "library": "lucide-react",
      "notes": "Use consistent stroke width (1.75–2). Keep icons in muted foreground; highlight with accent only for key items.",
      "suggested_icons": {
        "pain_points": ["Clock", "DollarSign", "Wrench", "Shield"],
        "guarantees": ["BadgeCheck", "Timer", "FileCheck"],
        "why_us": ["Sparkles", "Workflow", "LineChart", "Lock", "MessagesSquare", "Layers"]
      }
    }
  },

  "sections": {
    "global_section_rules": [
      "Each section ends with a small CTA row (secondary button + text link) pointing to #book or #pricing.",
      "Use explicit backgrounds: bg-background or bg-[var(--warm-50)] or bg-[var(--navy-950)] for dark bands.",
      "Add scroll-mt-24 to each section wrapper for anchored nav."
    ],

    "header": {
      "layout": "Logo left, nav center (desktop), CTA right. Mobile: logo + CTA + hamburger.",
      "desktop_classes": "hidden md:flex items-center gap-6",
      "cta": "Book a Discovery Call",
      "cta_target": "#book",
      "trust_microcopy": "Optional small text under CTA on desktop: '15-min, no pressure'",
      "data_testid": {
        "header": "header",
        "cta": "header-book-call-button"
      }
    },

    "hero": {
      "id": "top",
      "layout": "Two-column on lg: left copy, right product/agency visual card. On mobile: stacked with CTA first.",
      "background": {
        "solid": "bg-background",
        "decorative_overlay": "Use a subtle radial bloom behind headline: radial-gradient(closest-side, rgba(59,130,246,0.14), rgba(59,130,246,0) 70%). Keep overlay height <= 320px.",
        "noise": "Add a very subtle noise overlay via CSS mask (optional)."
      },
      "content": {
        "kicker": "Bloom Labs",
        "headline": "Enterprise Web Apps in 2-4 Weeks (Not 6 Months)",
        "subheading": "Custom web systems that actually solve your business problems",
        "cta_primary": "Book a Discovery Call",
        "cta_secondary": "See Pricing",
        "trust_row": [
          "2–4 week delivery",
          "Fixed-scope packages",
          "Enterprise-ready security"
        ]
      },
      "right_visual": {
        "pattern": "Device mock card with screenshot placeholder + 3 metric chips",
        "image_url": "https://images.unsplash.com/photo-1548430077-773fa74bda9d?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85",
        "chips": [
          {"label": "Delivery", "value": "14–28 days"},
          {"label": "Cost", "value": "~40% lower"},
          {"label": "Support", "value": "Post-launch"}
        ]
      },
      "example_wrapper_classes": "relative overflow-hidden",
      "example_layout_classes": "grid gap-10 lg:grid-cols-2 items-center",
      "cta_row_classes": "flex flex-col sm:flex-row gap-3",
      "data_testid": {
        "section": "hero-section",
        "primary_cta": "hero-primary-cta-button",
        "secondary_cta": "hero-secondary-cta-button"
      }
    },

    "pain_points": {
      "id": "problem",
      "layout": "4-card grid (2x2 on md, 4x1 on lg).",
      "cards": [
        "6-month timelines that kill momentum",
        "Agency bloat and surprise change orders",
        "Systems that don’t match real workflows",
        "No ownership after launch"
      ],
      "card_style": "Icon + title + 2-line description; keep copy punchy.",
      "example_grid_classes": "grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4",
      "data_testid": {
        "section": "pain-points-section"
      }
    },

    "solution_guarantees": {
      "id": "solution",
      "layout": "Left: narrative + CTA. Right: 3 guarantee cards stacked.",
      "guarantees": [
        {
          "title": "2–4 Week Delivery",
          "detail": "Clear milestones, weekly demos, no black box."
        },
        {
          "title": "Fixed Scope, Fixed Price",
          "detail": "Packages designed for speed and clarity—no surprise invoices."
        },
        {
          "title": "Enterprise-Ready Build",
          "detail": "Auth, roles, audit trails, and secure deployment patterns."
        }
      ],
      "visual_emphasis": "Guarantee cards use accent border + subtle background tint (accent/5–10%).",
      "cta": "See Packages",
      "cta_target": "#pricing",
      "data_testid": {
        "section": "solution-section"
      }
    },

    "pricing": {
      "id": "pricing",
      "layout": "3 pricing cards; middle highlighted as POPULAR. Mobile: stacked with POPULAR second.",
      "plans": [
        {
          "key": "starter",
          "name": "$5,995",
          "label": "MVP Sprint",
          "best_for": "Replace spreadsheets with a real internal tool",
          "cta": "Get Started",
          "badge": null
        },
        {
          "key": "growth",
          "name": "$8,995",
          "label": "Growth System",
          "best_for": "Customer-facing portal + ops automation",
          "cta": "Get Started",
          "badge": "POPULAR"
        },
        {
          "key": "enterprise",
          "name": "$14,995",
          "label": "Enterprise Build",
          "best_for": "Multi-role app with integrations + auditability",
          "cta": "Get Started",
          "badge": null
        }
      ],
      "comparison_pattern": "Inside each card: includes list + excludes list separated by Separator.",
      "hover": "Cards lift slightly on hover (desktop only) and increase shadow; POPULAR has stronger border.",
      "cta_target": "#book (secondary link) + PayPal placeholder (primary button action)",
      "data_testid": {
        "section": "pricing-section",
        "plan_button_pattern": "pricing-plan-{planKey}-get-started-button"
      }
    },

    "case_studies": {
      "id": "case-studies",
      "layout": "2 cards side-by-side on md+, stacked on mobile.",
      "card_contents": [
        "Timeline badge (e.g., 'Shipped in 18 days')",
        "Short quote/testimonial",
        "3 result metrics (e.g., '−60% ops time', '+22% conversion', '0→1 portal')"
      ],
      "image_optional": {
        "use": "Small founder/team photo thumbnail (not huge).",
        "image_url": "https://images.unsplash.com/photo-1618544976420-1f213fcf2052?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85"
      },
      "data_testid": {
        "section": "case-studies-section"
      }
    },

    "how_we_work": {
      "id": "how-we-work",
      "layout": "4-step timeline. Mobile: vertical. Desktop: horizontal with connectors.",
      "steps": [
        {"title": "Discovery", "detail": "Clarify workflows, success metrics, scope."},
        {"title": "Design", "detail": "Wireframes → UI → approval in days, not weeks."},
        {"title": "Build", "detail": "Weekly demos, fast iterations, AI-assisted delivery."},
        {"title": "Launch", "detail": "Deploy, train team, and stabilize."}
      ],
      "visual": "Use dots + thin line (border) connectors; step cards are compact.",
      "data_testid": {
        "section": "how-we-work-section"
      }
    },

    "why_bloom_labs": {
      "id": "why",
      "layout": "6-reason grid (2 columns on md, 3 on lg).",
      "reasons": [
        "Outcome-first scoping",
        "AI-native delivery workflow",
        "Transparent weekly demos",
        "Enterprise patterns by default",
        "Asia-friendly collaboration",
        "Post-launch support options"
      ],
      "data_testid": {
        "section": "why-bloom-labs-section"
      }
    },

    "book_call": {
      "id": "book",
      "layout": "Two-column: left copy + trust bullets, right embedded TidyCal iframe in a Card.",
      "iframe": {
        "src": "https://tidycal.com/bloomdevlabs/discovery-call",
        "height": "720",
        "classes": "w-full rounded-[var(--radius)] border border-border bg-white",
        "note": "Wrap iframe in Card with padding and a subtle shadow; ensure it has a solid white background."
      },
      "intro_copy": {
        "title": "Book a Discovery Call",
        "subtitle": "15 minutes to map your workflow and see if we’re a fit."
      },
      "data_testid": {
        "section": "book-call-section",
        "iframe": "tidycal-embed-iframe"
      }
    },

    "faq": {
      "id": "faq",
      "items": [
        "What kinds of apps do you build?",
        "How do you deliver in 2–4 weeks?",
        "What’s included in the packages?",
        "Do you support integrations (Stripe, HubSpot, etc.)?",
        "What happens after launch?"
      ],
      "layout": "Accordion centered with max width ~760px; add a CTA row below.",
      "data_testid": {
        "section": "faq-section"
      }
    },

    "footer": {
      "layout": "Dark navy band with white logo, contact, and quick links.",
      "background": "bg-[var(--navy-950)] text-white",
      "links": ["Problem", "Solution", "Pricing", "Book"],
      "contact": ["Email", "Phone", "LinkedIn"],
      "data_testid": {
        "section": "footer"
      }
    }
  },

  "motion_and_microinteractions": {
    "principles": [
      "Subtle, professional motion only (no bouncy overshoot).",
      "Use motion to clarify hierarchy: hover lift on cards, underline on links, gentle fade-in on section entry.",
      "Respect prefers-reduced-motion."
    ],
    "recommended_library": {
      "name": "framer-motion",
      "why": "Lightweight entrance animations + scroll reveal; easy to disable for reduced motion.",
      "install": "npm i framer-motion",
      "usage_notes": [
        "Animate only key blocks: hero, pricing cards, case study cards.",
        "Use opacity + y translate (6–10px).",
        "Avoid animating layout-affecting properties heavily."
      ],
      "js_scaffold": "// Example (JS):\n// import { motion, useReducedMotion } from 'framer-motion';\n// const shouldReduce = useReducedMotion();\n// const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };\n// <motion.div initial={shouldReduce ? false : 'hidden'} whileInView={shouldReduce ? undefined : 'show'} viewport={{ once: true, margin: '-80px' }} variants={fadeUp} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} />"
    },
    "hover_states": {
      "links": "hover:underline underline-offset-4 decoration-[#3B82F6]/50",
      "cards": "hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-shadow",
      "buttons": "transition-colors transition-shadow"
    }
  },

  "accessibility": {
    "requirements": [
      "WCAG AA contrast: ensure text on brand blue buttons is pure white.",
      "Visible focus states on all interactive elements (ring + offset).",
      "Use semantic headings (one H1).",
      "TidyCal iframe must have title attribute.",
      "Respect prefers-reduced-motion (disable scroll animations)."
    ],
    "keyboard": [
      "Mobile Sheet menu must trap focus (shadcn Sheet handles this).",
      "Accordion triggers must be reachable and show focus ring."
    ]
  },

  "images": {
    "image_urls": [
      {
        "category": "hero_right_visual",
        "description": "Clean laptop/product mock vibe for hero right-side visual card.",
        "url": "https://images.unsplash.com/photo-1548430077-773fa74bda9d?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85"
      },
      {
        "category": "case_studies_thumbnail",
        "description": "Small team/founder working shot (Asia-friendly). Use as subtle avatar/thumbnail, not a full-bleed hero.",
        "url": "https://images.unsplash.com/photo-1618544976420-1f213fcf2052?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85"
      },
      {
        "category": "trust_section_optional",
        "description": "Meeting/decision-maker vibe for trust band or about snippet (use sparingly).",
        "url": "https://images.unsplash.com/photo-1573497619860-6d82917e4ec8?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85"
      },
      {
        "category": "decorative_background_reference",
        "description": "Abstract light blue/white blur reference for subtle hero overlay (do not use as large gradient; optional).",
        "url": "https://images.unsplash.com/photo-1707130868349-3ed75fc7fe8f?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85"
      }
    ]
  },

  "implementation_notes_for_main_agent": {
    "instructions_to_main_agent": [
      "Remove CRA default App.css centering/black header styles; rely on Tailwind + tokens in index.css.",
      "Update :root tokens in /app/frontend/src/index.css to match Bloom Labs palette (primary #1E3A8A, ring #3B82F6).",
      "Set global fonts: body uses Inter; headings use Space Grotesk via Tailwind className on headings (font-[family]).",
      "Build single-page sections with ids: #problem #solution #pricing #case-studies #how-we-work #faq #book.",
      "Use shadcn Sheet for mobile nav; NavigationMenu or simple anchor list for desktop.",
      "Every interactive element must include data-testid (buttons, links, accordion triggers, iframe, pricing cards).",
      "Do not use heavy WebGL/3D. Keep hero decorative overlay minimal and within gradient restriction rules.",
      "Ensure all section backgrounds are explicit (bg-background, bg-[var(--warm-50)], bg-[var(--navy-950)]).",
      "Add scroll-mt-24 to each section wrapper for anchored navigation with sticky header.",
      "Use Sonner for any toast (e.g., 'Copied email', 'Opening checkout' placeholders)."
    ],
    "suggested_file_structure": {
      "pages": ["/app/frontend/src/pages/Home.js (or App.js single page)"],
      "components": [
        "/app/frontend/src/components/sections/Header.js",
        "/app/frontend/src/components/sections/Hero.js",
        "/app/frontend/src/components/sections/Pricing.js",
        "/app/frontend/src/components/sections/BookCall.js",
        "/app/frontend/src/components/sections/FAQ.js",
        "/app/frontend/src/components/sections/Footer.js"
      ]
    }
  },

  "general_ui_ux_design_guidelines": "<General UI UX Design Guidelines>  \n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
