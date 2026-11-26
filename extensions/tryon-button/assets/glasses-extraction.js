/** @type {Map<string, Promise<Blob>>} */
const extractedImages = new Map();

/** @param {ImageData} pixels */
function getVisibleBounds({ data, width, height }) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let pixel = 0; pixel < width * height; pixel++) {
        if (data[pixel * 4 + 3] <= 24) continue;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
}

/** @param {ImageData} pixels */
function clearBackground({ data, width, height }) {
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(visited.length);
    let tail = 0;

    // Start on white or light gray studio backdrops at the image boundary.
    // Follow gradual shadows while preserving sharp changes around the frame.
    function enqueue(pixel, previousLevel) {
        if (visited[pixel]) return;
        const index = pixel * 4;
        const lightest = Math.max(data[index], data[index + 1], data[index + 2]);
        const darkest = Math.min(data[index], data[index + 1], data[index + 2]);
        const paleNeutral = darkest >= 232 && lightest - darkest <= 10;
        const backdrop = lightest - darkest <= 18 && (previousLevel === undefined
            ? darkest >= 215
            : darkest >= 115 && previousLevel - darkest <= 9);
        if (data[index + 3] > 24 && !paleNeutral && !backdrop) return;
        visited[pixel] = 1;
        data[index + 3] = 0;
        queue[tail++] = pixel;
    }

    for (let x = 0; x < width; x++) {
        enqueue(x);
        enqueue((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
        enqueue(y * width);
        enqueue(y * width + width - 1);
    }
    for (let head = 0; head < tail; head++) {
        const pixel = queue[head];
        const x = pixel % width;
        const index = pixel * 4;
        const darkest = Math.min(data[index], data[index + 1], data[index + 2]);
        const lightest = Math.max(data[index], data[index + 1], data[index + 2]);
        const level = darkest >= 115 && lightest - darkest <= 18 ? darkest : 255;
        if (x > 0) enqueue(pixel - 1, level);
        if (x < width - 1) enqueue(pixel + 1, level);
        if (pixel >= width) enqueue(pixel - width, level);
        if (pixel < width * (height - 1)) enqueue(pixel + width, level);
    }
}

/**
 * Reject residual rectangular backdrops before they can cover the face.
 * @param {ImageData} pixels
 * @param {ReturnType<typeof getVisibleBounds>} bounds
 */
function hasRectangularBackdrop({ data, width }, { minX, minY, maxX, maxY }) {
    let top = 0;
    let bottom = 0;
    let left = 0;
    let right = 0;
    for (let x = minX; x <= maxX; x++) {
        if (data[(minY * width + x) * 4 + 3] > 128) top++;
        if (data[(maxY * width + x) * 4 + 3] > 128) bottom++;
    }
    for (let y = minY; y <= maxY; y++) {
        if (data[(y * width + minX) * 4 + 3] > 128) left++;
        if (data[(y * width + maxX) * 4 + 3] > 128) right++;
    }
    return Math.min(top, bottom) >= (maxX - minX + 1) * 0.9
        && Math.min(left, right) >= (maxY - minY + 1) * 0.9;
}

/**
 * Remove a pale reflection beneath the aligned lower rims of a dark frame.
 * @param {ImageData} pixels
 * @param {ReturnType<typeof getVisibleBounds>} bounds
 */
function trimFloorReflection({ data, width }, { minX, minY, maxX, maxY }) {
    const frameWidth = maxX - minX + 1;
    if (frameWidth < 40) return;
    const rimRows = [0.17, 0.64].map((start) => {
        const left = minX + Math.round(frameWidth * start);
        const right = Math.min(maxX, left + Math.round(frameWidth * 0.19));
        for (let y = maxY; y >= minY; y--) {
            let dark = 0;
            for (let x = left; x <= right; x++) {
                const index = (y * width + x) * 4;
                if (data[index + 3] > 128 && Math.max(data[index], data[index + 1], data[index + 2]) <= 92) dark++;
            }
            if (dark >= frameWidth * 0.035) return y;
        }
        return minY;
    });
    const rimBottom = Math.max(...rimRows);
    const cutoff = rimBottom + Math.max(2, Math.ceil(frameWidth * 0.008));
    if (Math.abs(rimRows[0] - rimRows[1]) > frameWidth * 0.025
        || rimBottom - minY < frameWidth * 0.2
        || maxY - cutoff < frameWidth * 0.045) return;

    // Keep the source intact if the lower area contains strong or colored detail.
    for (let y = cutoff + 1; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const index = (y * width + x) * 4;
            if (data[index + 3] <= 24) continue;
            const low = Math.min(data[index], data[index + 1], data[index + 2]);
            const high = Math.max(data[index], data[index + 1], data[index + 2]);
            if (low < 115 || high - low > 28) return;
        }
    }
    for (let y = cutoff + 1; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) data[(y * width + x) * 4 + 3] = 0;
    }
}

