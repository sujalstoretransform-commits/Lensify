const extractedImages = new Map();

/** @param {string} imageUrl @returns {Promise<Blob>} */
export const extractGlasses = (imageUrl) => {
    const cachedImage = extractedImages.get(imageUrl);
    if (cachedImage) return cachedImage;

    const extraction = (async () => {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error("Could not load product image");

        const bitmap = await createImageBitmap(await response.blob());
        const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);
        const source = document.createElement("canvas");
        source.width = width;
        source.height = height;

        const context = source.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Could not prepare product image");

        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const pixels = context.getImageData(0, 0, width, height);
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;

        for (let index = 0; index < pixels.data.length; index += 4) {
            const red = pixels.data[index];
            const green = pixels.data[index + 1];
            const blue = pixels.data[index + 2];
            const brightness = (red + green + blue) / 3;
            const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);

            // Clear pale neutral backgrounds and lens glare so the wearer's eyes
            // remain visible through clear lenses.
            if (colorSpread < 36 && brightness > 215) {
                pixels.data[index + 3] *= Math.max(0, Math.min(1, (235 - brightness) / 20));
            }

            if (pixels.data[index + 3] > 24) {
                const pixel = index / 4;
                const x = pixel % width;
                const y = Math.floor(pixel / width);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }

        if (maxX < minX || maxY < minY) {
            throw new Error("No glasses found in product image");
        }

        context.putImageData(pixels, 0, 0);

        const padding = Math.round(Math.max(maxX - minX, maxY - minY) * 0.025);
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(width - 1, maxX + padding);
        maxY = Math.min(height - 1, maxY + padding);

        const crop = document.createElement("canvas");
        crop.width = maxX - minX + 1;
        crop.height = maxY - minY + 1;
        const cropContext = crop.getContext("2d");
        if (!cropContext) throw new Error("Could not crop product image");

        cropContext.drawImage(
            source,
            minX,
            minY,
            crop.width,
            crop.height,
            0,
            0,
            crop.width,
            crop.height
        );

        const lensPixels = cropContext.getImageData(0, 0, crop.width, crop.height);
        const lensCenters = [0.25, 0.75];
        const radiusX = crop.width * 0.12;
        const radiusY = crop.height * 0.2;
        for (let index = 0; index < lensPixels.data.length; index += 4) {
            const pixel = index / 4;
            const x = pixel % crop.width;
            const y = Math.floor(pixel / crop.width);

            const insideLens = lensCenters.some((centerX) => {
                const dx = (x - crop.width * centerX) / radiusX;
                const dy = (y - crop.height * 0.5) / radiusY;
                return dx * dx + dy * dy < 1;
            });

            // Folded temple tips can show through the upper outer lens corners.
            // Keep the fade inset from the top and outer edges of the rim.
            const outerX = Math.min(x, crop.width - 1 - x) / crop.width;
            const tipX = (outerX - 0.13) / 0.065;
            const tipY = (y / crop.height - 0.28) / 0.12;
            const tipDistance = tipX * tipX + tipY * tipY;

            if (insideLens) {
                lensPixels.data[index + 3] *= 0.02;
            } else if (tipDistance < 1) {
                lensPixels.data[index + 3] *= Math.max(0.02, (tipDistance - 0.65) / 0.35);
            }
        }

        cropContext.putImageData(lensPixels, 0, 0);

        return new Promise((resolve, reject) => {
            crop.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Could not export product image"));
            }, "image/png");
        });
    })();

    extractedImages.set(imageUrl, extraction);
    void extraction.catch(() => extractedImages.delete(imageUrl));
    return extraction;
};
