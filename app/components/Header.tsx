
interface HeaderProps {
    hasPhoto: boolean;
    isTryOnAvailable: boolean;
    isTryOnEnabled: boolean;
    onTryOnClick: () => void;
    onToggleTryOn: () => void;
}

export default function Header({
    hasPhoto,
    isTryOnAvailable,
    isTryOnEnabled,
    onTryOnClick,
    onToggleTryOn,
}: HeaderProps) {
    return (
        <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white px-5 py-3 md:px-6">
            <div className="flex w-full items-center justify-between">

                <div className="flex items-center gap-3">
                    <svg
                        viewBox="0 0 40 40"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-9 w-9 text-teal-700"
                    >
                        <path
                            d="M3 15.5H8L10 12.5H17L19 15.5H21L23 12.5H30L32 15.5H37V25H24L21 22H19L16 25H3V15.5Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <circle cx="11" cy="19" r="3.5" stroke="currentColor" strokeWidth="2" />
                        <circle cx="29" cy="19" r="3.5" stroke="currentColor" strokeWidth="2" />
                    </svg>

                    <span className="text-[23px] font-bold tracking-tight text-slate-800">
                        Lensify
                    </span>
                </div>

                {!hasPhoto ? (
                    <button
                        type="button"
                        onClick={onTryOnClick}
                        className="inline-flex items-center gap-2.5 rounded-full bg-teal-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-teal-800 hover:shadow-md active:scale-[0.98]"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            className="h-5 w-5"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
                            />
                            <circle cx="12" cy="13" r="3.5" />
                        </svg>
                        Try-On Glasses
                    </button>
                ) : (
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onToggleTryOn}
                            disabled={!isTryOnAvailable}
                            aria-pressed={isTryOnEnabled}
                            className={`inline-flex w-[170px] shrink-0 items-center justify-center gap-3 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors duration-200 disabled:cursor-wait disabled:opacity-60 ${isTryOnEnabled
                                ? "border-teal-700 bg-teal-700 text-white shadow-sm hover:bg-teal-800"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                        >
                            <span
                                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${isTryOnEnabled ? "bg-teal-500" : "bg-slate-300"
                                    }`}
                            >
                                <span
                                    className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${isTryOnEnabled ? "translate-x-4" : "translate-x-0"
                                        }`}
                                />
                            </span>

                            <span className="whitespace-nowrap">
                                {!isTryOnAvailable
                                    ? "Preparing..."
                                    : `Try-On ${isTryOnEnabled ? "ON" : "OFF"}`}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={onTryOnClick}
                            className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-100 active:bg-teal-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                        >
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                            >
                                <path d="M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 11.5-2L20 9M4 15l2.5 3A7 7 0 0 0 18 16" />
                            </svg>
                            Re-Upload
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