/**
 * Folded temples can form dark bands across both lens interiors.
 * Compare each band against the brighter tint in that same lens.
 * @param {ImageData} pixels
 * @param {ReturnType<typeof getVisibleBounds>} bounds
 */
function hasFoldedTemples({ data, width }, { minX, minY, maxX, maxY }) {
    const frameWidth = maxX - minX;
    const frameHeight = Math.min(maxY - minY, frameWidth * 0.45);
    if (frameWidth < 40 || frameHeight < 20) return false;

    return [0.17, 0.61].every((start) => {
        const columns = Array.from({ length: 12 }, (_, column) => {
            const x = minX + Math.round(frameWidth * (start + column * 0.02));
            return Array.from({ length: 16 }, (_, row) => {
                const y = minY + Math.round(frameHeight * (0.25 + row * 0.025));
                const index = (y * width + x) * 4;
                if (data[index + 3] <= 128) return 255;
                return Math.max(data[index], data[index + 1], data[index + 2]);
            });
        });
        const levels = columns.flat().sort((a, b) => a - b);
        const tint = levels[Math.floor(levels.length * 0.75)];
        if (tint < 135) return false;
        const dark = Math.min(110, tint - 65);
        return columns.filter((column) => column.filter((level) => level <= dark).length >= 3).length >= 8;
    });
}

/**
 * Blend visible temples toward the adjacent lens tint, inside the rim.
 * @param {ImageData} pixels
 * @param {ReturnType<typeof getVisibleBounds>} bounds
 * @param {boolean} crossed
 */
function softenTemples({ data, width }, { minX, minY, maxX, maxY }, crossed) {
    const frameWidth = maxX - minX;
    const frameHeight = Math.min(maxY - minY, frameWidth * 0.45);
    if (frameWidth < 40 || frameHeight < 20) return;

    const source = new Uint8ClampedArray(data);
    for (const direction of [1, -1]) {
        const edge = direction === 1 ? minX : maxX;
        const pixelIndex = (x, y) => (y * width + edge + direction * Math.round(frameWidth * x)) * 4;
        const top = minY + Math.ceil(frameHeight * 0.16);
        const bottom = minY + Math.floor(frameHeight * (crossed ? 0.78 : 0.53));
        const outer = Math.ceil(frameWidth * 0.085);
        const inner = Math.floor(frameWidth * (crossed ? 0.41 : 0.21));
        const sampleRadius = Math.ceil(frameHeight * 0.23);
        for (let y = top; y <= bottom; y++) {
            for (let offset = outer; offset <= inner; offset++) {
                const index = (y * width + edge + direction * offset) * 4;
                if (source[index + 3] <= 128) continue;
                const level = Math.max(source[index], source[index + 1], source[index + 2]);
                if (level > 135) continue;
                let reference = pixelIndex(0.26, y);
                if (crossed) {
                    reference = -1;
                    for (let distance = 1; distance <= sampleRadius && reference < 0; distance++) {
                        for (const row of [y - distance, y + distance]) {
                            if (row < top || row > bottom) continue;
                            const sample = index + (row - y) * width * 4;
                            const brightness = Math.max(source[sample], source[sample + 1], source[sample + 2]);
                            if (source[sample + 3] > 128 && brightness >= Math.max(145, level + 55)) {
                                reference = sample;
                                break;
                            }
                        }
                    }
                }
                if (reference < 0 || source[reference + 3] <= 128) continue;
                const brightness = Math.max(source[reference], source[reference + 1], source[reference + 2]);
                if (brightness < 145) continue;
                const contrast = brightness - level;
                if (contrast < 45) continue;
                const feather = Math.min(1, (offset - outer) / 2, (inner - offset) / 2, (y - top) / 2, (bottom - y) / 2);
                const blend = feather * Math.min(1, (contrast - 45) / 25);
                for (let channel = 0; channel < 3; channel++) {
                    data[index + channel] += (source[reference + channel] - data[index + channel]) * blend;
                }
            }
        }
    }
}

