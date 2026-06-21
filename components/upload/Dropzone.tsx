"use client";

import { useCallback, useRef, useState } from "react";
import { parseCsvFile } from "@/lib/csv";
import type { RawRow } from "@/lib/ml/types";
import { cx } from "@/components/ui/primitives";

export function Dropzone({
  onParsed,
}: {
  onParsed: (rows: RawRow[], name: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
        setError("Please choose a .csv file.");
        return;
      }
      setBusy(true);
      try {
        const { rows, errors } = await parseCsvFile(file);
        if (rows.length === 0) {
          setError("That file looks empty — no rows found.");
        } else if (errors.length > 0 && rows.length < 5) {
          setError(`Could not parse the file: ${errors[0]}`);
        } else {
          onParsed(rows, file.name);
        }
      } catch {
        setError("Something went wrong reading that file.");
      } finally {
        setBusy(false);
      }
    },
    [onParsed],
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed px-6 py-20 text-center transition-colors",
          dragging
            ? "border-brand-400 bg-brand-50"
            : "border-line bg-white hover:border-brand-300 hover:bg-paper",
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-paper text-ink">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 16V4m0 0L8 8m4-4l4 4M5 20h14"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="mt-4 text-base font-medium text-ink">
          {busy ? "Reading your file…" : "Drop your customer CSV here"}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          or click to browse · processed locally, never uploaded
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <p className="mt-4 text-center text-sm text-zinc-500">
        Need a file to test with?{" "}
        <span className="text-zinc-400">Head back and click “Try with sample data”.</span>
      </p>
    </div>
  );
}
