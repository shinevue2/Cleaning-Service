import { DemoNotice } from "./DemoNotice";
import { Features } from "./Features";
import { FinalCta } from "./FinalCta";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { LandingFooter } from "./LandingFooter";
import { OwnerFaq } from "./OwnerFaq";
import { ProductionFlow } from "./ProductionFlow";
import { SafetyDesign } from "./SafetyDesign";
import { TryGuide } from "./TryGuide";

/**
 * The landing page ("/"). Entirely static Server Components — no store access,
 * no time-dependent rendering — so it prerenders cleanly under cacheComponents.
 */
export function LandingPage() {
  return (
    <div className="phrase">
      <Hero />
      <DemoNotice />
      <HowItWorks />
      <TryGuide />
      <Features />
      <SafetyDesign />
      <ProductionFlow />
      <OwnerFaq />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}