/** @param {ImageData} pixels @param {number} minX @param {number} maxX */
function clearLensOpenings({ data, width, height }, minX, maxX) {
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(visited.length);
    const frameWidth = maxX - minX + 1;
    const center = (minX + maxX) / 2;
    const openings = [null, null];
    let tail = 0;

    /** @param {number} pixel */
    function enqueue(pixel) {
        if (visited[pixel]) return;
        visited[pixel] = 1;
        const index = pixel * 4;
        const low = Math.min(data[index], data[index + 1], data[index + 2]);
        const high = Math.max(data[index], data[index + 1], data[index + 2]);
        if (data[index + 3] <= 24 || low < 242 || high - low > 10) return;
        queue[tail++] = pixel;
    }

    for (let start = 0; start < visited.length; start++) {
        tail = 0;
        enqueue(start);
        let left = width;
        let right = -1;
        let top = height;
        let bottom = -1;
        for (let head = 0; head < tail; head++) {
            const pixel = queue[head];
            const x = pixel % width;
            const y = Math.floor(pixel / width);
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            if (x > 0) enqueue(pixel - 1);
            if (x < width - 1) enqueue(pixel + 1);
            if (y > 0) enqueue(pixel - width);
            if (y < height - 1) enqueue(pixel + width);
        }

        if (right - left < frameWidth * 0.16 || bottom - top < frameWidth * 0.09) continue;
        const side = right < center ? 0 : left > center ? 1 : -1;
        if (side < 0 || tail <= (openings[side]?.area ?? 0)) continue;
        openings[side] = { left, right, top, bottom, area: tail, pixels: queue.slice(0, tail) };
    }

    const [left, right] = openings;
    if (!left || !right) return null;
    const lensHeight = Math.min(left.bottom - left.top, right.bottom - right.top);
    if (Math.abs(left.top - right.top) > lensHeight * 0.35 ||
        Math.abs(left.bottom - right.bottom) > lensHeight * 0.35) return null;

    const rimMargin = Math.max(2, Math.ceil(lensHeight * 0.22));
    const upperRim = Math.min(left.top, right.top) - rimMargin;
    for (const opening of [left, right]) {
        const rowStart = new Int32Array(opening.bottom - opening.top + 1).fill(width);
        const rowEnd = new Int32Array(rowStart.length).fill(-1);
        const columnStart = new Int32Array(opening.right - opening.left + 1).fill(height);
        const columnEnd = new Int32Array(columnStart.length).fill(-1);
        for (const pixel of opening.pixels) {
            const x = pixel % width;
            const y = Math.floor(pixel / width);
            const row = y - opening.top;
            const column = x - opening.left;
            rowStart[row] = Math.min(rowStart[row], x);
            rowEnd[row] = Math.max(rowEnd[row], x);
            columnStart[column] = Math.min(columnStart[column], y);
            columnEnd[column] = Math.max(columnEnd[column], y);
        }

        // Bridge gaps inside the opening where a folded arm overlaps the lens.
        for (let row = 0; row < rowStart.length; row++) {
            for (let x = rowStart[row]; x <= rowEnd[row]; x++) {
                data[((opening.top + row) * width + x) * 4 + 3] = 0;
            }
        }
        for (let column = 0; column < columnStart.length; column++) {
            for (let y = columnStart[column]; y <= columnEnd[column]; y++) {
                data[(y * width + opening.left + column) * 4 + 3] = 0;
            }
        }
    }

    // Leave room for the browline and hinges. Pixels farther above that
    // boundary are the temple arms visible behind the front of the frame.
    for (let y = 0; y < upperRim; y++) {
        for (let x = minX; x <= maxX; x++) data[(y * width + x) * 4 + 3] = 0;
    }
    const leftWidth = left.right - left.left;
    const rightWidth = right.right - right.left;
    return Math.min(leftWidth, rightWidth) >= Math.max(leftWidth, rightWidth) * 0.85
        && Math.abs(left.top - right.top) <= lensHeight * 0.15
        && Math.abs(left.bottom - right.bottom) <= lensHeight * 0.15
        && Math.abs((left.left - minX) - (maxX - right.right)) <= frameWidth * 0.08;
}

