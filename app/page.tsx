import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Clean Product Landing Page for Eclipse
 * Follows the charcoal/coral design system with headline, subline, single CTA,
 * and a static mock preview of poster nodes connected by lines.
 */
export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-between px-4 sm:px-6 lg:px-8 py-12 lg:py-16 max-w-6xl mx-auto w-full">
      {/* Hero Header Section */}
      <div className="text-center max-w-3xl mx-auto space-y-6 pt-4 sm:pt-8">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#F2F2F3] leading-[1.15]">
          Your movie taste, mapped.
        </h1>

        <p className="text-base sm:text-lg text-[#8B8B95] max-w-2xl mx-auto leading-relaxed">
          See how the films you love naturally connect across shared directors,
          lead actors, genres, and eras in an interactive map.
        </p>

        <div className="pt-2">
          <Link
            href="/graph"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-all shadow-card hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <span>Start your map</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Static Mock Preview of Poster Nodes Connected by Lines */}
      <div className="mt-12 sm:mt-16 w-full max-w-4xl mx-auto bg-[#17171C] border border-[#26262D] rounded-2xl p-6 sm:p-10 shadow-card relative overflow-hidden">
        {/* Subtle background grid pattern */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(#26262D 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center justify-between pb-6 border-b border-[#26262D] mb-8 text-xs text-[#8B8B95]">
            <span className="font-medium text-[#F2F2F3]">Interactive Connection Preview</span>
            <span>4 movies • 3 genres • 1 bridge</span>
          </div>

          {/* Connected Graph Mock Layout */}
          <div className="relative min-h-[300px] sm:min-h-[360px] flex items-center justify-center">
            {/* SVG Connection Lines */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none stroke-[#26262D]"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Line: Inception (Root) to Interstellar */}
              <line
                x1="22%"
                y1="50%"
                x2="50%"
                y2="28%"
                strokeWidth="2"
                stroke="#FF5A4F"
                strokeOpacity="0.8"
              />
              {/* Line: Inception to Dark Knight */}
              <line
                x1="22%"
                y1="50%"
                x2="50%"
                y2="72%"
                strokeWidth="2"
                stroke="#26262D"
              />
              {/* Line: Interstellar to Arrival (Bridge) */}
              <line
                x1="50%"
                y1="28%"
                x2="78%"
                y2="50%"
                strokeWidth="2"
                strokeDasharray="4 4"
                stroke="#FF5A4F"
                strokeOpacity="0.7"
              />
            </svg>

            {/* Connection Labels */}
            <div className="hidden sm:block absolute top-[36%] left-[32%] -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-[#0F0F12] border border-[#26262D] text-[10px] text-[#8B8B95]">
              Directed by Nolan
            </div>
            <div className="hidden sm:block absolute top-[62%] left-[33%] -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-[#0F0F12] border border-[#26262D] text-[10px] text-[#8B8B95]">
              Shared Director
            </div>
            <div className="hidden sm:block absolute top-[36%] left-[67%] -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-[#0F0F12] border border-[#FF5A4F]/40 text-[10px] text-[#FF5A4F]">
              Both Sci-Fi
            </div>

            {/* Poster Node 1: Inception (Root) */}
            <div className="absolute left-[12%] sm:left-[14%] top-1/2 -translate-y-1/2 flex flex-col items-center group">
              <div className="w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden border-2 border-[#FF5A4F] shadow-card bg-[#0F0F12] transition-transform hover:scale-105">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://image.tmdb.org/t/p/w185/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg"
                  alt="Inception"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="mt-2 text-xs font-semibold text-[#F2F2F3]">Inception</span>
              <span className="text-[10px] text-[#FF5A4F] uppercase tracking-wider font-medium">Root</span>
            </div>

            {/* Poster Node 2: Interstellar */}
            <div className="absolute left-1/2 -translate-x-1/2 top-[12%] sm:top-[10%] flex flex-col items-center group">
              <div className="w-18 sm:w-22 aspect-[2/3] rounded-xl overflow-hidden border border-[#26262D] shadow-card bg-[#0F0F12] transition-transform hover:scale-105">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://image.tmdb.org/t/p/w185/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg"
                  alt="Interstellar"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="mt-2 text-xs font-medium text-[#F2F2F3]">Interstellar</span>
              <span className="text-[10px] text-[#8B8B95]">2014</span>
            </div>

            {/* Poster Node 3: The Dark Knight */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[12%] sm:bottom-[10%] flex flex-col items-center group">
              <div className="w-18 sm:w-22 aspect-[2/3] rounded-xl overflow-hidden border border-[#26262D] shadow-card bg-[#0F0F12] transition-transform hover:scale-105">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://image.tmdb.org/t/p/w185/qJ2tW6WMUDux911r6m7haRef0WH.jpg"
                  alt="The Dark Knight"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="mt-2 text-xs font-medium text-[#F2F2F3]">The Dark Knight</span>
              <span className="text-[10px] text-[#8B8B95]">2008</span>
            </div>

            {/* Poster Node 4: Arrival (Recommended R) */}
            <div className="absolute right-[12%] sm:right-[14%] top-1/2 -translate-y-1/2 flex flex-col items-center group">
              <div className="w-18 sm:w-22 aspect-[2/3] rounded-xl overflow-hidden border-2 border-dashed border-[#FF5A4F] shadow-card bg-[#0F0F12] transition-transform hover:scale-105 relative">
                <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-[#FF5A4F] text-[#0F0F12] text-[9px] font-bold">
                  R
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://image.tmdb.org/t/p/w185/pEzNVQfdzYDzVK0XqxERIw2x2se.jpg"
                  alt="Arrival"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="mt-2 text-xs font-medium text-[#F2F2F3]">Arrival</span>
              <span className="text-[10px] text-[#FF5A4F]">AI Pick</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <footer className="text-center pt-8 text-xs text-[#8B8B95]">
        Powered by TMDB & Gemini AI • Eclipse
      </footer>
    </div>
  );
}
