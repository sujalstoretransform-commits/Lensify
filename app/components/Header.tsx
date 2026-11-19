
interface HeaderProps {
    hasPhoto: boolean;
    isTryOnEnabled: boolean;
    onTryOnClick: () => void;
    onToggleTryOn: () => void;
}

export default function Header({
    hasPhoto,
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
                        3D Try-On
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onToggleTryOn}
                        aria-pressed={isTryOnEnabled}
                        className={`inline-flex w-[150px] shrink-0 items-center justify-center gap-3 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors duration-200 ${isTryOnEnabled
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
                            Try-On {isTryOnEnabled ? "ON" : "OFF"}
                        </span>
                    </button>
                )}
            </div>
        </header>
    );
}