/** @param {ImageData} pixels */
function hasSymmetricFrame({ data, width, height }, transparentBackdrop) {
    /** @param {number} x @param {number} y */
    function isFrame(x, y) {
        const index = (y * width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        // Bright mirror lenses can still define the frame's silhouette.
        return data[index + 3] > 128
            && (transparentBackdrop || (red + green + blue) / 3 < 165
                || Math.max(red, green, blue) - Math.min(red, green, blue) >= 45);
    }

    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!isFrame(x, y)) continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    }

    const frameWidth = right - left + 1;
    const frameHeight = bottom - top + 1;
    if (frameWidth < 24 || frameHeight < 10 || frameWidth / frameHeight < 1.9) return false;
    const center = Math.round((left + right) / 2);
    // A front view has an open nose gap below the bridge.
    if (isFrame(center, top + Math.round(frameHeight * 0.75))) return false;

    let matching = 0;
    let occupied = 0;
    for (let row = 0; row < 32; row++) {
        const y = top + Math.round((row + 0.5) * frameHeight / 32 - 0.5);
        for (let column = 0; column < 32; column++) {
            const x = left + Math.round((column + 0.5) * frameWidth / 64 - 0.5);
            const onLeft = isFrame(x, y);
            const onRight = isFrame(left + right - x, y);
            if (onLeft || onRight) occupied++;
            if (onLeft && onRight) matching++;
        }
    }
    return occupied >= 240 && matching / occupied >= 0.84;
}

/** @param {ImageData} pixels @param {number} minX @param {number} maxX */
function trimAboveTintedRims({ data, width, height }, minX, maxX) {
    const frameWidth = maxX - minX + 1;
    const center = Math.floor((minX + maxX) / 2);
    const minimumLensRun = frameWidth * 0.19;
    let firstLensRow = -1;
    let lastLensRow = -1;
    for (let y = 0; y < height; y++) {
        let run = 0;
        let leftRun = 0;
        let rightRun = 0;
        for (let x = minX; x <= maxX; x++) {
            const index = (y * width + x) * 4;
            if (x === center + 1) run = 0;
            const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
            run = data[index + 3] > 128 && brightness < 165 ? run + 1 : 0;
            if (x <= center) leftRun = Math.max(leftRun, run);
            else rightRun = Math.max(rightRun, run);
        }
        if (leftRun < minimumLensRun || rightRun < minimumLensRun) continue;
        if (firstLensRow < 0) firstLensRow = y;
        lastLensRow = y;
    }
    const lensHeight = lastLensRow - firstLensRow + 1;
    if (firstLensRow < 0 || lensHeight < frameWidth * 0.1) return;
    const upperRim = firstLensRow - Math.ceil(lensHeight * 0.35);
    for (let y = 0; y < upperRim; y++) {
        for (let x = minX; x <= maxX; x++) data[(y * width + x) * 4 + 3] = 0;
    }

    // Folded tips appear as dark marks in the upper outer area of each lens.
    // Use the tint from the same row to preserve vertical lens gradients.
    for (let y = firstLensRow + Math.ceil(lensHeight * 0.12); y <= lastLensRow - lensHeight * 0.12; y++) {
        for (const [outer, inner, step] of [[minX, center, 1], [maxX, center + 1, -1]]) {
            const row = [];
            for (let x = outer; x !== inner + step; x += step) {
                const index = (y * width + x) * 4;
                if (data[index + 3] > 128) row.push(index);
            }
            if (row.length < minimumLensRun) continue;
            const brightness = (index) => (data[index] + data[index + 1] + data[index + 2]) / 3;
            const samples = row.slice(Math.floor(row.length * 0.50), Math.floor(row.length * 0.78))
                .filter((index) => brightness(index) < 165)
                .sort((a, b) => brightness(a) - brightness(b));
            if (!samples.length) continue;
            const reference = samples[Math.floor(samples.length / 2)];
            const tint = brightness(reference);
            if (y <= firstLensRow + lensHeight * 0.65) {
                for (let position = Math.ceil(row.length * 0.14); position < row.length * 0.55; position++) {
                    const index = row[position];
                    const difference = tint - brightness(index);
                    if (difference < 14) continue;
                    const blend = Math.min(1, (difference - 14) / 16);
                    for (let channel = 0; channel < 3; channel++) {
                        data[index + channel] += (data[reference + channel] - data[index + channel]) * blend;
                    }
                }
            }

            // Feather the lens opacity inward and leave dark rims and reflections intact.
            const rowInset = Math.min(y - firstLensRow, lastLensRow - y) / lensHeight;
            for (let position = Math.ceil(row.length * 0.1); position < row.length * 0.9; position++) {
                const index = row[position];
                const columnInset = Math.min(position, row.length - 1 - position) / row.length;
                const distance = Math.max(
                    Math.abs(data[index] - data[reference]),
                    Math.abs(data[index + 1] - data[reference + 1]),
                    Math.abs(data[index + 2] - data[reference + 2]),
                );
                const feather = Math.max(0, Math.min(1, (Math.min(rowInset, columnInset) - 0.08) / 0.14));
                const similarity = Math.max(0, 1 - distance / 35);
                data[index + 3] *= 1 - 0.38 * feather * similarity;
            }
        }
    }
}

