import TryOnCamera from "../components/TryOnCamera";

export default function TryOnPage() {
    const handleCapture = (photo: string) => {
        if (!window.opener) {
            console.error("Original Lensify app window was not found.");
            return;
        }

        window.opener.postMessage(
            {
                type: "LENSIFY_PHOTO_CAPTURED",
                photo,
            },
            window.location.origin
        );
    };

    return (
        <TryOnCamera
            onClose={() => window.close()}
            onCapture={handleCapture}
        />
    );
}