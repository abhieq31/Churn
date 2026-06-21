import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col justify-between gap-10 sm:flex-row">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-ink text-paper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-ink">ChurnLens</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink/50">
              See who&apos;s leaving before they&apos;re gone — who, why, and what to do, all in
              your browser. Built on peer-reviewed churn research.
            </p>
          </div>
          <div className="flex gap-16 text-sm">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink/40">Product</p>
              <Link href="/upload" className="block text-ink/60 hover:text-brand-600">
                Analyze churn
              </Link>
              <Link href="/science" className="block text-ink/60 hover:text-brand-600">
                How it works
              </Link>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink/40">Research</p>
              <a
                href="https://ieeexplore.ieee.org/document/10461822"
                target="_blank"
                rel="noreferrer"
                className="block text-ink/60 hover:text-brand-600"
              >
                IEEE paper
              </a>
              <a
                href="https://doi.org/10.1109/R10-HTC57504.2023.10461822"
                target="_blank"
                rel="noreferrer"
                className="block text-ink/60 hover:text-brand-600"
              >
                DOI
              </a>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-line pt-6 text-xs leading-relaxed text-ink/40">
          <p>
            Based on “Predicting Customer Churn in Telecom Industry: A Machine Learning Approach
            for Improving Customer Retention,” A. Patel &amp; A. G. Kumar, 2023 IEEE R10-HTC.
            Customer data is processed locally and never uploaded.
          </p>
        </div>
      </div>
    </footer>
  );
}