/** @param {string} imageUrl @param {boolean} [requireFront] @returns {Promise<Blob>} */
export const extractGlasses = (imageUrl, requireFront = false, maxSize = 1280) => {
    const cacheKey = JSON.stringify([imageUrl, requireFront, maxSize]);
    const cachedImage = extractedImages.get(cacheKey);
    if (cachedImage) return cachedImage;

    const extraction = (async () => {
        const sourceUrl = new URL(imageUrl);
        if (sourceUrl.searchParams.get("width") === "1280" && maxSize < 1280) {
            sourceUrl.searchParams.set("width", String(maxSize));
        }
        const response = await fetch(sourceUrl.href, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("Could not load product image");

        const bitmap = await createImageBitmap(await response.blob());
        const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);
        const source = typeof document === "undefined" ? new OffscreenCanvas(width, height) : document.createElement("canvas");
        source.width = width;
        source.height = height;

        const context = source.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Could not prepare product image");

        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const pixels = context.getImageData(0, 0, width, height);
        const originalBounds = getVisibleBounds(pixels);
        const transparentBackdrop = originalBounds.minX > 0 && originalBounds.minY > 0
            && originalBounds.maxX < width - 1 && originalBounds.maxY < height - 1;
        if (!transparentBackdrop) clearBackground(pixels);
        trimFloorReflection(pixels, getVisibleBounds(pixels));

        let { minX, minY, maxX, maxY } = getVisibleBounds(pixels);
        if (maxX < minX || maxY < minY) {
            throw new Error("No glasses found in product image");
        }
        const bounds = { minX, minY, maxX, maxY };
        if (hasRectangularBackdrop(pixels, bounds)) {
            throw new Error("Could not separate the frame from the product backdrop");
        }
        const crossedTemples = hasFoldedTemples(pixels, bounds);
        const hasMatchingLensOpenings = clearLensOpenings(pixels, minX, maxX);
        const symmetricFrame = !hasMatchingLensOpenings && hasSymmetricFrame(pixels, transparentBackdrop);
        if (requireFront && !hasMatchingLensOpenings && !symmetricFrame) {
            throw new Error("Could not verify a front-facing frame");
        }
        if (hasMatchingLensOpenings === null && (symmetricFrame || !requireFront)) {
            trimAboveTintedRims(pixels, minX, maxX);
        }

        // Clear lenses can show the same white backdrop as the outside of the
        // frame, even when rims or folded arms split it into separate areas.
        if (!transparentBackdrop) {
            for (let index = 0; index < pixels.data.length; index += 4) {
                const low = Math.min(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
                const high = Math.max(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
                if (low >= 242 && high - low <= 6) {
                    pixels.data[index + 3] = 0;
                }
            }
        }

        softenTemples(pixels, bounds, crossedTemples);
        ({ minX, minY, maxX, maxY } = getVisibleBounds(pixels));
        if (maxX < minX || maxY < minY) throw new Error("No glasses found after cleanup");
        context.putImageData(pixels, 0, 0);

        const padding = Math.round(Math.max(maxX - minX, maxY - minY) * 0.025);
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(width - 1, maxX + padding);
        maxY = Math.min(height - 1, maxY + padding);

        const crop = typeof document === "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
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

        if (typeof crop.convertToBlob === "function") return crop.convertToBlob({ type: "image/png" });
        return new Promise((resolve, reject) => {
            crop.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Could not export product image"));
            }, "image/png");
        });
    })();

    extractedImages.set(cacheKey, extraction);
    if (extractedImages.size > 100) {
        extractedImages.delete(extractedImages.keys().next().value);
    }
    void extraction.catch(() => extractedImages.delete(cacheKey));
    return extraction;
};

let workerPool;
let workerIndex = 0;

