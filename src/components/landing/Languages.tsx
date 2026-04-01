const PRIMARY_LANGUAGES = [
  'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Malayalam', 'English (Indian)',
];

const OTHER_LANGUAGES = [
  'Gujarati', 'Punjabi', 'Odia', 'Assamese', 'Maithili', 'Sanskrit', 'Urdu',
  'Konkani', 'Dogri', 'Sindhi', 'Manipuri', 'Bodo', 'Santali', 'Kashmiri',
];

export function Languages() {
  return (
    <section id="languages" className="py-20">
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-orange-400 mb-3 text-center">Languages</div>
        <h2 className="font-['Outfit'] text-[36px] font-semibold tracking-[-0.03em] text-center text-stone-50 mb-2">
          Speaks your language
        </h2>
        <p className="text-[16px] text-stone-400 text-center max-w-[520px] mx-auto mb-12 font-['DM_Sans']">
          Powered by Sarvam Saaras v3 — the highest accuracy STT for Indian languages, with native code-mixing support.
        </p>

        <div className="flex flex-wrap justify-center gap-2.5 max-w-[700px] mx-auto">
          {PRIMARY_LANGUAGES.map((lang) => (
            <span
              key={lang}
              className="px-[18px] py-2 rounded-full border border-orange-500 bg-[rgba(249,115,22,0.08)] text-[13px] font-medium text-orange-400 transition-all hover:bg-[rgba(249,115,22,0.12)] cursor-default"
            >
              {lang}
            </span>
          ))}
          {OTHER_LANGUAGES.map((lang) => (
            <span
              key={lang}
              className="px-[18px] py-2 rounded-full border border-stone-800 bg-stone-900 text-[13px] font-medium text-stone-400 transition-all hover:border-orange-500 hover:text-stone-50 hover:bg-[rgba(249,115,22,0.06)] cursor-default"
            >
              {lang}
            </span>
          ))}
        </div>

        <p className="text-center text-[13px] text-stone-500 mt-5 font-['DM_Sans']">
          + Hinglish, Tanglish, and all code-mixed variants handled natively
        </p>
      </div>
    </section>
  );
}
