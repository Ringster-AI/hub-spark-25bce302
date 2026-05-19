
import React from "react";
import { Seo } from "@/components/seo/Seo";
import AboutNav from "./components/AboutNav";
import AboutHero from "./components/AboutHero";
import Intro from "./components/Intro";
import WhatWeDo from "./components/WhatWeDo";
import Mission from "./components/Mission";
import Values from "./components/Values";
import Team from "./components/Team";
import CallToAction from "./components/CallToAction";
import Footer from "./components/Footer";

const About = () => {
  return (
    <div className="min-h-screen bg-[#F1F0FB] overflow-x-hidden">
      <AboutNav />
      <AboutHero />

      {/* Main Content */}
      <section className="py-10 sm:py-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <Intro />
          <WhatWeDo />
          <Mission />
          <Values />
          <Team />
        </div>
      </section>

      <CallToAction />
      <Footer />
    </div>
  );
};

export default About;