function createExtractionWorker() {
    const script = `
        import { extractGlasses } from ${JSON.stringify(import.meta.url)};
        self.onmessage = async ({ data: { id, args } }) => {
            try {
                self.postMessage({ id, overlay: await extractGlasses(...args) });
            } catch (error) {
                self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
            }
        };
    `;
    const url = URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
    try {
        const worker = new Worker(url, { type: "module" });
        const requests = new Map();
        let nextId = 0;
        let failed = false;
        worker.onmessage = ({ data: { id, overlay, error } }) => {
            const request = requests.get(id);
            requests.delete(id);
            if (error !== undefined) request?.reject(new Error(error));
            else request?.resolve(overlay);
        };
        worker.onerror = () => {
            failed = true;
            worker.terminate();
            for (const { resolve } of requests.values()) resolve(null);
            requests.clear();
        };
        return (...args) => new Promise((resolve, reject) => {
            if (failed) return resolve(null);
            const id = nextId++;
            requests.set(id, { resolve, reject });
            worker.postMessage({ id, args });
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function extractPreviewImage(...args) {
    if (workerPool === undefined) {
        workerPool = [];
        if (typeof Worker === "function" && typeof OffscreenCanvas === "function") {
            try {
                workerPool.push(createExtractionWorker());
                workerPool.push(createExtractionWorker());
            } catch {
                // Some storefront policies block module workers.
            }
        }
    }
    if (workerPool.length) {
        const overlay = await workerPool[workerIndex++ % workerPool.length](...args);
        if (overlay) return overlay;
        if (overlay === undefined) throw new Error("Could not extract a front-facing frame");
    }
    return extractGlasses(...args);
}

const frameJobs = new Map();
const preparedFrames = new Map();
const pendingFrames = [];
const MAX_ACTIVE_FRAMES = 4;
const PREVIEW_IMAGE_SIZE = 640;
const MAX_PREPARED_FRAMES = 100;
let activeFrames = 0;

function startPendingFrames() {
    while (activeFrames < MAX_ACTIVE_FRAMES && pendingFrames.length) {
        let next = 0;
        let priority = pendingFrames[0].priority();
        for (let index = 1; index < pendingFrames.length && priority > 0; index++) {
            const candidate = pendingFrames[index].priority();
            if (candidate < priority) {
                next = index;
                priority = candidate;
            }
        }
        const [{ run }] = pendingFrames.splice(next, 1);
        activeFrames++;
        // Let the storefront paint before doing pixel processing.
        setTimeout(() => {
            void run().finally(() => {
                activeFrames--;
                startPendingFrames();
            });
        }, 0);
    }
}

/**
 * @param {{ imageUrl: string; labeledFront: boolean }[]} candidates
 * @param {() => boolean} shouldContinue
 * @param {() => number} priority
 */
export function extractFrontGlasses(candidates, shouldContinue = () => true, priority = () => 1) {
    const key = JSON.stringify(candidates);
    const prepared = preparedFrames.get(key);
    if (prepared) return Promise.resolve(prepared);
    const existing = frameJobs.get(key);
    if (existing) {
        existing.consumers.set(shouldContinue, priority);
        return existing.result;
    }

    const consumers = new Map([[shouldContinue, priority]]);
    const stillNeeded = () => [...consumers.keys()].some((consumer) => consumer());
    const jobPriority = () => Math.min(Infinity, ...Array.from(consumers, ([needed, score]) => needed() ? score() : Infinity));
    const result = new Promise((resolve, reject) => {
        const run = async () => {
            try {
                const frame = await extractFrame(candidates, stillNeeded);
                if (frame) {
                    preparedFrames.set(key, frame);
                    if (preparedFrames.size > MAX_PREPARED_FRAMES) {
                        preparedFrames.delete(preparedFrames.keys().next().value);
                    }
                }
                resolve(frame);
            } catch (error) {
                reject(error);
            } finally {
                frameJobs.delete(key);
            }
        };
        pendingFrames.push({ run, priority: jobPriority });
    });
    frameJobs.set(key, { consumers, result });
    startPendingFrames();
    return result;
}

/**
 * @param {{ imageUrl: string; labeledFront: boolean }[]} candidates
 * @param {() => boolean} shouldContinue
 */
async function extractFrame(candidates, shouldContinue) {
    const failures = [];
    for (const size of [PREVIEW_IMAGE_SIZE, 1280]) {
        for (const { imageUrl, labeledFront } of candidates) {
            if (!shouldContinue()) return;
            try {
                return { imageUrl, overlay: await extractPreviewImage(imageUrl, !labeledFront, size) };
            } catch (error) {
                failures.push(new Error(`${imageUrl} (${size}px): ${error.message}`, { cause: error }));
            }
        }
    }
    throw new AggregateError(failures, "No front-facing product image could be prepared");
}
